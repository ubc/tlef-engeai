/**
 * Writing Feedback worker — in-process durable-job polling
 *
 * Starts a bounded polling loop around the existing Mongo job runner. The queue
 * stores only internal ids; each handler reloads sensitive records inside the
 * Writing Feedback boundary and relies on service-level privacy safeguards.
 *
 * @author: @rdschrs
 * @date: 2026-08-24
 * @version: 1.1.0
 * @description: Wires asynchronous Writing Feedback generation jobs at server startup.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { appLogger } from '../utils/logger';
import { MongoWritingFeedbackJobRunner } from './job-runner';
import { WritingFeedbackService } from './writing-feedback-service';

let workerStarted = false;

/**
 * startWritingFeedbackWorker - begins best-effort background polling.
 *
 * @param mongo - Connected Mongo façade used for leasing and generation handlers
 * @returns Stop function for tests or controlled shutdown
 */
export function startWritingFeedbackWorker(mongo: EngEAI_MongoDB): () => void {
    if (workerStarted || process.env.WRITING_FEEDBACK_WORKER_DISABLED === 'true') {
        return () => undefined;
    }
    workerStarted = true;

    const service = new WritingFeedbackService(mongo);
    const runner = new MongoWritingFeedbackJobRunner(mongo, {
        generate: async (job) => {
            // A failed attempt with retries left keeps the submission generating, so staff do not
            // see a failure the next attempt may clear. The last attempt marks it failed, whatever
            // went wrong.
            const lastAttempt = job.attempts >= job.maxAttempts;
            try {
                await service.generate(job.courseId, job.payload.submissionId, { markFailed: false });
            } catch (error) {
                if (lastAttempt) {
                    await mongo.setWritingSubmissionStatus(job.courseId, job.payload.submissionId, 'failed', ['generating']);
                }
                throw error;
            }
        },
        release: async (job) => {
            // The job carries only a submission id. Whose Canvas credential the write acts with
            // is reloaded from the release record inside the Writing Feedback boundary.
            await service.runQueuedRelease(job.courseId, job.payload.submissionId);
        }
    });
    const intervalMs = Number(process.env.WRITING_FEEDBACK_WORKER_INTERVAL_MS ?? 5000);
    let running = false;
    let stopped = false;

    const tick = async (): Promise<void> => {
        if (running) return;
        running = true;
        try {
            // Keep going while there is work, so a batch does not wait one interval per submission.
            // Jobs still run one at a time.
            while (!stopped && await runner.runNext()) { /* next job */ }
        } catch (error) {
            appLogger.warn('Writing Feedback worker tick failed', { error: error as Error });
        } finally {
            running = false;
        }
    };

    void tick();
    const timer = setInterval(() => { void tick(); }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5000);
    appLogger.info('Writing Feedback worker started');
    return () => {
        stopped = true;
        clearInterval(timer);
        workerStarted = false;
    };
}

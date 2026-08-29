/**
 * Writing Feedback worker — in-process durable-job polling
 *
 * Starts a bounded polling loop around the existing Mongo job runner. The queue
 * stores only internal ids; each handler reloads sensitive records inside the
 * Writing Feedback boundary and relies on service-level privacy safeguards.
 *
 * @author: @rdschrs
 * @date: 2026-08-24
 * @version: 1.0.0
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
            await service.generate(job.courseId, job.payload.submissionId);
        }
    });
    const intervalMs = Number(process.env.WRITING_FEEDBACK_WORKER_INTERVAL_MS ?? 5000);
    let running = false;

    const tick = async (): Promise<void> => {
        if (running) return;
        running = true;
        try {
            await runner.runNext();
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
        clearInterval(timer);
        workerStarted = false;
    };
}

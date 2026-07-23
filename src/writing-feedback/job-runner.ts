/**
 * Writing Feedback job runner — bounded leases with privacy-safe failure handling
 *
 * Polls Mongo for at most one leased job and dispatches it to an injected domain handler.
 * Mongo owns lease expiry and retry accounting; this runner guarantees completion/failure
 * transitions without persisting provider errors that may contain student content.
 *
 * @author: @rdschrs
 * @date: 2026-07-12
 * @version: 1.0.0
 * @description: Executes one leased Writing Feedback job with sanitized retry state.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { WritingFeedbackJobRunner, WritingJob } from './contracts';

type JobHandler = (job: WritingJob) => Promise<void>;

/**
 * Leases one job at a time. Handlers are deliberately injected so extraction,
 * generation, PDF, and Canvas tasks share a retry mechanism without hiding
 * their domain-specific authorization/release rules.
 */
export class MongoWritingFeedbackJobRunner implements WritingFeedbackJobRunner {
    /**
     * Creates a single-job runner with domain handlers and a bounded lease duration.
     *
     * @param mongo - Persistence façade that atomically leases and transitions jobs
     * @param handlers - Job-type implementations kept outside the queue mechanism
     * @param leaseMs - Lease duration; a job whose lease expires becomes reclaimable by another worker
     */
    constructor(
        private readonly mongo: EngEAI_MongoDB,
        private readonly handlers: Partial<Record<WritingJob['type'], JobHandler>>,
        private readonly leaseMs: number = 60_000
    ) {}

    /**
     * Leases and handles at most one queued job.
     *
     * @returns False when no job is available; true after a leased job reaches completion/failure
     */
    async runNext(): Promise<boolean> {
        // Atomic leasing prevents two workers from handling the same active attempt.
        const job = await this.mongo.leaseNextWritingJob(this.leaseMs);
        if (!job) return false;
        try {
            const handler = this.handlers[job.type];
            if (!handler) throw new Error('No registered writing-feedback job handler');
            await handler(job);
            // Mark completion only after the injected domain operation resolves.
            await this.mongo.completeWritingJob(job.id);
        } catch {
            // Persist only a generic failure; provider errors may contain submission content.
            await this.mongo.failWritingJob(job, 'Writing feedback job failed');
        }
        return true;
    }
}

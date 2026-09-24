/**
 * Writing Feedback worker tests
 *
 * Covers the generate handler's retry-aware failure marking.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-16
 * @version: 1.0.0
 * @description: Regression coverage for background generation job handling.
 */

import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import type { WritingJob } from '../contracts';

const generate = jest.fn();
let capturedHandlers: Record<string, (job: WritingJob) => Promise<void>> = {};

jest.mock('../writing-feedback-service', () => ({
    WritingFeedbackService: jest.fn().mockImplementation(() => ({ generate, runQueuedRelease: jest.fn() }))
}));
jest.mock('../job-runner', () => ({
    MongoWritingFeedbackJobRunner: jest.fn().mockImplementation((_mongo, handlers) => {
        capturedHandlers = handlers;
        return { runNext: jest.fn(async () => false) };
    })
}));

import { startWritingFeedbackWorker } from '../worker';

function job(attempts: number): WritingJob {
    return {
        id: 'job-1',
        courseId: 'course-1',
        type: 'generate',
        state: 'leased',
        attempts,
        maxAttempts: 3,
        payload: { submissionId: 'sub-1' },
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

describe('startWritingFeedbackWorker generate handler', () => {
    const mongo = { setWritingSubmissionStatus: jest.fn(async () => null) };
    let stop: () => void;

    beforeAll(() => {
        stop = startWritingFeedbackWorker(mongo as unknown as EngEAI_MongoDB);
    });
    afterAll(() => stop());
    beforeEach(() => {
        generate.mockReset();
        mongo.setWritingSubmissionStatus.mockClear();
    });

    it('never lets the service mark a failure itself', async () => {
        generate.mockResolvedValue({});
        await capturedHandlers.generate(job(1));
        expect(generate).toHaveBeenCalledWith('course-1', 'sub-1', { markFailed: false });
    });

    it('keeps the submission generating when a retry is still to come', async () => {
        generate.mockRejectedValue(new Error('rate limited'));
        await expect(capturedHandlers.generate(job(2))).rejects.toThrow('rate limited');
        expect(mongo.setWritingSubmissionStatus).not.toHaveBeenCalled();
    });

    it('marks the submission failed on the last attempt, whatever went wrong', async () => {
        generate.mockRejectedValue(new Error('Staff must verify the submission text before feedback generation'));
        await expect(capturedHandlers.generate(job(3))).rejects.toThrow();
        expect(mongo.setWritingSubmissionStatus).toHaveBeenCalledWith('course-1', 'sub-1', 'failed', ['generating']);
    });
});

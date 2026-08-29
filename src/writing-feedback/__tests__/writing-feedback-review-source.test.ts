/**
 * @fileoverview Source guard for frontend review copy where no DOM test layer exists.
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-review.ts'),
    'utf8'
);

describe('writing feedback review source contract', () => {
    it('labels retired rubric criteria without rendering internal ids', () => {
        const criterionLabel = source.match(/function criterionLabel[\s\S]*?\n}/)?.[0] ?? '';
        expect(source).toContain("?? 'Removed criterion'");
        expect(source).toContain('This criterion was removed after rubric v');
        expect(criterionLabel).not.toMatch(/\?\?\s*id/);
    });

    it('polls for generation results past the worker\'s worst-case retry budget', () => {
        // maxAttempts=3 with up to a 60s lease each (writing-feedback-service.ts,
        // writing-feedback-mongo.ts leaseNextWritingJob) means a job that fails once
        // and succeeds on retry can legitimately take past two minutes. A shorter
        // ceiling here throws a false "still running" error and stops the polling
        // that was keeping the staff session's idle timer alive.
        expect(source).toContain('const GENERATION_POLL_TIMEOUT_MS = 300_000;');
    });
});

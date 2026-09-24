/**
 * Transcript edit rules — which runs and revisions predate a text edit
 */

import type { StaffReviewRevision } from '../contracts';
import { reviewsSinceTextEdit, runPredatesTextEdit } from '../transcript-edit';

const edited = new Date('2026-09-17T12:00:00.000Z');
const review = (createdAt: string) => ({ id: createdAt, createdAt: new Date(createdAt) }) as unknown as StaffReviewRevision;

describe('runPredatesTextEdit', () => {
    it('is false for a never-edited submission or a missing run', () => {
        expect(runPredatesTextEdit({}, { createdAt: new Date('2026-01-01') })).toBe(false);
        expect(runPredatesTextEdit({ transcriptEditedAt: edited }, null)).toBe(false);
    });

    it('marks runs created up to the edit, not after it', () => {
        expect(runPredatesTextEdit({ transcriptEditedAt: edited }, { createdAt: new Date('2026-09-17T11:59:59Z') })).toBe(true);
        expect(runPredatesTextEdit({ transcriptEditedAt: edited }, { createdAt: edited })).toBe(true);
        expect(runPredatesTextEdit({ transcriptEditedAt: edited }, { createdAt: new Date('2026-09-17T12:00:01Z') })).toBe(false);
    });
});

describe('reviewsSinceTextEdit', () => {
    const reviews = [review('2026-09-17T11:00:00Z'), review('2026-09-17T13:00:00Z')];

    it('keeps every revision when the text was never edited', () => {
        expect(reviewsSinceTextEdit({ reviews })).toHaveLength(2);
    });

    it('keeps only revisions saved after the edit', () => {
        expect(reviewsSinceTextEdit({ transcriptEditedAt: edited, reviews }).map((item) => item.id))
            .toEqual(['2026-09-17T13:00:00Z']);
    });
});

/**
 * Annotation lens tests — two working sets over one document
 *
 * A lab report is annotated against two rubrics. The comments share a document and a set of
 * offsets but belong to different lenses, and one save carries both. These pin the partition
 * and the order, because a technical comment silently filed as linguistic would be read
 * against the wrong rubric's criterion ids.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for per-lens annotation working sets.
 */

import { getWorkingComments, initAnchorWorkingSet } from '../writing-feedback-anchors';
import type { AnchoredComment, SubmissionDetail } from '../writing-feedback-shared';

function comment(overrides: Partial<AnchoredComment>): AnchoredComment {
    return {
        id: 'comment-1',
        lens: 'linguistic',
        quote: 'a',
        startOffset: 0,
        endOffset: 1,
        comment: 'note',
        origin: 'staff',
        ...overrides
    };
}

function detail(comments: AnchoredComment[]): SubmissionDetail {
    return { comments, seedComments: [] } as unknown as SubmissionDetail;
}

describe('per-lens annotation working sets', () => {
    it('keeps each lens in its own set and returns both tagged', () => {
        initAnchorWorkingSet(detail([
            comment({ id: 'w1', lens: 'linguistic' }),
            comment({ id: 't1', lens: 'technical' })
        ]));

        const saved = getWorkingComments();

        expect(saved).toHaveLength(2);
        expect(saved.filter((c) => c.lens === 'technical').map((c) => c.id)).toEqual(['t1']);
        expect(saved.filter((c) => c.lens === 'linguistic').map((c) => c.id)).toEqual(['w1']);
    });

    it('orders technical comments first, so a lab report reads its marking scheme first', () => {
        initAnchorWorkingSet(detail([
            comment({ id: 'w1', lens: 'linguistic' }),
            comment({ id: 't1', lens: 'technical' })
        ]));

        expect(getWorkingComments().map((c) => c.id)).toEqual(['t1', 'w1']);
    });

    it('treats a stored comment with no lens as linguistic', () => {
        const legacy = comment({ id: 'legacy' });
        delete (legacy as Partial<AnchoredComment>).lens;
        initAnchorWorkingSet(detail([legacy]));

        expect(getWorkingComments()[0].lens).toBe('linguistic');
    });

    it('falls back to model seeds only when no staff comments were saved', () => {
        const seeds = [comment({ id: 'seed', lens: 'technical', origin: 'model_seed' })];
        initAnchorWorkingSet({ comments: [], seedComments: seeds } as unknown as SubmissionDetail);

        expect(getWorkingComments().map((c) => c.id)).toEqual(['seed']);
    });

    it('starts a new submission from an empty set in both lenses', () => {
        initAnchorWorkingSet(detail([comment({ id: 't1', lens: 'technical' })]));
        initAnchorWorkingSet(detail([]));

        expect(getWorkingComments()).toEqual([]);
    });
});

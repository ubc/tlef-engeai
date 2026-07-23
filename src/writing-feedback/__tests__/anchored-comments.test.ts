/**
 * Anchored comment tests — exact text offsets and revision safety
 *
 * Exercises model-seed placement, repeated-quote disambiguation, input limits,
 * stale-anchor detection, and validation against the authoritative verified text.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Regression coverage for persisted, UTF-16-offset feedback anchors.
 */

import {
    anchoredCommentInputSchema,
    anchoredCommentsInputSchema,
    seedCommentsFromRun,
    validateAnchoredComments,
    withStaleFlags
} from '../anchored-comments';
import type { AnchoredComment, WritingFeedbackRun } from '../contracts';

const verifiedText = 'First sample sentence. Second sample sentence. First sample sentence.';

function comment(overrides: Partial<AnchoredComment> = {}): AnchoredComment {
    return {
        id: 'comment-1',
        quote: 'First sample sentence.',
        startOffset: 0,
        endOffset: 22,
        comment: 'Consider how this opening orients the reader.',
        origin: 'staff',
        ...overrides
    };
}

function run(quotes: string[]): WritingFeedbackRun {
    return {
        id: 'run-1',
        courseId: 'course-1',
        assignmentId: 'assignment-1',
        submissionId: 'submission-1',
        profileVersion: 'test-profile',
        rubricVersion: 1,
        result: {
            criteria: [{
                criterion: 'organization',
                suggestedLevel: 'competent',
                evidence: quotes.map((quote) => ({ quote, rationale: 'Signals the text structure.' })),
                explanation: 'Sequencing is mostly clear.',
                confidence: 0.8
            }],
            strengths: [],
            revisionGoals: [],
            internalFlags: []
        },
        createdAt: new Date(),
        modelMetadata: { engine: 'test', promptVersion: 'test' }
    };
}

describe('anchoredCommentInputSchema', () => {
    it('accepts a complete valid comment', () => {
        const parsed = anchoredCommentInputSchema.safeParse({
            ...comment(),
            criterion: 'organization',
            howToImprove: 'Name the object before describing its parts.',
            courseMaterialLink: 'https://example.edu/lecture-3',
            glossaryDefinition: { term: 'theme', definition: 'The clause point of departure.' }
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects non-http(s) course material links', () => {
        const parsed = anchoredCommentInputSchema.safeParse({
            ...comment(),
            courseMaterialLink: 'ftp://example.edu/file'
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects an empty anchor span', () => {
        const parsed = anchoredCommentInputSchema.safeParse({ ...comment(), startOffset: 5, endOffset: 5 });
        expect(parsed.success).toBe(false);
    });

    it('rejects a missing origin', () => {
        const { origin: _origin, ...withoutOrigin } = comment();
        expect(anchoredCommentInputSchema.safeParse(withoutOrigin).success).toBe(false);
    });

    it('accepts optional matrix taxonomy tags', () => {
        const parsed = anchoredCommentInputSchema.safeParse({
            ...comment(),
            functionTag: 'organizational',
            levelTag: 'clause_word',
            priority: 'high'
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects invalid taxonomy values', () => {
        expect(anchoredCommentInputSchema.safeParse({ ...comment(), functionTag: 'organization' }).success).toBe(false);
        expect(anchoredCommentInputSchema.safeParse({ ...comment(), priority: 'urgent' }).success).toBe(false);
        expect(anchoredCommentInputSchema.safeParse({ ...comment(), levelTag: 'paragraph' }).success).toBe(false);
    });

    it('accepts anchor quotes longer than 500 characters (regression: long model-evidence seeds)', () => {
        const longQuote = 'a'.repeat(1500);
        const parsed = anchoredCommentInputSchema.safeParse(
            comment({ quote: longQuote, startOffset: 0, endOffset: longQuote.length })
        );
        expect(parsed.success).toBe(true);
    });

    it('still rejects anchor quotes beyond the 4000-character cap', () => {
        const tooLong = 'a'.repeat(4001);
        const parsed = anchoredCommentInputSchema.safeParse(
            comment({ quote: tooLong, startOffset: 0, endOffset: tooLong.length })
        );
        expect(parsed.success).toBe(false);
    });

    it('caps the working set at 50 comments', () => {
        const many = Array.from({ length: 51 }, (_, index) => comment({ id: `comment-${index}` }));
        expect(anchoredCommentsInputSchema.safeParse(many).success).toBe(false);
        expect(anchoredCommentsInputSchema.safeParse(many.slice(0, 50)).success).toBe(true);
    });
});

describe('seedCommentsFromRun', () => {
    it('computes offsets that slice back to the quote', () => {
        const seeds = seedCommentsFromRun(run(['Second sample sentence.']), verifiedText);
        expect(seeds).toHaveLength(1);
        expect(verifiedText.slice(seeds[0].startOffset, seeds[0].endOffset)).toBe('Second sample sentence.');
        expect(seeds[0].origin).toBe('model_seed');
        expect(seeds[0].criterion).toBe('organization');
    });

    it('advances past prior matches for duplicate quotes', () => {
        const seeds = seedCommentsFromRun(run(['First sample sentence.', 'First sample sentence.']), verifiedText);
        expect(seeds).toHaveLength(2);
        expect(seeds[0].startOffset).toBe(0);
        expect(seeds[1].startOffset).toBeGreaterThan(seeds[0].startOffset);
        expect(verifiedText.slice(seeds[1].startOffset, seeds[1].endOffset)).toBe('First sample sentence.');
    });

    it('maps rubric criterion to matrix function tag; never seeds level or priority', () => {
        const seeds = seedCommentsFromRun(run(['Second sample sentence.']), verifiedText);
        expect(seeds[0].functionTag).toBe('organizational');
        expect(seeds[0].levelTag).toBeUndefined();
        expect(seeds[0].priority).toBeUndefined();
    });

    it('skips quotes that are not present in the verified text', () => {
        const seeds = seedCommentsFromRun(run(['Absent sentence.', 'Second sample sentence.']), verifiedText);
        expect(seeds).toHaveLength(1);
        expect(seeds[0].quote).toBe('Second sample sentence.');
    });
});

describe('validateAnchoredComments', () => {
    it('accepts comments whose anchors match', () => {
        expect(() => validateAnchoredComments([comment()], verifiedText)).not.toThrow();
    });

    it('throws when the verified text drifted from the anchor', () => {
        expect(() => validateAnchoredComments([comment()], 'Rewritten text after re-verification.'))
            .toThrow('Feedback comments no longer match the verified text');
    });

    it('throws when offsets exceed the text length', () => {
        const outOfRange = comment({ startOffset: 500, endOffset: 522 });
        expect(() => validateAnchoredComments([outOfRange], verifiedText))
            .toThrow('Feedback comments no longer match the verified text');
    });
});

describe('withStaleFlags', () => {
    it('flags drifted comments without mutating the input', () => {
        const stored = [comment(), comment({ id: 'comment-2', quote: 'Missing quote.', startOffset: 0, endOffset: 14 })];
        const flagged = withStaleFlags(stored, verifiedText);
        expect(flagged[0].stale).toBeUndefined();
        expect(flagged[1].stale).toBe(true);
        expect((stored[1] as { stale?: boolean }).stale).toBeUndefined();
    });

    it('preserves taxonomy tags on fresh and stale copies', () => {
        const stored = [
            comment({ functionTag: 'interpersonal', levelTag: 'section', priority: 'medium' }),
            comment({ id: 'comment-2', quote: 'Missing quote.', startOffset: 0, endOffset: 14, priority: 'low' })
        ];
        const flagged = withStaleFlags(stored, verifiedText);
        expect(flagged[0].functionTag).toBe('interpersonal');
        expect(flagged[0].levelTag).toBe('section');
        expect(flagged[0].priority).toBe('medium');
        expect(flagged[1].priority).toBe('low');
        expect(flagged[1].stale).toBe(true);
    });
});

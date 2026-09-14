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
import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { approveRubricDraft } from '../rubric-schema';
import type { AnchoredComment, WritingFeedbackRun } from '../contracts';

const verifiedText = 'First sample sentence. Second sample sentence. First sample sentence.';

function comment(overrides: Partial<AnchoredComment> = {}): AnchoredComment {
    return {
        id: 'comment-1',
        lens: 'linguistic',
        quote: 'First sample sentence.',
        startOffset: 0,
        endOffset: 22,
        comment: 'Consider how this opening orients the reader.',
        origin: 'staff',
        ...overrides
    };
}

/** Distinct per-evidence rationales so the helper never trips seed de-duplication. */
const RATIONALES = [
    'Signals the text structure.',
    'Leaves the reader without a stated purpose.',
    'Names a source but not what it contributes.'
];

const REVISION_GUIDANCE = [
    'Add a sentence that names the sequence before moving into details.',
    'State the purpose this sentence should prepare the reader to follow.',
    'Explain what the named source contributes to the argument.'
];

function run(quotes: string[], criterion = 'organization'): WritingFeedbackRun {
    return {
        id: 'run-1',
        courseId: 'course-1',
        assignmentId: 'assignment-1',
        submissionId: 'submission-1',
        profileVersion: 'test-profile',
        rubricVersion: 1,
        result: {
            criteria: [{
                criterion,
                suggestedLevel: 'proficient',
                evidence: quotes.map((quote, index) => ({
                    quote,
                    rationale: RATIONALES[index % RATIONALES.length],
                    revisionGuidance: REVISION_GUIDANCE[index % REVISION_GUIDANCE.length]
                })),
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

/** One passage cited by two different criteria, which must anchor once per criterion. */
function twoCriterionRun(quote: string): WritingFeedbackRun {
    const base = run([quote], 'organization');
    base.result.criteria.push({
        criterion: 'content',
        suggestedLevel: 'proficient',
        evidence: [{
            quote,
            rationale: 'Also develops the subject matter.',
            revisionGuidance: 'Connect this detail to the specific concept the reader needs.'
        }],
        explanation: 'Development is uneven.',
        confidence: 0.7
    });
    return base;
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

    it('accepts optional function and language-level tags', () => {
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

    it('seeds model annotations with passage-specific revision guidance', () => {
        // The guidance comes from the evidence item, not criterion.explanation: copying
        // the broad criterion explanation onto every annotation was the old duplication bug.
        const seeds = seedCommentsFromRun(run(['First sample sentence.', 'Second sample sentence.']), verifiedText);
        expect(seeds).toHaveLength(2);
        expect(seeds[0].howToImprove).toBe(REVISION_GUIDANCE[0]);
        expect(seeds[1].howToImprove).toBe(REVISION_GUIDANCE[1]);
        seeds.forEach((seed) => expect(seed.howToImprove).not.toBe('Sequencing is mostly clear.'));
    });

    it('anchors a passage cited by two criteria once for each criterion', () => {
        // 'Second sample sentence.' occurs once in verifiedText. A search cursor shared
        // across criteria started the second lookup past it, so the second criterion's
        // annotation was dropped with no trace.
        const seeds = seedCommentsFromRun(twoCriterionRun('Second sample sentence.'), verifiedText);
        expect(seeds).toHaveLength(2);
        expect(seeds.map((seed) => seed.criterion)).toEqual(['organization', 'content']);
        seeds.forEach((seed) => {
            expect(verifiedText.slice(seed.startOffset, seed.endOffset)).toBe('Second sample sentence.');
        });
    });

    it('drops a later annotation that restates one already seeded', () => {
        // The writer may make the same point twice under two criteria. Every evidence item
        // becomes an annotation on the student PDF, so a restatement is read as two
        // separate pieces of advice.
        const restated = twoCriterionRun('Second sample sentence.');
        restated.result.criteria[0].evidence[0].rationale = 'The opening does not orient the reader to the purpose.';
        restated.result.criteria[1].evidence[0].rationale = 'The opening does not orient a reader to the purpose!';

        const seeds = seedCommentsFromRun(restated, verifiedText);

        expect(seeds).toHaveLength(1);
        expect(seeds[0].criterion).toBe('organization');
    });

    it('seeds one annotation per validated finding, whatever the wording', () => {
        // The live run linked finding F4 to both the content and the interpersonal criterion,
        // so one sentence carried two annotations whose wording differed too much for the
        // text similarity guard. One validated finding is one point about the text.
        const shared = twoCriterionRun('Second sample sentence.');
        shared.sflAnalysis = {
            findings: [{
                id: 'F4',
                primaryFunction: 'interpersonal',
                languageLevel: 'clause_word',
                evidence: [{ quote: 'Second sample sentence.' }],
                observation: 'Unqualified evaluation.',
                functionalInterpretation: 'Presents a contested claim as settled.'
            }]
        } as WritingFeedbackRun['sflAnalysis'];
        shared.result.criteria[0].evidence[0].sflFindingIds = ['F4'];
        shared.result.criteria[0].evidence[0].rationale = 'The claim is asserted without support.';
        shared.result.criteria[1].evidence[0].sflFindingIds = ['F4'];
        shared.result.criteria[1].evidence[0].rationale = 'A reader is directed to agree rather than shown evidence.';

        const seeds = seedCommentsFromRun(shared, verifiedText);

        expect(seeds).toHaveLength(1);
        expect(seeds[0].criterion).toBe('organization');
    });

    it('gives a shared finding to the criterion its function agrees with', () => {
        // When two criteria cite one finding, rubric order used to decide. That handed an
        // interpersonal finding to Content purely because Content is listed first, and left
        // Interpersonal Positioning — where the point belongs — with nothing.
        const shared = twoCriterionRun('Second sample sentence.');
        shared.result.criteria[1].criterion = 'interpersonal_positioning';
        shared.sflAnalysis = {
            findings: [{
                id: 'F4',
                primaryFunction: 'interpersonal',
                languageLevel: 'clause_word',
                evidence: [{ quote: 'Second sample sentence.' }],
                observation: 'Unqualified evaluation.',
                functionalInterpretation: 'Presents a contested claim as settled.'
            }]
        } as WritingFeedbackRun['sflAnalysis'];
        shared.result.criteria[0].evidence[0].sflFindingIds = ['F4'];
        shared.result.criteria[0].evidence[0].rationale = 'The claim is asserted without support.';
        shared.result.criteria[1].evidence[0].sflFindingIds = ['F4'];
        shared.result.criteria[1].evidence[0].rationale = 'A reader is directed to agree rather than shown evidence.';

        const seeds = seedCommentsFromRun(shared, verifiedText);

        expect(seeds).toHaveLength(1);
        expect(seeds[0].criterion).toBe('interpersonal_positioning');
        expect(seeds[0].functionTag).toBe('interpersonal');
    });

    it('keeps annotations that cite different findings on one passage', () => {
        const distinct = twoCriterionRun('Second sample sentence.');
        distinct.sflAnalysis = {
            findings: [
                {
                    id: 'F4',
                    primaryFunction: 'interpersonal',
                    languageLevel: 'clause_word',
                    evidence: [{ quote: 'Second sample sentence.' }],
                    observation: 'Unqualified evaluation.',
                    functionalInterpretation: 'Presents a contested claim as settled.'
                },
                {
                    id: 'F5',
                    primaryFunction: 'content',
                    languageLevel: 'section',
                    evidence: [{ quote: 'Second sample sentence.' }],
                    observation: 'Claim carries no source.',
                    functionalInterpretation: 'Leaves the reader unable to trace the claim.'
                }
            ]
        } as WritingFeedbackRun['sflAnalysis'];
        distinct.result.criteria[0].evidence[0].sflFindingIds = ['F5'];
        distinct.result.criteria[1].evidence[0].sflFindingIds = ['F4'];

        const seeds = seedCommentsFromRun(distinct, verifiedText);

        expect(seeds).toHaveLength(2);
    });

    it('keeps two distinct annotations on one passage', () => {
        // De-duplication reads the comment text only. Anchoring one passage once per
        // criterion is deliberate, so two genuinely different points must both survive.
        const seeds = seedCommentsFromRun(twoCriterionRun('Second sample sentence.'), verifiedText);

        expect(seeds).toHaveLength(2);
        expect(seeds.map((seed) => seed.comment)).toEqual([
            'Signals the text structure.',
            'Also develops the subject matter.'
        ]);
    });

    it('maps a legacy assignment-authored criterion to its function tag; never seeds level or priority', () => {
        const assignment = buildDefaultWritingAssignment(
            'course-1',
            'assignment-1',
            'Local writing assignment'
        );
        assignment.rubric = approveRubricDraft({
            ...assignment.rubric,
            criteria: [{
                id: 'analysis_depth',
                label: 'Analysis Depth',
                description: 'How completely the submission interprets its observations.',
                functionTag: 'content'
            }]
        }, 'instructor-1');

        const seeds = seedCommentsFromRun(
            run(['Second sample sentence.'], 'analysis_depth'),
            verifiedText,
            assignment.rubric
        );
        expect(seeds[0].functionTag).toBe('content');
        expect(seeds[0].levelTag).toBeUndefined();
        expect(seeds[0].priority).toBeUndefined();
    });

    it('uses the linked validated SFL finding for actual function and language-level filters', () => {
        const traced = run(['Second sample sentence.']);
        traced.result.criteria[0].evidence[0].sflFindingIds = ['finding-1'];
        traced.sflAnalysis = {
            schemaVersion: 'writing-feedback-sfl-analysis-v1',
            foundationVersion: 'test-foundation',
            profileGenreState: 'staff_confirmed',
            findings: [{
                id: 'finding-1',
                evidence: [{ quote: 'Second sample sentence.' }],
                observation: 'The sentence carries a local information-flow pattern.',
                functionalInterpretation: 'It organizes the section for the reader.',
                primaryFunction: 'organizational',
                crossFunctions: ['content'],
                languageLevel: 'section',
                ruleIds: ['O06'],
                sourceIds: ['test-source'],
                confidence: 0.9,
                alternatives: []
            }],
            abstentions: [],
            internalFlags: []
        };

        const seeds = seedCommentsFromRun(traced, verifiedText);
        expect(seeds[0]).toMatchObject({ functionTag: 'organizational', levelTag: 'section' });
    });

    it('prefers a linked finding whose function agrees with the criterion', () => {
        // Evidence may link up to six findings. Taking whichever id came first made the
        // annotation's label depend on writer ordering rather than on the passage.
        const traced = run(['Second sample sentence.']);
        traced.result.criteria[0].evidence[0].sflFindingIds = ['finding-organizational', 'finding-content'];
        traced.sflAnalysis = {
            schemaVersion: 'writing-feedback-sfl-analysis-v1',
            foundationVersion: 'test-foundation',
            profileGenreState: 'staff_confirmed',
            findings: [
                {
                    id: 'finding-organizational',
                    evidence: [{ quote: 'Second sample sentence.' }],
                    observation: 'The sentence sits at a section boundary.',
                    functionalInterpretation: 'It marks a shift between stages.',
                    primaryFunction: 'organizational',
                    crossFunctions: [],
                    languageLevel: 'section',
                    ruleIds: [],
                    sourceIds: [],
                    confidence: 0.8,
                    alternatives: []
                },
                {
                    id: 'finding-content',
                    evidence: [{ quote: 'Second sample sentence.' }],
                    observation: 'The sentence introduces a new participant.',
                    functionalInterpretation: 'It develops the subject matter.',
                    primaryFunction: 'content',
                    crossFunctions: [],
                    languageLevel: 'clause_word',
                    ruleIds: [],
                    sourceIds: [],
                    confidence: 0.9,
                    alternatives: []
                }
            ],
            abstentions: [],
            internalFlags: []
        };

        // The criterion is 'content', which agrees with finding-content — listed second.
        // Taking the first linked id would label this passage 'organizational' instead.
        traced.result.criteria[0].criterion = 'content';

        const seeds = seedCommentsFromRun(traced, verifiedText);
        expect(seeds[0]).toMatchObject({ functionTag: 'content', levelTag: 'clause_word' });
    });

    it('leaves an annotation untagged when no linked finding agrees with its criterion', () => {
        // A live run labelled both Content annotations "Interpersonal" because their linked
        // findings were interpersonal. A chip that contradicts the criterion it sits under
        // reads as a bug to staff; the language level is still the finding's own.
        const traced = run(['Second sample sentence.']);
        traced.result.criteria[0].criterion = 'content';
        traced.result.criteria[0].evidence[0].sflFindingIds = ['finding-interpersonal'];
        traced.sflAnalysis = {
            schemaVersion: 'writing-feedback-sfl-analysis-v1',
            foundationVersion: 'test-foundation',
            profileGenreState: 'staff_confirmed',
            findings: [{
                id: 'finding-interpersonal',
                evidence: [{ quote: 'Second sample sentence.' }],
                observation: 'The claim is asserted as self-evident.',
                functionalInterpretation: 'It directs the reader to agree.',
                primaryFunction: 'interpersonal',
                crossFunctions: [],
                languageLevel: 'clause_word',
                ruleIds: [],
                sourceIds: [],
                confidence: 0.9,
                alternatives: []
            }],
            abstentions: [],
            internalFlags: []
        };

        const seeds = seedCommentsFromRun(traced, verifiedText);

        expect(seeds).toHaveLength(1);
        expect(seeds[0].functionTag).toBeUndefined();
        expect(seeds[0].levelTag).toBe('clause_word');
    });

    it('leaves a traced run untagged when its evidence resolves to no finding', () => {
        // The analyzer ran and this passage still traced to nothing, so the criterion's
        // metafunction would be a guess presented to staff as fact.
        const traced = run(['Second sample sentence.']);
        traced.result.criteria[0].evidence[0].sflFindingIds = [];
        traced.sflAnalysis = {
            schemaVersion: 'writing-feedback-sfl-analysis-v1',
            foundationVersion: 'test-foundation',
            profileGenreState: 'staff_confirmed',
            findings: [],
            abstentions: [],
            internalFlags: []
        };

        const seeds = seedCommentsFromRun(traced, verifiedText);
        expect(seeds[0].functionTag).toBeUndefined();
        expect(seeds[0].levelTag).toBeUndefined();
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

describe('anchored comment lens', () => {
    it('reads a stored comment with no lens as linguistic', () => {
        const { lens, ...withoutLens } = comment();
        const parsed = anchoredCommentInputSchema.safeParse(withoutLens);
        expect(parsed.success).toBe(true);
        expect(parsed.success && parsed.data.lens).toBe('linguistic');
    });

    it('keeps an explicit technical lens', () => {
        const parsed = anchoredCommentInputSchema.safeParse({ ...comment(), lens: 'technical' });
        expect(parsed.success && parsed.data.lens).toBe('technical');
    });

    it('rejects a lens that is neither', () => {
        const parsed = anchoredCommentInputSchema.safeParse({ ...comment(), lens: 'rhetorical' });
        expect(parsed.success).toBe(false);
    });
});

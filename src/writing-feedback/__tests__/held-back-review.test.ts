/**
 * @fileoverview Held-back review state: whole-text problem runs seed held-back comments; the
 * revision payload accepts heldBack and overall-message edits; the staff hold-back choice
 * lives as long as its generation; old runs seed nothing held back.
 */

import type { StaffReviewRevision, WritingFeedbackRun, WritingSubmission } from '../contracts';
import { anchoredCommentInputSchema, seedCommentsFromRun } from '../anchored-comments';
import { summaryEditsInputSchema } from '../summary-edits';
import { latestHoldBackChoice } from '../writing-feedback-service';

const text = 'Sound happens when an object vibrates. First, the object pushes the air.';

function run(gateDecision?: 'standard' | 'global_revision'): WritingFeedbackRun {
    return {
        id: 'run-1', courseId: 'c', assignmentId: 'a', submissionId: 's', profileVersion: 'p', rubricVersion: 1,
        createdAt: new Date(), modelMetadata: { engine: 'e', promptVersion: 'v' },
        ...(gateDecision ? { gateDecision } : {}),
        result: {
            criteria: [{ criterion: 'content', suggestedLevel: 'weak', explanation: 'e', confidence: 0.5, evidence: [{ quote: 'Sound happens when an object vibrates.', rationale: 'r' }] }],
            strengths: [], revisionGoals: [{ skillTag: 's', goal: 'g', action: 'a' }], internalFlags: [],
            ...(gateDecision ? { gateDecision } : {})
        }
    } as WritingFeedbackRun;
}

describe('held-back seeds', () => {
    it('holds back every seed of a whole-text problem run', () => {
        expect(seedCommentsFromRun(run('global_revision'), text).every((seed) => seed.heldBack === true)).toBe(true);
    });

    it('holds back nothing on a standard run or a run stored before the gate', () => {
        expect(seedCommentsFromRun(run('standard'), text).some((seed) => seed.heldBack)).toBe(false);
        expect(seedCommentsFromRun(run(), text).some((seed) => seed.heldBack)).toBe(false);
    });
});

describe('revision payload schemas', () => {
    it('accepts heldBack on a comment', () => {
        const parsed = anchoredCommentInputSchema.parse({
            id: 'c1', quote: 'Sound', startOffset: 0, endOffset: 5, comment: 'x', origin: 'model_seed', heldBack: true
        });
        expect(parsed.heldBack).toBe(true);
    });

    it('accepts overall-message edits on the linguistic lens only', () => {
        const edit = { feedbackRunId: 'run-1', strengths: [], criterionExplanations: [], overallMessage: 'Keep your topic.' };
        expect(summaryEditsInputSchema.safeParse([{ ...edit, lens: 'linguistic' }]).success).toBe(true);
        expect(summaryEditsInputSchema.safeParse([{ ...edit, lens: 'technical' }]).success).toBe(false);
    });
});


describe('latestHoldBackChoice', () => {
    const review = (createdAt: string, holdBackAnnotations?: boolean) =>
        ({ id: createdAt, createdAt: new Date(createdAt), ...(holdBackAnnotations !== undefined ? { holdBackAnnotations } : {}) }) as unknown as StaffReviewRevision;

    it('keeps the newest choice when a later revision sets none', () => {
        const submission = { reviews: [review('2026-09-01', true), review('2026-09-02', false), review('2026-09-03')] } as unknown as WritingSubmission;
        expect(latestHoldBackChoice(submission)).toBe(false);
    });

    it('has no choice when staff never changed the checkbox', () => {
        const submission = { reviews: [review('2026-09-01'), review('2026-09-02')] } as unknown as WritingSubmission;
        expect(latestHoldBackChoice(submission)).toBeUndefined();
    });

    it('forgets choices made before the text was edited', () => {
        const submission = { transcriptEditedAt: new Date('2026-09-05'), reviews: [review('2026-09-02', false)] } as unknown as WritingSubmission;
        expect(latestHoldBackChoice(submission)).toBeUndefined();
    });
});

describe('seeded citation provenance', () => {
    it('carries the supporting excerpt id so the review page can check the citation', () => {
        const cited = run('standard');
        cited.result.criteria[0].evidence[0] = {
            ...cited.result.criteria[0].evidence[0],
            supportingExcerptId: 'f1',
            courseMaterialMention: { id: 'm1', label: 'Week 2 · Lecture · Definitions' }
        };
        const [seed] = seedCommentsFromRun(cited, text);
        expect(seed.supportingExcerptId).toBe('f1');
        expect(anchoredCommentInputSchema.parse({ ...seed }).supportingExcerptId).toBe('f1');
    });
});

describe('hold-back choice lifetime', () => {
    const submission = { reviews: [{ id: 'r', createdAt: new Date('2026-09-02'), holdBackAnnotations: false }] } as unknown as WritingSubmission;

    it('drops a choice saved against earlier feedback once feedback is regenerated', () => {
        const regenerated = { createdAt: new Date('2026-09-03') } as WritingFeedbackRun;
        expect(latestHoldBackChoice(submission, regenerated)).toBeUndefined();
    });

    it('keeps the choice across a summary redraft of the same generation', () => {
        const redraft = { createdAt: new Date('2026-09-04'), generatedAt: new Date('2026-09-01'), redraftOfRunId: 'run-1' } as WritingFeedbackRun;
        expect(latestHoldBackChoice(submission, redraft)).toBe(false);
    });
});

describe('hold-back choice stored as null', () => {
    it('ignores a null left by a save that made no choice', () => {
        const submission = { reviews: [
            { id: 'a', createdAt: new Date('2026-09-01'), holdBackAnnotations: false },
            { id: 'b', createdAt: new Date('2026-09-02'), holdBackAnnotations: null }
        ] } as unknown as WritingSubmission;
        expect(latestHoldBackChoice(submission)).toBe(false);
    });
});

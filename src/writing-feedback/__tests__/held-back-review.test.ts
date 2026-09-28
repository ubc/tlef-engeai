/**
 * @fileoverview Held-back review state: global runs seed held-back comments; the
 * revision payload accepts heldBack, modeOverride and global-block edits; old runs seed
 * nothing held back.
 */

import type { StaffReviewRevision, WritingFeedbackRun, WritingSubmission } from '../contracts';
import { anchoredCommentInputSchema, seedCommentsFromRun } from '../anchored-comments';
import { summaryEditsInputSchema } from '../summary-edits';
import { latestModeOverride } from '../writing-feedback-service';

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
    it('holds back every seed of a global-revision run', () => {
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

    it('accepts global-block edits on the linguistic lens only', () => {
        const edit = { feedbackRunId: 'run-1', strengths: [], criterionExplanations: [], globalRevision: { diagnosisStatement: 'd', whatToKeep: ['k'], rewriteDirection: 'r' } };
        expect(summaryEditsInputSchema.safeParse([{ ...edit, lens: 'linguistic' }]).success).toBe(true);
        expect(summaryEditsInputSchema.safeParse([{ ...edit, lens: 'technical' }]).success).toBe(false);
    });
});


describe('latestModeOverride', () => {
    const review = (createdAt: string, modeOverride?: 'standard' | 'global_revision') =>
        ({ id: createdAt, createdAt: new Date(createdAt), ...(modeOverride ? { modeOverride } : {}) }) as unknown as StaffReviewRevision;

    it('keeps the newest override when a later revision sets none', () => {
        const submission = { reviews: [review('2026-09-01', 'standard'), review('2026-09-02', 'global_revision'), review('2026-09-03')] } as unknown as WritingSubmission;
        expect(latestModeOverride(submission)).toBe('global_revision');
    });

    it('forgets overrides made before the text was edited', () => {
        const submission = { transcriptEditedAt: new Date('2026-09-05'), reviews: [review('2026-09-02', 'standard')] } as unknown as WritingSubmission;
        expect(latestModeOverride(submission)).toBeUndefined();
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

describe('mode override lifetime', () => {
    const review = (createdAt: string, modeOverride: 'standard' | 'global_revision') =>
        ({ id: createdAt, createdAt: new Date(createdAt), modeOverride }) as unknown as StaffReviewRevision;
    const submission = { reviews: [review('2026-09-02', 'global_revision')] } as unknown as WritingSubmission;

    it('drops an override saved against earlier feedback once feedback is regenerated', () => {
        const regenerated = { createdAt: new Date('2026-09-03') } as WritingFeedbackRun;
        expect(latestModeOverride(submission, regenerated)).toBeUndefined();
    });

    it('keeps the override across a summary redraft of the same generation', () => {
        const redraft = { createdAt: new Date('2026-09-04'), generatedAt: new Date('2026-09-01'), redraftOfRunId: 'run-1' } as WritingFeedbackRun;
        expect(latestModeOverride(submission, redraft)).toBe('global_revision');
    });
});

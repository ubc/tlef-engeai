/**
 * @fileoverview Writer guards: citations need an allowed, published supporting excerpt;
 * strengths may not praise genre-contradicting language; the schema requires actions.
 */

import type { TextDiagnosis, WritingFeedbackResult } from '../contracts';
import type { GroundingExcerpt } from '../course-material-mentions';
import {
    applyExcerptCitations,
    applyGlobalExcerptCitations,
    buildFeedbackSchema,
    guardStrengths,
    STRENGTH_DROPPED_FLAG
} from '../feedback-schema';
import { modelAssessedCriteria } from '../criterion-assessment';
import { buildEvalAssignment } from './fixtures/eval/eval-fixtures';

const mention = { id: 'm1', label: 'Week 2 · Lecture · Writing formal definitions' };
const excerpts = new Map<string, GroundingExcerpt>([
    ['w1', { id: 'w1', text: 'Definitions: class + features.', needIds: ['finding:a'], score: 1, published: true, mention }],
    ['w2', { id: 'w2', text: 'Unpublished.', needIds: ['finding:a'], score: 1, published: false }]
]);

function result(evidence: Array<Record<string, unknown>>): WritingFeedbackResult {
    return {
        criteria: [{ criterion: 'content', suggestedLevel: 'developing', evidence: evidence as never, explanation: 'e', confidence: 0.6 }],
        strengths: [],
        revisionGoals: [{ skillTag: 'identify', goal: 'g', action: 'a' }],
        internalFlags: []
    };
}

describe('applyExcerptCitations', () => {
    it('keeps an allowed published excerpt and derives the mention from it', () => {
        const draft = result([{ quote: 'q', rationale: 'r', sflFindingIds: ['F1'], supportingExcerptId: 'w1' }]);
        const dropped = applyExcerptCitations(draft, new Map([['F1', new Set(['w1', 'w2'])]]), excerpts);
        expect(dropped).toBe(0);
        expect(draft.criteria[0].evidence[0].courseMaterialMention).toEqual(mention);
    });

    it('drops a citation whose excerpt was not judged to support that finding', () => {
        const draft = result([{ quote: 'q', rationale: 'r', sflFindingIds: ['F2'], supportingExcerptId: 'w1', courseMaterialMention: mention }]);
        expect(applyExcerptCitations(draft, new Map([['F1', new Set(['w1'])]]), excerpts)).toBe(1);
        expect(draft.criteria[0].evidence[0].supportingExcerptId).toBeUndefined();
        expect(draft.criteria[0].evidence[0].courseMaterialMention).toBeUndefined();
    });

    it('drops a citation to unpublished material even when allowed', () => {
        const draft = result([{ quote: 'q', rationale: 'r', sflFindingIds: ['F1'], supportingExcerptId: 'w2' }]);
        expect(applyExcerptCitations(draft, new Map([['F1', new Set(['w2'])]]), excerpts)).toBe(1);
    });

    it('never keeps a mention the writer supplied without an excerpt id', () => {
        const draft = result([{ quote: 'q', rationale: 'r', sflFindingIds: ['F1'], courseMaterialMention: mention }]);
        applyExcerptCitations(draft, new Map([['F1', new Set(['w1'])]]), excerpts);
        expect(draft.criteria[0].evidence[0].courseMaterialMention).toBeUndefined();
    });

    it('filters global-block citations to supported published excerpts', () => {
        const draft = { ...result([]), globalRevision: { diagnosisStatement: 'd', whatToKeep: [], rewriteDirection: 'r', supportingExcerptIds: ['w1', 'w2', 'nope'] } };
        applyGlobalExcerptCitations(draft, new Set(['w1', 'w2']), excerpts);
        expect(draft.globalRevision.supportingExcerptIds).toEqual(['w1']);
    });
});

describe('guardStrengths', () => {
    const diagnosis: TextDiagnosis = {
        realizedGenre: 'explanation',
        genreFit: 'mismatch',
        stages: [],
        contradictingFeatures: [{ quote: 'First, the object pushes the air.', note: 'temporal' }],
        transferableStrengths: [{ text: 'Sound is an excellent entity to classify.' }],
        rationale: 'r'
    };

    it('drops a strength quoting a contradicting feature and flags it', () => {
        const draft = { ...result([]), strengths: ['Clear sequencing in "First, the object pushes the air."', 'Accurate terms.'] };
        const flags = guardStrengths(draft, diagnosis, 'standard');
        expect(draft.strengths).toEqual(['Accurate terms.']);
        expect(flags).toEqual([STRENGTH_DROPPED_FLAG]);
    });

    it('in global mode keeps only transferable strengths, falling back to the diagnosis', () => {
        const draft = { ...result([]), strengths: ['Good use of temporal markers.'] };
        guardStrengths(draft, diagnosis, 'global_revision');
        expect(draft.strengths).toEqual(['Sound is an excellent entity to classify.']);
    });
});

describe('buildFeedbackSchema', () => {
    const rubric = buildEvalAssignment().rubric;
    const schema = buildFeedbackSchema(rubric);
    const base = {
        criteria: modelAssessedCriteria(rubric).map((criterion) => ({
            criterion: criterion.id,
            suggestedLevel: rubric.levels[0].id,
            evidence: [{ quote: 'q', rationale: 'r', revisionGuidance: 'g', supportingExcerptId: null }],
            explanation: 'e',
            confidence: 0.5
        })),
        strengths: [],
        revisionGoals: [{ skillTag: 'identify', goal: 'g', action: 'Add a class word.', guidedQuestion: 'What group does it belong to?', questionScope: 'whole' }],
        internalFlags: [],
        globalRevision: { diagnosisStatement: 'd', whatToKeep: [], rewriteDirection: 'r', guidedQuestion: 'What does the genre ask?', supportingExcerptIds: null }
    };

    it('accepts a goal with an action, a question and a scope', () => {
        expect(schema.safeParse(base).success).toBe(true);
    });

    it('rejects a goal with no question (D-153)', () => {
        expect(schema.safeParse({ ...base, revisionGoals: [{ ...base.revisionGoals[0], guidedQuestion: null }] }).success).toBe(false);
    });

    it('rejects a goal without an action', () => {
        expect(schema.safeParse({ ...base, revisionGoals: [{ skillTag: 's', goal: 'g', guidedQuestion: 'q' }] }).success).toBe(false);
    });

    it('requires the global block', () => {
        const { globalRevision, ...withoutGlobal } = base;
        void globalRevision;
        expect(schema.safeParse(withoutGlobal).success).toBe(false);
    });
});

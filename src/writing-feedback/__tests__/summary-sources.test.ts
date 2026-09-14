import {
    applySummaryToResult,
    bindingStudentFeedback,
    bindingSummaryEdit,
    buildRedraftRun,
    evidenceFromComments,
    resolveLensComments
} from '../summary-sources';
import type { AnchoredComment, StaffReviewRevision, WritingFeedbackRun } from '../contracts';

function comment(overrides: Partial<AnchoredComment>): AnchoredComment {
    return {
        id: 'c1', lens: 'linguistic', criterion: 'content', quote: 'A quoted passage', startOffset: 0,
        endOffset: 16, comment: 'Name the claim.', origin: 'staff', ...overrides
    };
}

function run(overrides: Partial<WritingFeedbackRun> = {}): WritingFeedbackRun {
    return {
        id: 'run-1', courseId: 'course-1', assignmentId: 'assignment-1', submissionId: 'submission-1',
        profileVersion: 'p', rubricVersion: 2, lens: 'linguistic',
        result: {
            criteria: [
                { criterion: 'content', suggestedLevel: 'developing', evidence: [{ quote: 'model quote', rationale: 'model rationale' }], explanation: 'Model explanation.', confidence: 0.6 },
                { criterion: 'organization', suggestedLevel: 'proficient', evidence: [], explanation: 'Organization explanation.', confidence: 0.7 }
            ],
            strengths: ['Model strength.'],
            revisionGoals: [{ skillTag: 'content', goal: 'Goal.', guidedQuestion: 'Question?' }],
            internalFlags: ['staff-only flag'],
            courseMaterialMentions: [{ id: 'm1', label: 'Week 1 · Lecture 1' }]
        },
        createdAt: new Date('2026-09-13T10:00:00.000Z'),
        modelMetadata: { engine: 'RubricWritingFeedbackEngine', promptVersion: 'writing-feedback-v2' },
        sflAnalysis: { schemaVersion: 's', foundationVersion: 'f', profileGenreState: 'custom', findings: [], abstentions: [], internalFlags: [] },
        ...overrides
    };
}

describe('resolveLensComments', () => {
    const seeds = [comment({ id: 'seed', origin: 'model_seed' })];

    it('prefers a redraft newer than the saved revision', () => {
        const redraft = run({ createdAt: new Date('2026-09-13T12:00:00.000Z'), sourceComments: [comment({ id: 'from-redraft' })] });
        const result = resolveLensComments('linguistic', {
            revision: { comments: [comment({ id: 'saved' })], createdAt: new Date('2026-09-13T11:00:00.000Z') },
            run: redraft,
            seeds
        }, { includeSeeds: true });
        expect(result.origin).toBe('redraft');
        expect(result.comments.map((item) => item.id)).toEqual(['from-redraft']);
    });

    it('keeps a saved revision newer than the redraft, filtered to the lens', () => {
        const redraft = run({ createdAt: new Date('2026-09-13T10:00:00.000Z'), sourceComments: [comment({ id: 'from-redraft' })] });
        const result = resolveLensComments('linguistic', {
            revision: {
                comments: [comment({ id: 'saved' }), comment({ id: 'tech', lens: 'technical' })],
                createdAt: new Date('2026-09-13T11:00:00.000Z')
            },
            run: redraft,
            seeds
        }, { includeSeeds: true });
        expect(result.origin).toBe('revision');
        expect(result.comments.map((item) => item.id)).toEqual(['saved']);
    });

    it('falls back to seeds only when asked', () => {
        expect(resolveLensComments('linguistic', { run: run(), seeds }, { includeSeeds: true }).origin).toBe('seed');
        expect(resolveLensComments('linguistic', { run: run(), seeds }, { includeSeeds: false })).toEqual({ comments: [], origin: 'none' });
    });
});

describe('binding rules', () => {
    const review = {
        id: 'r1', submissionId: 's', feedbackRunId: 'run-1', staffUserId: 'u', studentFeedback: 'Staff goals', createdAt: new Date(),
        summaryEdits: [{ lens: 'linguistic', feedbackRunId: 'run-1', strengths: ['Edited.'], criterionExplanations: [] }]
    } as StaffReviewRevision;

    it('applies edits and student feedback only to the run they were written against', () => {
        expect(bindingSummaryEdit(review, 'linguistic', 'run-1')?.strengths).toEqual(['Edited.']);
        expect(bindingSummaryEdit(review, 'linguistic', 'run-2')).toBeUndefined();
        expect(bindingSummaryEdit(review, 'technical', 'run-1')).toBeUndefined();
        expect(bindingStudentFeedback(review, 'run-1')).toBe('Staff goals');
        expect(bindingStudentFeedback(review, 'run-2')).toBeUndefined();
    });
});

describe('applySummaryToResult', () => {
    it('rebuilds evidence from comments per criterion in text order and applies edits', () => {
        const comments = [
            comment({ id: 'b', startOffset: 40, endOffset: 50, quote: 'later text', comment: 'Second.' }),
            comment({ id: 'a', startOffset: 5, endOffset: 15, quote: 'early text', comment: 'First.', howToImprove: 'Do this.' }),
            comment({ id: 'x', criterion: undefined, quote: 'no criterion' })
        ];
        const applied = applySummaryToResult(run().result, {
            comments,
            edit: { lens: 'linguistic', feedbackRunId: 'run-1', strengths: ['Staff strength.'], criterionExplanations: [{ criterion: 'content', explanation: 'Staff explanation.' }] }
        });

        expect(applied.strengths).toEqual(['Staff strength.']);
        const content = applied.criteria.find((item) => item.criterion === 'content')!;
        expect(content.explanation).toBe('Staff explanation.');
        expect(content.suggestedLevel).toBe('developing');
        expect(content.evidence).toEqual([
            { quote: 'early text', rationale: 'First.', revisionGuidance: 'Do this.' },
            { quote: 'later text', rationale: 'Second.' }
        ]);
        expect(applied.criteria.find((item) => item.criterion === 'organization')!.evidence).toEqual([]);
        expect(applied.internalFlags).toEqual(['staff-only flag']);
    });

    it('keeps model evidence when no comments are supplied', () => {
        expect(applySummaryToResult(run().result, {}).criteria[0].evidence[0].quote).toBe('model quote');
    });

    it('evidenceFromComments carries material and glossary fields', () => {
        const [item] = evidenceFromComments([comment({
            courseMaterialMention: { id: 'm1', label: 'Week 1' },
            glossaryEntryId: 'g1',
            glossarySnapshot: { id: 'g1', term: 'Hedge', definition: 'Softening.', version: 1 }
        })], 'content');
        expect(item.courseMaterialMention?.label).toBe('Week 1');
        expect(item.glossarySnapshot?.term).toBe('Hedge');
    });
});

describe('buildRedraftRun', () => {
    it('copies provenance, stores the source annotations, and never copies the Mongo _id', () => {
        const previous = { ...run(), _id: 'mongo-object-id' } as WritingFeedbackRun & { _id: string };
        const comments = [comment({ id: 'a' })];
        const built = buildRedraftRun(previous, {
            criteria: [
                { criterion: 'content', suggestedLevel: 'proficient', explanation: 'Redrafted.', confidence: 0.8 },
                { criterion: 'organization', suggestedLevel: 'proficient', explanation: 'Org.', confidence: 0.7 }
            ],
            strengths: ['New strength.'],
            revisionGoals: [{ skillTag: 'content', goal: 'New goal.', guidedQuestion: 'New question?' }]
        }, comments, 'abcd1234', 'LlmSummaryRedraftEngine');

        expect('_id' in built).toBe(false);
        expect('id' in built).toBe(false);
        expect(built.redraftOfRunId).toBe('run-1');
        expect(built.sourceComments).toEqual(comments);
        expect(built.annotationsFingerprint).toBe('abcd1234');
        expect(built.rubricVersion).toBe(2);
        expect(built.lens).toBe('linguistic');
        expect(built.sflAnalysis).toEqual(previous.sflAnalysis);
        expect(built.modelMetadata).toEqual({ engine: 'LlmSummaryRedraftEngine', promptVersion: 'summary-redraft-v1' });
        expect(built.result.criteria[0]).toEqual({
            criterion: 'content', suggestedLevel: 'proficient', explanation: 'Redrafted.', confidence: 0.8,
            evidence: [{ quote: 'A quoted passage', rationale: 'Name the claim.' }]
        });
        expect(built.result.internalFlags).toEqual(['staff-only flag']);
        expect(built.result.courseMaterialMentions).toEqual([{ id: 'm1', label: 'Week 1 · Lecture 1' }]);
    });
});

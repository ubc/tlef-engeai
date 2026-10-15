/**
 * @fileoverview Coverage service: recompute stores rows keyed by rubric version and
 * material fingerprint; reads report staleness; no approved rubric is refused.
 */

import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import type { WritingAssignment, WritingFeedbackEngine } from '../contracts';
import { courseMaterialFingerprint } from '../material-coverage';
import { WritingFeedbackService } from '../writing-feedback-service';
import { buildEvalAssignment } from './fixtures/eval/eval-fixtures';

const course = {
    topicOrWeekInstances: [{ id: 't1', published: true, items: [{ id: 'i1', updatedAt: new Date('2026-09-01'), additionalMaterials: [] }] }]
};
const mention = { id: 'note-reports', label: 'Week 3 · Lecture · Descriptive reports' };

function setup(assignment: WritingAssignment) {
    const mongo = {
        getWritingAssignment: jest.fn(async () => assignment),
        getActiveCourse: jest.fn(async () => course),
        setWritingAssignmentMaterialCoverage: jest.fn(async () => undefined)
    };
    const engine = {
        generate: jest.fn(),
        computeGenreGrounding: jest.fn(async () => ({
            needs: [{ id: 'stage:classify', kind: 'stage', label: 'Classification or composition', query: 'q', stageId: 'classify' }],
            retrieval: { excerpts: [{ id: 'g1', text: 't', needIds: ['stage:classify'], score: 1, published: true, mention }], failed: false },
            supported: new Map([['stage:classify', new Set(['g1'])]]),
            relevanceFailed: false
        }))
    } as unknown as WritingFeedbackEngine;
    return { mongo, service: new WritingFeedbackService(mongo as unknown as EngEAI_MongoDB, engine) };
}

describe('material coverage service', () => {
    it('recomputes and stores coverage keyed by rubric version and fingerprint', async () => {
        const assignment = buildEvalAssignment();
        const { mongo, service } = setup(assignment);
        const coverage = await service.recomputeMaterialCoverage('eval-course', assignment.id);
        expect(coverage.rubricVersion).toBe(assignment.rubric.version);
        expect(coverage.materialFingerprint).toBe(courseMaterialFingerprint(course));
        expect(coverage.rows).toEqual([{ needId: 'stage:classify', kind: 'stage', label: 'Classification or composition', covered: true, materialLabels: [mention.label] }]);
        expect(mongo.setWritingAssignmentMaterialCoverage).toHaveBeenCalledWith('eval-course', assignment.id, coverage);
    });

    it('reports cached coverage as stale after the rubric version changes', async () => {
        const assignment = buildEvalAssignment();
        assignment.materialCoverage = {
            rubricVersion: assignment.rubric.version - 1,
            materialFingerprint: courseMaterialFingerprint(course),
            computedAt: new Date(),
            rows: []
        };
        const { service } = setup(assignment);
        expect((await service.getMaterialCoverage('eval-course', assignment.id)).current).toBe(false);
    });

    it('refuses without an approved writing rubric', async () => {
        const assignment = buildEvalAssignment();
        assignment.rubric = { ...assignment.rubric, status: 'draft' };
        const { service } = setup(assignment);
        await expect(service.recomputeMaterialCoverage('eval-course', assignment.id))
            .rejects.toThrow('Approve the writing rubric before checking course-material coverage');
    });
});

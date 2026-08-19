/**
 * Writing Feedback Mongo compatibility tests
 *
 * Verifies repair of the legacy Canvas uniqueness index, coexistence of manual
 * assignments in one course, and detached rank backfill for historical rubrics.
 *
 * @author: @rdschrs
 * @date: 2026-08-10
 * @version: 1.0.0
 * @description: Regression coverage for assignment indexes and legacy rubric reads.
 */

import type { MongoDalContext } from '../mongo-context';
import type {
    WritingAssignment,
    WritingRubricDefinition
} from '../../../writing-feedback/contracts';
import {
    createManualWritingAssignment,
    ensureWritingFeedbackIndexes,
    normalizeWritingAssignment
} from '../writing-feedback-mongo';

function contextWithCollections(collections: Record<string, unknown>): MongoDalContext {
    return {
        db: {
            collection: jest.fn((name: string) => collections[name])
        } as unknown as MongoDalContext['db'],
        idGenerator: {} as MongoDalContext['idGenerator'],
        collectionNamesCache: new Map(),
        scheduledTasksIndexesEnsured: new Set<string>()
    };
}

function indexOnlyCollection() {
    return {
        createIndex: jest.fn().mockResolvedValue('index-name')
    };
}

function legacyRubric(version: number): WritingRubricDefinition {
    return {
        version,
        status: 'approved',
        title: `Legacy rubric ${version}`,
        task: 'Write a technical description.',
        audience: 'A general technical reader.',
        purpose: 'Explain a process accurately.',
        constraints: ['Use one paragraph.'],
        learningOutcomes: ['Organize, represent, and position technical information.'],
        gradingIntent: 'Ordinal feedback.',
        criteria: [
            { id: 'organization', label: 'Organization', description: 'Textual meaning.' },
            { id: 'content', label: 'Content', description: 'Ideational meaning.' },
            { id: 'interpersonal_positioning', label: 'IP', description: 'Interpersonal meaning.' },
            { id: 'task_constraints', label: 'Task Constraints', description: 'Task completion.' }
        ],
        levels: [
            { id: 'emerging', label: 'Emerging', description: 'Legacy level.' },
            { id: 'developing', label: 'Developing', description: 'Legacy level.' },
            { id: 'competent', label: 'Competent', description: 'Legacy level.' },
            { id: 'strong', label: 'Strong', description: 'Legacy level.' }
        ],
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedBy: 'legacy-system',
        approvedAt: new Date('2026-01-01T00:00:00.000Z'),
        approvedBy: 'legacy-system'
    } as unknown as WritingRubricDefinition;
}

describe('Writing Feedback assignment persistence', () => {
    it('replaces the legacy sparse Canvas index and permits multiple manual assignments per course', async () => {
        const inserted: WritingAssignment[] = [];
        const assignmentCollection = {
            listIndexes: jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([{
                    name: 'courseId_1_canvasAssignmentId_1',
                    key: { courseId: 1, canvasAssignmentId: 1 },
                    unique: true,
                    sparse: true
                }])
            }),
            dropIndex: jest.fn().mockResolvedValue(undefined),
            createIndex: jest.fn().mockResolvedValue('index-name'),
            insertOne: jest.fn(async (assignment: WritingAssignment) => {
                inserted.push(assignment);
                return { acknowledged: true, insertedId: assignment.id };
            })
        };
        const ctx = contextWithCollections({
            'writing-assignments': assignmentCollection,
            'writing-submissions': indexOnlyCollection(),
            'writing-feedback-runs': indexOnlyCollection(),
            'writing-releases': indexOnlyCollection(),
            'writing-jobs': indexOnlyCollection(),
            'canvas-connections': indexOnlyCollection()
        });

        await ensureWritingFeedbackIndexes(ctx);
        await createManualWritingAssignment(ctx, 'course-1', 'Lab report', 'Report the experiment.');
        await createManualWritingAssignment(ctx, 'course-1', 'Design memo', 'Recommend one design.');

        expect(assignmentCollection.dropIndex).toHaveBeenCalledWith('courseId_1_canvasAssignmentId_1');
        expect(assignmentCollection.createIndex).toHaveBeenCalledWith(
            { courseId: 1, canvasAssignmentId: 1 },
            {
                name: 'writing_canvas_assignment_unique',
                unique: true,
                partialFilterExpression: { canvasAssignmentId: { $type: 'string' } }
            }
        );
        expect(inserted).toHaveLength(2);
        expect(inserted.map((assignment) => assignment.courseId)).toEqual(['course-1', 'course-1']);
        expect(inserted.map((assignment) => assignment.instructions)).toEqual([
            'Report the experiment.',
            'Recommend one design.'
        ]);
        expect(inserted.every((assignment) => assignment.canvasAssignmentId === undefined)).toBe(true);
        expect(new Set(inserted.map((assignment) => assignment.id)).size).toBe(2);
    });
});

describe('legacy Writing Feedback rubric reads', () => {
    it('backfills rank by array position in the current rubric, draft, and history without mutating storage', () => {
        const stored = {
            id: 'assignment-1',
            courseId: 'course-1',
            title: 'Legacy assignment',
            profileVersion: 'lled200-a2-technical-description-v1',
            rubricSource: 'internal_profile',
            rubric: legacyRubric(3),
            rubricDraft: { ...legacyRubric(4), status: 'draft' as const, approvedAt: undefined, approvedBy: undefined },
            rubricHistory: [legacyRubric(1), legacyRubric(2)],
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z')
        } satisfies WritingAssignment;

        const normalized = normalizeWritingAssignment(stored);

        expect(normalized.rubric.criteria).toHaveLength(4);
        expect(normalized.rubric.levels.map((level) => level.rank)).toEqual([1, 2, 3, 4]);
        expect(normalized.rubricDraft?.levels.map((level) => level.rank)).toEqual([1, 2, 3, 4]);
        expect(normalized.rubricHistory?.map((rubric) => rubric.levels.map((level) => level.rank))).toEqual([
            [1, 2, 3, 4],
            [1, 2, 3, 4]
        ]);
        expect(Object.prototype.hasOwnProperty.call(stored.rubric.levels[0], 'rank')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(stored.rubricDraft.levels[0], 'rank')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(stored.rubricHistory[0].levels[0], 'rank')).toBe(false);
    });

    it('preserves valid explicit ranks instead of re-inferring order', () => {
        const stored = {
            id: 'assignment-2',
            courseId: 'course-1',
            title: 'Reordered assignment',
            profileVersion: 'writing-feedback-v1',
            rubricSource: 'internal_profile',
            rubric: {
                ...legacyRubric(1),
                levels: legacyRubric(1).levels.map((level, index) => ({ ...level, rank: 4 - index }))
            },
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z')
        } satisfies WritingAssignment;

        expect(normalizeWritingAssignment(stored).rubric.levels.map((level) => level.rank))
            .toEqual([4, 3, 2, 1]);
    });
});

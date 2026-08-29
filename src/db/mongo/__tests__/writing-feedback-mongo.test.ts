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
    approveWritingRubricDraft,
    completeWritingJob,
    createManualWritingAssignment,
    discardWritingRubricDraft,
    ensureWritingFeedbackIndexes,
    getLatestWritingFeedbackRun,
    normalizeWritingAssignment,
    saveWritingRubricDraft,
    setWritingAssignmentLabReport
} from '../writing-feedback-mongo';
import { buildLabReportRubric } from '../../../writing-feedback/lab-report-profile';

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

/** Minimal valid assignment fixture for the lens-mocked delegate tests below. */
function baseAssignment(overrides: Partial<WritingAssignment> = {}): WritingAssignment {
    return {
        id: 'assignment-1',
        courseId: 'course-1',
        title: 'Lab 1',
        profileVersion: 'writing-feedback-v1',
        rubricSource: 'internal_profile',
        rubric: legacyRubric(1),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        ...overrides
    } satisfies WritingAssignment;
}

/** Mock `writing-assignments` collection recording `findOne`/`findOneAndUpdate` call arguments. */
function mongoAssignmentCollection(options: {
    findOneResult?: WritingAssignment | null;
    findOneAndUpdateResult?: WritingAssignment | null;
} = {}) {
    return {
        findOne: jest.fn().mockResolvedValue(options.findOneResult ?? null),
        findOneAndUpdate: jest.fn().mockResolvedValue(options.findOneAndUpdateResult ?? null)
    };
}

/** Mock `writing-feedback-runs` collection exposing the chained `find().sort().limit().next()` shape. */
function mongoRunsCollection(nextResult: unknown) {
    const next = jest.fn().mockResolvedValue(nextResult);
    const limit = jest.fn().mockReturnValue({ next });
    const sort = jest.fn().mockReturnValue({ limit });
    const find = jest.fn().mockReturnValue({ sort });
    return { find, sort, limit, next };
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
            'writing-glossary-entries': indexOnlyCollection(),
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

    it('backfills rank on technicalRubric, technicalRubricDraft, and technicalRubricHistory', () => {
        const stored = {
            id: 'assignment-3',
            courseId: 'course-1',
            title: 'Lab report assignment',
            profileVersion: 'lled200-a2-technical-description-v1',
            rubricSource: 'internal_profile',
            rubric: legacyRubric(1),
            technicalRubric: legacyRubric(3),
            technicalRubricDraft: { ...legacyRubric(4), status: 'draft' as const, approvedAt: undefined, approvedBy: undefined },
            technicalRubricHistory: [legacyRubric(1), legacyRubric(2)],
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z')
        } satisfies WritingAssignment;

        const normalized = normalizeWritingAssignment(stored);

        expect(normalized.technicalRubric?.levels.map((level) => level.rank)).toEqual([1, 2, 3, 4]);
        expect(normalized.technicalRubricDraft?.levels.map((level) => level.rank)).toEqual([1, 2, 3, 4]);
        expect(normalized.technicalRubricHistory?.map((rubric) => rubric.levels.map((level) => level.rank))).toEqual([
            [1, 2, 3, 4],
            [1, 2, 3, 4]
        ]);
        expect(Object.prototype.hasOwnProperty.call(stored.technicalRubric!.levels[0], 'rank')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(stored.technicalRubricDraft!.levels[0], 'rank')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(stored.technicalRubricHistory![0].levels[0], 'rank')).toBe(false);
    });
});

describe('saveWritingRubricDraft lens routing', () => {
    it('writes a technical draft under technicalRubricDraft, leaving rubricDraft untouched', async () => {
        const draft = buildLabReportRubric('user-1', new Date('2026-08-20T00:00:00.000Z'));
        const assignmentCollection = mongoAssignmentCollection({
            findOneAndUpdateResult: baseAssignment({ technicalRubricDraft: draft })
        });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        await saveWritingRubricDraft(ctx, 'course-1', 'assignment-1', draft, 'technical');

        expect(assignmentCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
        const [filter, update, options] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ id: 'assignment-1', courseId: 'course-1' });
        expect(update.$set.technicalRubricDraft).toBe(draft);
        expect(Object.prototype.hasOwnProperty.call(update.$set, 'rubricDraft')).toBe(false);
        expect(options).toEqual({ returnDocument: 'after' });
    });

    it('defaults to the linguistic lens when omitted, writing rubricDraft', async () => {
        const draft = buildLabReportRubric('user-1', new Date('2026-08-20T00:00:00.000Z'));
        const assignmentCollection = mongoAssignmentCollection({
            findOneAndUpdateResult: baseAssignment({ rubricDraft: draft })
        });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        await saveWritingRubricDraft(ctx, 'course-1', 'assignment-1', draft);

        const [, update] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(update.$set.rubricDraft).toBe(draft);
        expect(Object.prototype.hasOwnProperty.call(update.$set, 'technicalRubricDraft')).toBe(false);
    });

    it('writes rubricDraft when the linguistic lens is passed explicitly', async () => {
        const draft = buildLabReportRubric('user-1', new Date('2026-08-20T00:00:00.000Z'));
        const assignmentCollection = mongoAssignmentCollection({
            findOneAndUpdateResult: baseAssignment({ rubricDraft: draft })
        });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        await saveWritingRubricDraft(ctx, 'course-1', 'assignment-1', draft, 'linguistic');

        const [, update] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(update.$set.rubricDraft).toBe(draft);
    });
});

describe('discardWritingRubricDraft lens routing', () => {
    it('unsets only technicalRubricDraft for the technical lens', async () => {
        const assignmentCollection = mongoAssignmentCollection({ findOneAndUpdateResult: baseAssignment() });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        await discardWritingRubricDraft(ctx, 'course-1', 'assignment-1', 'technical');

        const [filter, update] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ id: 'assignment-1', courseId: 'course-1' });
        expect(update.$unset).toEqual({ technicalRubricDraft: '' });
    });

    it('defaults to unsetting rubricDraft when lens is omitted', async () => {
        const assignmentCollection = mongoAssignmentCollection({ findOneAndUpdateResult: baseAssignment() });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        await discardWritingRubricDraft(ctx, 'course-1', 'assignment-1');

        const [, update] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(update.$unset).toEqual({ rubricDraft: '' });
    });
});

describe('approveWritingRubricDraft lens routing', () => {
    it('approves a first-ever technical rubric without guarding technicalRubric.version or pushing history', async () => {
        const approvedRubric = { ...legacyRubric(1), status: 'approved' as const };
        const current = baseAssignment({
            technicalRubricDraft: { ...approvedRubric, status: 'draft' as const }
            // technicalRubric is absent: this lens has never been approved before.
        });
        const assignmentCollection = mongoAssignmentCollection({
            findOneResult: current,
            findOneAndUpdateResult: baseAssignment({ technicalRubric: approvedRubric })
        });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        await approveWritingRubricDraft(ctx, 'course-1', 'assignment-1', approvedRubric, undefined, 'technical');

        expect(assignmentCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
        const [filter, update] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(Object.prototype.hasOwnProperty.call(filter, 'technicalRubric.version')).toBe(false);
        expect(filter['technicalRubricDraft.version']).toBe(approvedRubric.version);
        expect(update.$set.technicalRubric).toBe(approvedRubric);
        expect(update.$push).toBeUndefined();
        expect(update.$unset.technicalRubricDraft).toBe('');
    });

    it('guards technicalRubric.version and archives history once a technical rubric was already approved', async () => {
        const previouslyApproved = legacyRubric(1);
        const approvedRubric = { ...legacyRubric(2), status: 'approved' as const };
        const current = baseAssignment({
            technicalRubric: previouslyApproved,
            technicalRubricDraft: { ...approvedRubric, status: 'draft' as const }
        });
        const assignmentCollection = mongoAssignmentCollection({
            findOneResult: current,
            findOneAndUpdateResult: baseAssignment({
                technicalRubric: approvedRubric,
                technicalRubricHistory: [previouslyApproved]
            })
        });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        await approveWritingRubricDraft(ctx, 'course-1', 'assignment-1', approvedRubric, undefined, 'technical');

        const [filter, update] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(filter['technicalRubric.version']).toBe(previouslyApproved.version);
        expect(filter['technicalRubricDraft.version']).toBe(approvedRubric.version);
        expect(update.$push).toEqual({ technicalRubricHistory: previouslyApproved });
        expect(update.$set.technicalRubric).toBe(approvedRubric);
    });

    it('never sets or unsets gradeMapping for the technical lens, even when a mapping is passed', async () => {
        const approvedRubric = { ...legacyRubric(1), status: 'approved' as const };
        const current = baseAssignment({
            technicalRubricDraft: { ...approvedRubric, status: 'draft' as const }
        });
        const assignmentCollection = mongoAssignmentCollection({
            findOneResult: current,
            findOneAndUpdateResult: baseAssignment({ technicalRubric: approvedRubric })
        });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        await approveWritingRubricDraft(
            ctx,
            'course-1',
            'assignment-1',
            approvedRubric,
            { emerging: 60, developing: 70, competent: 85, strong: 100 },
            'technical'
        );

        const [, update] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(Object.prototype.hasOwnProperty.call(update.$set, 'gradeMapping')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(update.$unset, 'gradeMapping')).toBe(false);
    });

    it('defaults to the linguistic lens when omitted, guarding rubric.version and setting gradeMapping', async () => {
        const approvedRubric = { ...legacyRubric(2), status: 'approved' as const };
        const current = baseAssignment({
            rubric: legacyRubric(1),
            rubricDraft: { ...approvedRubric, status: 'draft' as const }
        });
        const assignmentCollection = mongoAssignmentCollection({
            findOneResult: current,
            findOneAndUpdateResult: baseAssignment({ rubric: approvedRubric })
        });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        await approveWritingRubricDraft(
            ctx,
            'course-1',
            'assignment-1',
            approvedRubric,
            { emerging: 60, developing: 70, competent: 85, strong: 100 }
        );

        const [filter, update] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(filter['rubric.version']).toBe(1);
        expect(filter['rubricDraft.version']).toBe(2);
        expect(update.$set.rubric).toBe(approvedRubric);
        expect(update.$set.gradeMapping).toEqual({ emerging: 60, developing: 70, competent: 85, strong: 100 });
        expect(update.$push).toEqual({ rubricHistory: current.rubric });
    });
});

describe('setWritingAssignmentLabReport', () => {
    it('sets isLabReport with a course-scoped filter', async () => {
        const assignmentCollection = mongoAssignmentCollection({
            findOneAndUpdateResult: baseAssignment({ isLabReport: true })
        });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        const updated = await setWritingAssignmentLabReport(ctx, 'course-1', 'assignment-1', true);

        const [filter, update] = assignmentCollection.findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ id: 'assignment-1', courseId: 'course-1' });
        expect(update.$set.isLabReport).toBe(true);
        expect(updated?.isLabReport).toBe(true);
    });

    it('returns null when no assignment matches the scoped filter', async () => {
        const assignmentCollection = mongoAssignmentCollection({ findOneAndUpdateResult: null });
        const ctx = contextWithCollections({ 'writing-assignments': assignmentCollection });

        const result = await setWritingAssignmentLabReport(ctx, 'course-2', 'assignment-1', true);

        expect(result).toBeNull();
    });
});

describe('getLatestWritingFeedbackRun lens scoping', () => {
    it('queries lens: "technical" exactly for the technical lens', async () => {
        const runsCollection = mongoRunsCollection(null);
        const ctx = contextWithCollections({ 'writing-feedback-runs': runsCollection });

        await getLatestWritingFeedbackRun(ctx, 'submission-1', 'technical');

        expect(runsCollection.find).toHaveBeenCalledWith({ submissionId: 'submission-1', lens: 'technical' });
    });

    it('queries lens "linguistic" or absent for the linguistic lens, covering pre-lens runs', async () => {
        const runsCollection = mongoRunsCollection(null);
        const ctx = contextWithCollections({ 'writing-feedback-runs': runsCollection });

        await getLatestWritingFeedbackRun(ctx, 'submission-1', 'linguistic');

        expect(runsCollection.find).toHaveBeenCalledWith({
            submissionId: 'submission-1',
            $or: [{ lens: 'linguistic' }, { lens: { $exists: false } }]
        });
    });

    it('defaults to the linguistic-or-absent filter when lens is omitted', async () => {
        const runsCollection = mongoRunsCollection(null);
        const ctx = contextWithCollections({ 'writing-feedback-runs': runsCollection });

        await getLatestWritingFeedbackRun(ctx, 'submission-1');

        expect(runsCollection.find).toHaveBeenCalledWith({
            submissionId: 'submission-1',
            $or: [{ lens: 'linguistic' }, { lens: { $exists: false } }]
        });
    });
});

describe('completeWritingJob', () => {
    it('clears a stale sanitizedError left by an earlier failed attempt', async () => {
        const jobsCollection = { updateOne: jest.fn().mockResolvedValue(undefined) };
        const ctx = contextWithCollections({ 'writing-jobs': jobsCollection });

        await completeWritingJob(ctx, 'job-1');

        expect(jobsCollection.updateOne).toHaveBeenCalledWith(
            { id: 'job-1', state: 'leased' },
            {
                $set: { state: 'completed', updatedAt: expect.any(Date) },
                $unset: { leaseUntil: '', sanitizedError: '' }
            }
        );
    });
});

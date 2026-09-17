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
    CanvasRubricIdMap,
    ImportedRubricShape,
    WritingAssignment,
    WritingRubricDefinition
} from '../../../writing-feedback/contracts';
import {
    appendWritingReview,
    approveWritingRubricDraft,
    autoConfirmWritingTranscript,
    cancelWritingGenerationJobs,
    chooseWritingAssignmentType,
    completeWritingJob,
    countFeedbackStaleOnApproval,
    createCanvasWritingAssignment,
    createManualWritingAssignment,
    deleteWritingAssignment,
    discardWritingRubricDraft,
    ensureWritingFeedbackIndexes,
    finalizeWritingRelease,
    getLatestWritingFeedbackRun,
    getLatestWritingRelease,
    leaseNextWritingJob,
    listLatestWritingRunVersions,
    listWritingSubmissions,
    normalizeWritingAssignment,
    replaceWritingSubmission,
    saveWritingRubricDraft
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
        expect(inserted.every((assignment) => assignment.assignmentTypePending === true)).toBe(true);
    });

    it('creates a Canvas-imported assignment with its type still pending', async () => {
        const inserted: WritingAssignment[] = [];
        const assignmentCollection = {
            listIndexes: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
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

        await createCanvasWritingAssignment(ctx, 'course-1', 'canvas-42', 'Lab 3', 'Measure the exchanger.');

        expect(inserted).toHaveLength(1);
        expect(inserted[0].assignmentTypePending).toBe(true);
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

describe('chooseWritingAssignmentType', () => {
    it('chooses the assignment type only while it is pending, scoped to the course', async () => {
        const collection = mongoAssignmentCollection({
            findOneAndUpdateResult: baseAssignment({ isLabReport: true })
        });
        const ctx = contextWithCollections({ 'writing-assignments': collection });

        const updated = await chooseWritingAssignmentType(ctx, 'course-1', 'assignment-1', true);

        const [filter, update] = collection.findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ id: 'assignment-1', courseId: 'course-1', assignmentTypePending: true });
        expect(update.$set.isLabReport).toBe(true);
        expect(update.$set.updatedAt).toBeInstanceOf(Date);
        expect(update.$unset).toEqual({ assignmentTypePending: '' });
        expect(updated?.isLabReport).toBe(true);
    });

    it('returns null when the type was already chosen', async () => {
        const collection = mongoAssignmentCollection({ findOneAndUpdateResult: null });
        const ctx = contextWithCollections({ 'writing-assignments': collection });

        await expect(chooseWritingAssignmentType(ctx, 'course-1', 'assignment-1', false)).resolves.toBeNull();
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

describe('Writing Feedback release persistence', () => {
    it('sorts latest release state by updatedAt descending for one submission', async () => {
        const findOne = jest.fn().mockResolvedValue(null);
        const releaseCollection = { findOne };
        const ctx = contextWithCollections({ 'writing-releases': releaseCollection });

        await getLatestWritingRelease(ctx, 'course-1', 'submission-1');

        expect(findOne).toHaveBeenCalledWith(
            { courseId: 'course-1', submissionId: 'submission-1' },
            { sort: { updatedAt: -1 } }
        );
    });

    it('unsets stale failure fields when a retry clears them', async () => {
        const findOneAndUpdate = jest.fn().mockResolvedValue(null);
        const releaseCollection = { findOneAndUpdate };
        const ctx = contextWithCollections({ 'writing-releases': releaseCollection });

        await finalizeWritingRelease(ctx, 'fingerprint-1', {
            status: 'released',
            failureStage: undefined,
            sanitizedError: undefined
        });

        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { payloadFingerprint: 'fingerprint-1' },
            {
                $set: { status: 'released', updatedAt: expect.any(Date) },
                $unset: { failureStage: '', sanitizedError: '' }
            },
            { returnDocument: 'after' }
        );
    });
});

describe('createCanvasWritingAssignment', () => {
    const shape: ImportedRubricShape = {
        criteria: [{ id: 'analysis', label: 'Analysis', description: 'Quality of analysis', points: 20, cells: {} }],
        levels: [
            { id: 'weak', label: 'Weak', description: 'Little analysis', rank: 1 },
            { id: 'strong', label: 'Strong', description: 'Full analysis', rank: 2 }
        ]
    };
    const ids: CanvasRubricIdMap = {
        analysis: { criterionId: '_1234', ratingIds: { weak: 'r_lo', strong: 'r_hi' } }
    };

    function collectionCapturingInsert(inserted: WritingAssignment[]) {
        return {
            listIndexes: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
            createIndex: jest.fn().mockResolvedValue('index-name'),
            insertOne: jest.fn(async (assignment: WritingAssignment) => {
                inserted.push(assignment);
                return { acknowledged: true, insertedId: assignment.id };
            })
        };
    }

    function contextFor(assignmentCollection: unknown): MongoDalContext {
        return contextWithCollections({
            'writing-assignments': assignmentCollection,
            'writing-submissions': indexOnlyCollection(),
            'writing-feedback-runs': indexOnlyCollection(),
            'writing-releases': indexOnlyCollection(),
            'writing-jobs': indexOnlyCollection(),
            'writing-glossary-entries': indexOnlyCollection(),
            'canvas-connections': indexOnlyCollection()
        });
    }

    it('stores the imported canvas rubric and its ids on the assignment', async () => {
        const inserted: WritingAssignment[] = [];
        const created = await createCanvasWritingAssignment(
            contextFor(collectionCapturingInsert(inserted)),
            'course-1', 'canvas-9', 'Lab 3', 'Do the lab', undefined, shape, undefined, ids
        );

        expect(created.canvasRubricImport?.ids.analysis.criterionId).toBe('_1234');
        expect(created.canvasRubricImport?.shape.criteria[0].id).toBe('analysis');
        expect(created.canvasRubricImport?.importedAt).toBeInstanceOf(Date);
        // The writing lens still seeds from it, exactly as before.
        expect(created.rubricSource).toBe('canvas');
        expect(inserted[0].canvasRubricImport?.ids.analysis.ratingIds.strong).toBe('r_hi');
    });

    it('stores nothing when the rubric was refused', async () => {
        const created = await createCanvasWritingAssignment(
            contextFor(collectionCapturingInsert([])),
            'course-1', 'canvas-9', 'Lab 3', 'Do the lab'
        );

        expect(created.canvasRubricImport).toBeUndefined();
        expect(created.rubricSource).toBe('internal_profile');
    });
});

describe('countFeedbackStaleOnApproval', () => {
    // Typed parameter, so the recorded pipeline can be read back without a cast.
    function runsWithAggregate(rows: Array<{ total: number }>) {
        const toArray = jest.fn().mockResolvedValue(rows);
        return { aggregate: jest.fn((_pipeline: object[]) => ({ toArray })) };
    }

    it('counts each unreleased submission once, by its latest run at the approved version', async () => {
        const runs = runsWithAggregate([{ total: 3 }]);
        const ctx = contextWithCollections({ 'writing-feedback-runs': runs });

        await expect(countFeedbackStaleOnApproval(ctx, 'course-1', 'assignment-1', 'technical', 2)).resolves.toBe(3);

        const pipeline = runs.aggregate.mock.calls[0][0];
        expect(pipeline[0]).toEqual({ $match: { courseId: 'course-1', assignmentId: 'assignment-1', lens: 'technical' } });
        expect(pipeline).toContainEqual({ $sort: { createdAt: -1 } });
        expect(pipeline).toContainEqual({ $group: { _id: '$submissionId', rubricVersion: { $first: '$rubricVersion' } } });
        expect(pipeline).toContainEqual({ $match: { rubricVersion: 2 } });
        expect(pipeline).toContainEqual({
            $lookup: { from: 'writing-submissions', localField: '_id', foreignField: 'id', as: 'submission' }
        });
        // Released feedback is exempt from staleness, so approving a new version costs it nothing.
        expect(pipeline).toContainEqual({
            $match: { 'submission.courseId': 'course-1', 'submission.status': { $ne: 'released' } }
        });
    });

    it('treats a run with no recorded lens as writing, and no recorded version as version 1', async () => {
        const runs = runsWithAggregate([{ total: 1 }]);
        const ctx = contextWithCollections({ 'writing-feedback-runs': runs });

        await countFeedbackStaleOnApproval(ctx, 'course-1', 'assignment-1', 'linguistic', 1);

        const pipeline = runs.aggregate.mock.calls[0][0];
        expect(pipeline[0]).toEqual({
            $match: {
                courseId: 'course-1',
                assignmentId: 'assignment-1',
                $or: [{ lens: 'linguistic' }, { lens: { $exists: false } }]
            }
        });
        expect(pipeline).toContainEqual({ $match: { rubricVersion: { $in: [1, null] } } });
    });

    it('returns 0 when no unreleased feedback used the approved version', async () => {
        const ctx = contextWithCollections({ 'writing-feedback-runs': runsWithAggregate([]) });
        await expect(countFeedbackStaleOnApproval(ctx, 'course-1', 'assignment-1', 'technical', 4)).resolves.toBe(0);
    });
});

describe('one active submission per student', () => {
    function submissionRows(rows: unknown[]) {
        const toArray = jest.fn().mockResolvedValue(rows);
        const sort = jest.fn().mockReturnValue({ toArray });
        return { find: jest.fn().mockReturnValue({ sort }) };
    }

    it('lists active rows only, folding each held attempt onto the row it would replace', async () => {
        const rows = [
            { id: 'held', slot: 'held', replacesSubmissionId: 'current', attempt: 2, sourceType: 'canvas_text', originalText: 'secret' },
            { id: 'current', slot: 'active', attempt: 1 },
            { id: 'legacy', attempt: 1 },
            { id: 'old', slot: 'superseded', attempt: 1 }
        ];
        const ctx = contextWithCollections({ 'writing-submissions': submissionRows(rows) });

        const queue = await listWritingSubmissions(ctx, 'course-1', 'assignment-1');

        expect(queue.map((row) => row.id)).toEqual(['current', 'legacy']);
        expect(queue[0].pendingReplacement).toEqual({ submissionId: 'held', attempt: 2, submittedAt: undefined, sourceType: 'canvas_text' });
        expect(JSON.stringify(queue)).not.toContain('secret');
    });

    it('returns every slot, unannotated, when import asks for inactive rows', async () => {
        const rows = [{ id: 'held', slot: 'held', replacesSubmissionId: 'current' }, { id: 'current', slot: 'active' }];
        const ctx = contextWithCollections({ 'writing-submissions': submissionRows(rows) });

        const all = await listWritingSubmissions(ctx, 'course-1', 'assignment-1', { includeInactive: true });

        expect(all).toEqual(rows);
    });

    it('restores the current submission when the held attempt cannot be promoted', async () => {
        const vacated = { id: 'current', updatedAt: new Date('2026-10-01T00:00:00.000Z') };
        const collection = {
            findOneAndUpdate: jest.fn().mockResolvedValueOnce(vacated).mockResolvedValueOnce(null),
            updateOne: jest.fn().mockResolvedValue({}),
            deleteOne: jest.fn()
        };
        const ctx = contextWithCollections({ 'writing-submissions': collection });

        const result = await replaceWritingSubmission(ctx, 'course-1', 'current', 'held', false);

        expect(result).toBeNull();
        expect(collection.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ id: 'current', status: { $ne: 'generating' } });
        expect(collection.updateOne).toHaveBeenCalledWith(
            { id: 'current', courseId: 'course-1' },
            { $set: { slot: 'active', updatedAt: vacated.updatedAt }, $unset: { supersededAt: '' } }
        );
        expect(collection.deleteOne).not.toHaveBeenCalled();
    });

    it('keeps a released submission superseded instead of deleting it', async () => {
        const collection = {
            findOneAndUpdate: jest.fn()
                .mockResolvedValueOnce({ id: 'current' })
                .mockResolvedValueOnce({ id: 'held', slot: 'active' }),
            deleteOne: jest.fn()
        };
        const ctx = contextWithCollections({ 'writing-submissions': collection });

        const result = await replaceWritingSubmission(ctx, 'course-1', 'current', 'held', true);

        expect(result).toMatchObject({ id: 'held', slot: 'active' });
        expect(collection.findOneAndUpdate.mock.calls[0][1]).toMatchObject({ $set: { slot: 'superseded' } });
        expect(collection.deleteOne).not.toHaveBeenCalled();
    });
});

describe('deleteWritingAssignment', () => {
    function collections(options: { job?: unknown; release?: unknown; assignmentDeleted?: number } = {}) {
        const submissionRows = [{ id: 'sub-1' }, { id: 'sub-2' }];
        return {
            'writing-assignments': { deleteOne: jest.fn().mockResolvedValue({ deletedCount: options.assignmentDeleted ?? 1 }) },
            'writing-submissions': {
                find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(submissionRows) }),
                deleteMany: jest.fn().mockResolvedValue({})
            },
            'writing-jobs': { findOne: jest.fn().mockResolvedValue(options.job ?? null), deleteMany: jest.fn().mockResolvedValue({}) },
            'writing-releases': { findOne: jest.fn().mockResolvedValue(options.release ?? null), deleteMany: jest.fn().mockResolvedValue({}) },
            'writing-feedback-runs': { deleteMany: jest.fn().mockResolvedValue({}) }
        };
    }

    it('deletes the assignment and every submission, run, release, and job belonging to it', async () => {
        const cols = collections();
        const result = await deleteWritingAssignment(contextWithCollections(cols), 'course-1', 'assignment-1');

        expect(result).toEqual({ deleted: true, blockedByWork: false });
        expect(cols['writing-submissions'].deleteMany).toHaveBeenCalledWith({ courseId: 'course-1', assignmentId: 'assignment-1' });
        const ids = { $in: ['sub-1', 'sub-2'] };
        expect(cols['writing-feedback-runs'].deleteMany).toHaveBeenCalledWith({ submissionId: ids });
        expect(cols['writing-releases'].deleteMany).toHaveBeenCalledWith({ submissionId: ids });
        expect(cols['writing-jobs'].deleteMany).toHaveBeenCalledWith({ 'payload.submissionId': ids });
    });

    it.each([
        ['a queued or running job', { job: { id: 'job-1' } }],
        ['an unsettled Canvas release', { release: { id: 'release-1' } }]
    ])('refuses and deletes nothing while there is %s', async (_label, options) => {
        const cols = collections(options);
        const result = await deleteWritingAssignment(contextWithCollections(cols), 'course-1', 'assignment-1');

        expect(result).toEqual({ deleted: false, blockedByWork: true });
        expect(cols['writing-assignments'].deleteOne).not.toHaveBeenCalled();
        expect(cols['writing-submissions'].deleteMany).not.toHaveBeenCalled();
    });

    it('leaves submissions alone when the assignment is not in the course', async () => {
        const cols = collections({ assignmentDeleted: 0 });
        const result = await deleteWritingAssignment(contextWithCollections(cols), 'course-1', 'assignment-1');

        expect(result).toEqual({ deleted: false, blockedByWork: false });
        expect(cols['writing-submissions'].deleteMany).not.toHaveBeenCalled();
    });
});

describe('leaseNextWritingJob', () => {
    it('claims a queued release before any other job', async () => {
        const release = { id: 'job-release', type: 'release' };
        const jobsCollection = { findOneAndUpdate: jest.fn().mockResolvedValueOnce(release) };
        const ctx = contextWithCollections({ 'writing-jobs': jobsCollection });

        await expect(leaseNextWritingJob(ctx)).resolves.toBe(release);
        expect(jobsCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(jobsCollection.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ type: 'release' });
    });

    it('falls back to the oldest other job when no release is waiting', async () => {
        const generate = { id: 'job-generate', type: 'generate' };
        const jobsCollection = {
            findOneAndUpdate: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(generate)
        };
        const ctx = contextWithCollections({ 'writing-jobs': jobsCollection });

        await expect(leaseNextWritingJob(ctx)).resolves.toBe(generate);
        const [filter, update, options] = jobsCollection.findOneAndUpdate.mock.calls[1];
        expect(filter).toMatchObject({ type: { $ne: 'release' } });
        expect(update).toMatchObject({ $inc: { attempts: 1 } });
        expect(options).toMatchObject({ sort: { createdAt: 1 } });
    });
});

describe('cancelWritingGenerationJobs', () => {
    it('removes only jobs whose conditional delete succeeds', async () => {
        const jobsCollection = {
            find: jest.fn(() => ({
                toArray: jest.fn().mockResolvedValue([
                    { id: 'job-a', payload: { submissionId: 'sub-a' } },
                    { id: 'job-b', payload: { submissionId: 'sub-b' } }
                ])
            })),
            // job-b was claimed by the worker between the read and the delete.
            deleteOne: jest.fn().mockResolvedValueOnce({ deletedCount: 1 }).mockResolvedValueOnce({ deletedCount: 0 })
        };
        const ctx = contextWithCollections({ 'writing-jobs': jobsCollection });

        await expect(cancelWritingGenerationJobs(ctx, 'course-1', ['sub-a', 'sub-b'])).resolves.toEqual(['sub-a']);
        const [findFilter] = jobsCollection.find.mock.calls[0] as unknown as [Record<string, unknown>];
        expect(findFilter).toMatchObject({ courseId: 'course-1', type: 'generate' });
        // Only queued jobs and long-abandoned leases qualify; a running job is left to finish.
        expect(jobsCollection.deleteOne.mock.calls[0][0]).toMatchObject({
            id: 'job-a',
            $or: [{ state: 'queued' }, expect.objectContaining({ state: 'leased' })]
        });
    });

    it('does nothing for an empty assignment', async () => {
        const ctx = contextWithCollections({ 'writing-jobs': { find: jest.fn() } });
        await expect(cancelWritingGenerationJobs(ctx, 'course-1', [])).resolves.toEqual([]);
    });
});

describe('appendWritingReview', () => {
    it('writes nothing to a generating submission and reports it', async () => {
        const submissionsCollection = { updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 }) };
        const ctx = contextWithCollections({ 'writing-submissions': submissionsCollection });

        await expect(appendWritingReview(ctx, 'course-1', 'sub-1', {
            feedbackRunId: 'run-1', staffUserId: 'staff-1', studentFeedback: 'Good.'
        })).resolves.toBeNull();
        expect(submissionsCollection.updateOne.mock.calls[0][0]).toEqual({
            id: 'sub-1', courseId: 'course-1', status: { $ne: 'generating' }
        });
    });

    it('returns the stored revision when the submission accepts it', async () => {
        const submissionsCollection = { updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }) };
        const ctx = contextWithCollections({ 'writing-submissions': submissionsCollection });

        await expect(appendWritingReview(ctx, 'course-1', 'sub-1', {
            feedbackRunId: 'run-1', staffUserId: 'staff-1', studentFeedback: 'Good.'
        })).resolves.toMatchObject({ submissionId: 'sub-1', studentFeedback: 'Good.' });
    });
});

describe('autoConfirmWritingTranscript', () => {
    it('only confirms an active submission still waiting for confirmation, and marks it batch-confirmed', async () => {
        const submissionsCollection = { findOneAndUpdate: jest.fn().mockResolvedValue(null) };
        const ctx = contextWithCollections({ 'writing-submissions': submissionsCollection });

        await autoConfirmWritingTranscript(ctx, 'course-1', 'sub-1', 'Extracted text.');
        const [filter, update] = submissionsCollection.findOneAndUpdate.mock.calls[0];
        expect(filter).toMatchObject({
            id: 'sub-1', courseId: 'course-1', requiresVerification: true, status: 'verification_needed'
        });
        expect(update.$set).toMatchObject({
            verifiedText: 'Extracted text.', requiresVerification: false, transcriptConfirmedBy: 'batch', status: 'imported'
        });
    });
});

describe('listLatestWritingRunVersions', () => {
    it('maps each submission to its latest rubric version per lens, defaulting legacy runs', async () => {
        const runsCollection = {
            aggregate: jest.fn(() => ({
                toArray: jest.fn().mockResolvedValue([
                    { _id: { submissionId: 'sub-1', lens: 'linguistic' }, rubricVersion: 3 },
                    { _id: { submissionId: 'sub-1', lens: 'technical' }, rubricVersion: 2 },
                    { _id: { submissionId: 'sub-2', lens: 'linguistic' }, rubricVersion: null }
                ])
            }))
        };
        const ctx = contextWithCollections({ 'writing-feedback-runs': runsCollection });

        const versions = await listLatestWritingRunVersions(ctx, 'course-1', 'assignment-1');
        expect(versions.get('sub-1')).toEqual({ linguistic: 3, technical: 2 });
        expect(versions.get('sub-2')).toEqual({ linguistic: 1 });
        const [pipeline] = runsCollection.aggregate.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
        expect(pipeline[0]).toEqual({ $match: { courseId: 'course-1', assignmentId: 'assignment-1' } });
    });
});

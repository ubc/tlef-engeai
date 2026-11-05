/**
 * Field-encryption integration tests
 *
 * @description Exercises the real `encryption.config.cjs` through `wrapDbWithEncryption` against a
 * running MongoDB: delegates read plaintext back, the raw database holds only envelopes at every
 * configured path, PUID lookups (sign-in, allowances, admin directory) still work through the blind
 * index, and the queries rewritten for encryption return the same answers.
 *
 * Opt-in: set `ENCRYPTION_TEST_MONGO_URI` to a local, disposable server. Each run creates and then
 * drops its own uniquely named database, and generates throwaway keys in memory.
 */

import { randomBytes } from 'node:crypto';
import { MongoClient, type Db, type Document } from 'mongodb';
import {
    EncryptedAggregationNotSupportedError,
    StaticKeyProvider,
    ensureBlindIndexes,
    type EncryptionConfigInput
} from '@ubc/genai-toolkit-encryption';
import { createMongoTokenStore, type MongoDbLike } from '@ubc/ubc-genai-toolkit-lms-integration';
import { wrapDbWithEncryption } from '../encrypted-db';
import type { MongoDalContext } from '../mongo/mongo-context';
import {
    appendWritingReview,
    countFeedbackStaleOnApproval,
    countWritingSubmissionsByAssignment,
    createWritingFeedbackRun,
    createWritingRelease,
    findWritingReleaseByFingerprint,
    finalizeWritingRelease,
    createWritingSubmission,
    getWritingSubmission,
    getLatestWritingFeedbackRun,
    listLatestWritingRunVersions
} from '../mongo/writing-feedback-mongo';
import { createGlobalUser, findGlobalUserByPUID, listGlobalUsersForDirectory, updateGlobalUser } from '../mongo/global-user-mongo';
import { setInstructorPeriodAllowance, getAllowanceForInstructorAndPeriod } from '../mongo/instructor-period-allowance-mongo';
import type { WritingFeedbackResult } from '../../writing-feedback/contracts';

const uri = process.env.ENCRYPTION_TEST_MONGO_URI;
const describeWithMongo = uri ? describe : describe.skip;

/** Synthetic values only; each is searched for verbatim in the raw documents. */
const ESSAY = 'Synthetic essay text about heat exchangers.';
const LABEL = 'Synthetic Student Label';
const FEEDBACK = 'Synthetic staff feedback for the student.';
const NOTE = 'Synthetic internal note.';
const PUID = 'SYNTHETICPUID0001';

function isEnvelope(value: unknown): boolean {
    return typeof value === 'object' && value !== null && (value as Document).__ubc_enc === 1;
}

describeWithMongo('field encryption at rest (real MongoDB)', () => {
    let client: MongoClient;
    let raw: Db;
    let ctx: MongoDalContext;
    let testConfig: EncryptionConfigInput;

    beforeAll(async () => {
        client = new MongoClient(uri!);
        await client.connect();
        raw = client.db(`engeai_encryption_test_${randomBytes(6).toString('hex')}`);

        // The committed configuration with only the keys swapped for throwaway ones (same ids).
        const config = require('../../../encryption.config.cjs') as EncryptionConfigInput;
        testConfig = {
            ...config,
            keyProvider: new StaticKeyProvider({
                activeEncryptionKey: { id: 'data-2026-10', key: randomBytes(32) },
                blindIndexKeys: [{ id: 'lookup-2026-10', key: randomBytes(32) }]
            })
        };
        const db = await wrapDbWithEncryption(raw, testConfig);
        ctx = {
            db,
            idGenerator: {} as MongoDalContext['idGenerator'],
            collectionNamesCache: new Map(),
            scheduledTasksIndexesEnsured: new Set<string>()
        };
    });

    afterAll(async () => {
        await raw?.dropDatabase();
        await client?.close();
    });

    it('stores submission text, label, and reviews encrypted and reads them back as plaintext', async () => {
        const submission = await createWritingSubmission(ctx, {
            courseId: 'course-1', assignmentId: 'a-1', studentId: 'student-1', attempt: 1,
            studentLabel: LABEL, sourceType: 'manual', originalText: ESSAY, verifiedText: ESSAY,
            requiresVerification: false, status: 'imported'
        });
        await appendWritingReview(ctx, 'course-1', submission.id, {
            feedbackRunId: 'run-1', staffUserId: 'staff-1', studentFeedback: FEEDBACK, internalNote: NOTE,
            comments: [{ id: 'c-1', lens: 'linguistic', quote: 'heat', startOffset: 0, endOffset: 4, comment: 'Clear.', origin: 'staff' }]
        });

        const read = await getWritingSubmission(ctx, 'course-1', submission.id);
        expect(read).toMatchObject({ originalText: ESSAY, verifiedText: ESSAY, studentLabel: LABEL });
        expect(read?.reviews?.[0]).toMatchObject({ studentFeedback: FEEDBACK, internalNote: NOTE });

        const stored = await raw.collection('writing-submissions').findOne({ id: submission.id });
        for (const path of ['originalText', 'verifiedText', 'studentLabel']) expect(isEnvelope(stored?.[path])).toBe(true);
        const review = stored?.reviews[0];
        for (const path of ['studentFeedback', 'internalNote', 'comments']) expect(isEnvelope(review[path])).toBe(true);
        const rawJson = JSON.stringify(stored);
        for (const secret of [ESSAY, LABEL, FEEDBACK, NOTE]) expect(rawJson).not.toContain(secret);
        // Plaintext workflow fields stay queryable.
        expect(stored).toMatchObject({ courseId: 'course-1', status: 'draft_ready' });
    });

    it('stores model output encrypted, and the rewritten run queries still answer correctly', async () => {
        const result = { summary: FEEDBACK } as unknown as WritingFeedbackResult;
        const base = { courseId: 'course-1', assignmentId: 'a-2', profileVersion: 'v1', modelMetadata: { engine: 'test', promptVersion: 'p' } };
        const s1 = await createWritingSubmission(ctx, {
            courseId: 'course-1', assignmentId: 'a-2', studentId: 'student-2', attempt: 1, sourceType: 'manual',
            originalText: ESSAY, verifiedText: ESSAY, requiresVerification: false, status: 'imported'
        });
        await createWritingFeedbackRun(ctx, { ...base, submissionId: s1.id, rubricVersion: 1, lens: 'linguistic', result });
        await new Promise((resolve) => setTimeout(resolve, 5));
        await createWritingFeedbackRun(ctx, { ...base, submissionId: s1.id, rubricVersion: 2, lens: 'linguistic', result });

        await expect(getLatestWritingFeedbackRun(ctx, s1.id)).resolves.toMatchObject({ rubricVersion: 2, result });
        const storedRun = await raw.collection('writing-feedback-runs').findOne({ submissionId: s1.id });
        expect(isEnvelope(storedRun?.result)).toBe(true);
        expect(JSON.stringify(storedRun)).not.toContain(FEEDBACK);

        expect((await listLatestWritingRunVersions(ctx, 'course-1', 'a-2')).get(s1.id)).toEqual({ linguistic: 2 });
        await expect(countFeedbackStaleOnApproval(ctx, 'course-1', 'a-2', 'linguistic', 2)).resolves.toBe(1);
        await expect(countFeedbackStaleOnApproval(ctx, 'course-1', 'a-2', 'linguistic', 1)).resolves.toBe(0);
        await expect(countWritingSubmissionsByAssignment(ctx, 'course-1')).resolves.toEqual({ 'a-1': 1, 'a-2': 1 });
    });

    it('stores staff grades and the released grade encrypted, including updates and clears', async () => {
        const submission = await createWritingSubmission(ctx, {
            courseId: 'course-1', assignmentId: 'a-3', studentId: 'student-3', attempt: 1, sourceType: 'manual',
            originalText: ESSAY, verifiedText: ESSAY, requiresVerification: false, status: 'imported'
        });
        const finalAssessment = { lens: 'linguistic' as const, rubricVersion: 1, criteria: [{ criterionId: 'c-1', points: 17 }], totalPoints: 17, maxPoints: 20 };
        const assessmentDraft = { rubricVersion: 1, criteria: [{ criterionId: 'c-1', points: 13 }] };
        await appendWritingReview(ctx, 'course-1', submission.id, {
            feedbackRunId: 'run-1', staffUserId: 'staff-1', studentFeedback: FEEDBACK, finalAssessment, assessmentDraft
        } as Parameters<typeof appendWritingReview>[3]);

        const read = await getWritingSubmission(ctx, 'course-1', submission.id);
        expect(read?.reviews?.[0]).toMatchObject({ finalAssessment, assessmentDraft });
        const storedReview = (await raw.collection('writing-submissions').findOne({ id: submission.id }))?.reviews[0];
        expect(isEnvelope(storedReview.finalAssessment)).toBe(true);
        expect(isEnvelope(storedReview.assessmentDraft)).toBe(true);

        const release = { courseId: 'course-1', submissionId: submission.id, feedbackRunId: 'run-1', status: 'previewed' as const };
        await createWritingRelease(ctx, { ...release, payloadFingerprint: 'fp-graded', grade: 17 });
        await createWritingRelease(ctx, { ...release, payloadFingerprint: 'fp-ungraded', grade: undefined });
        await expect(findWritingReleaseByFingerprint(ctx, 'fp-graded')).resolves.toMatchObject({ grade: 17 });
        await expect(findWritingReleaseByFingerprint(ctx, 'fp-ungraded')).resolves.not.toHaveProperty('grade');
        expect(isEnvelope((await raw.collection('writing-releases').findOne({ payloadFingerprint: 'fp-graded' }))?.grade)).toBe(true);

        // Release updates both rewrite and remove the grade.
        await finalizeWritingRelease(ctx, 'fp-graded', { grade: 18 });
        await expect(findWritingReleaseByFingerprint(ctx, 'fp-graded')).resolves.toMatchObject({ grade: 18 });
        expect(isEnvelope((await raw.collection('writing-releases').findOne({ payloadFingerprint: 'fp-graded' }))?.grade)).toBe(true);
        await finalizeWritingRelease(ctx, 'fp-graded', { grade: undefined });
        await expect(findWritingReleaseByFingerprint(ctx, 'fp-graded')).resolves.not.toHaveProperty('grade');
    });

    it('rejects the aggregation pattern the rewrites replaced', async () => {
        const pipeline = [{ $group: { _id: '$assignmentId', count: { $sum: 1 } } }];
        await expect((async () => ctx.db.collection('writing-submissions').aggregate(pipeline).toArray())())
            .rejects.toBeInstanceOf(EncryptedAggregationNotSupportedError);
    });

    it('stores PUIDs encrypted and still finds users by PUID through the blind index', async () => {
        await createGlobalUser(ctx, { name: 'Synthetic User', puid: PUID, userId: 'user-1', affiliation: 'faculty' });
        await expect(findGlobalUserByPUID(ctx, PUID)).resolves.toMatchObject({ userId: 'user-1', puid: PUID });
        // Sign-in updates are keyed by PUID too.
        await expect(updateGlobalUser(ctx, PUID, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });

        await setInstructorPeriodAllowance(ctx, PUID, 'period-1', ['CHBE 241']);
        await setInstructorPeriodAllowance(ctx, PUID, 'period-1', ['CHBE 241', 'LLED 200']);
        await expect(getAllowanceForInstructorAndPeriod(ctx, PUID, 'period-1'))
            .resolves.toMatchObject({ allowedCourseNames: ['CHBE 241', 'LLED 200'] });
        await expect(raw.collection('instructor-period-allowances').countDocuments()).resolves.toBe(1);

        for (const name of ['active-users', 'instructor-period-allowances']) {
            const stored = await raw.collection(name).findOne({});
            expect(isEnvelope(stored?.puid)).toBe(true);
            expect(typeof stored?.puid__bidx).toBe('string');
            expect(JSON.stringify(stored)).not.toContain(PUID);
        }
    });

    it('lets the admin directory search by partial name, exact PUID, or userId once PUIDs are encrypted', async () => {
        await createGlobalUser(ctx, { name: 'Directory Person', puid: 'SYNTHETICPUID0002', userId: 'user-2', affiliation: 'student' });
        const search = async (text: string) =>
            (await listGlobalUsersForDirectory(ctx, { search: text, page: 1, pageSize: 50 })).users.map((u) => [u.userId, u.puid]);

        await expect(search('directory pers')).resolves.toEqual([['user-2', 'SYNTHETICPUID0002']]);
        await expect(search('SYNTHETICPUID0002')).resolves.toEqual([['user-2', 'SYNTHETICPUID0002']]);
        await expect(search('user-2')).resolves.toEqual([['user-2', 'SYNTHETICPUID0002']]);
        // Partial PUIDs never match: the blind index supports equality only.
        await expect(search('SYNTHETICPUID')).resolves.toEqual([]);
        await expect(listGlobalUsersForDirectory(ctx, { search: 'SYNTHETICPUID0002', page: 1, pageSize: 50 }))
            .resolves.toMatchObject({ total: 1 });
    });

    it('rejects a duplicate PUID once the unique blind index exists', async () => {
        // Throwaway database: the acknowledgement flag is required by the API, not a real backup.
        const report = await ensureBlindIndexes({ db: raw, config: testConfig, collections: ['active-users'], backupConfirmed: true });
        expect(report.ok).toBe(true);
        await expect(createGlobalUser(ctx, { name: 'Duplicate', puid: PUID, userId: 'user-dup', affiliation: 'faculty' }))
            .rejects.toThrow();
    });

    it('encrypts LMS OAuth tokens written by the LMS toolkit token store', async () => {
        const store = createMongoTokenStore(ctx.db as unknown as MongoDbLike, { collectionName: 'canvas_tokens' });
        const tokens = { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: 1, canvasUserId: '42' };
        await store.set('user-1', tokens);

        await expect(store.get('user-1')).resolves.toEqual(tokens);
        const stored = await raw.collection('canvas_tokens').findOne({ userKey: 'user-1' });
        expect(isEnvelope(stored?.tokens.accessToken)).toBe(true);
        expect(isEnvelope(stored?.tokens.refreshToken)).toBe(true);
        expect(JSON.stringify(stored)).not.toContain('synthetic-access');
        expect(JSON.stringify(stored)).not.toContain('synthetic-refresh');
    });
});

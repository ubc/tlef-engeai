/**
 * canvas-roster-sync — reading a linked Canvas course's student roster into stored identities
 *
 * The behaviours pinned here are the ones whose failure modes are silent:
 *
 * - A roster whose rows carry no SIS identifier is a Canvas permission gap, not an empty class.
 *   Writing it as a real roster would replace a good snapshot with nothing and strand everyone
 *   in the course, with no error anywhere.
 * - A failed or credential-less sync must leave the previous snapshot alone. A revoked token is
 *   temporary; a wiped roster is not.
 * - Only hashed identities and Canvas user ids may be stored. A raw `integration_id` reaching
 *   this collection would put a PUID at rest outside `active-users`.
 * - The roster read must be scoped to students. The package's default happens to match, so a
 *   silent widening would pull teachers into student enrollment without failing anything.
 * - Cross-listed sections return one row per enrollment, so one person can appear twice. The
 *   stored count claims to be students, not enrollments.
 */

jest.mock('@ubc/ubc-genai-toolkit-lms-integration', () => ({
    canvas: { getCourseUsers: jest.fn(), loadConfigFromEnv: jest.fn(() => null) },
    // `canvas-config` builds the shared token store at module load, and this suite reaches it
    // transitively through `canvas-credential`. Stubbed so importing the module under test does
    // not require Canvas environment variables.
    createMongoTokenStore: jest.fn(() => ({ get: jest.fn(), set: jest.fn(), delete: jest.fn() })),
    // Mirrors the real helper for the field the coverage guard reads, so that branch is
    // exercised rather than stubbed past.
    rosterFieldCoverage: (users: Array<{ integrationId?: string }>) => ({
        total: users.length,
        integrationId: users.filter((user) => user.integrationId).length,
        sisId: 0,
        email: 0,
        loginId: 0,
    }),
}));
jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { RosterSyncUnavailableError, syncCanvasCourseRoster } from '../canvas-roster-sync';
import { hashRosterPuid, ROSTER_SALT_ENV } from '../../utils/roster-identity';
import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import type { activeCourse, CourseRosterSnapshot } from '../../types/shared';

const INSTRUCTOR_USER_ID = 'user-instructor-1';

function makeCourse(overrides: Partial<activeCourse> = {}): activeCourse {
    return {
        id: 'course-1',
        courseName: 'APSC 183',
        lmsLink: {
            provider: 'canvas',
            courseId: '900',
            name: 'Engineering Analysis',
            code: 'APSC 183',
            linkedAt: new Date('2026-01-05'),
            linkedBy: INSTRUCTOR_USER_ID,
        },
        ...overrides,
    } as activeCourse;
}

function makeMongo() {
    return {
        saveCourseLmsRosterSnapshot: jest.fn().mockResolvedValue(undefined),
        recordLmsRosterSyncOutcome: jest.fn().mockResolvedValue(undefined),
    } as unknown as EngEAI_MongoDB & {
        saveCourseLmsRosterSnapshot: jest.Mock;
        recordLmsRosterSyncOutcome: jest.Mock;
    };
}

/** A resolver that always yields a usable client; the client itself is never called directly. */
const resolveApiOk = jest.fn().mockResolvedValue({} as any);

beforeEach(() => {
    process.env[ROSTER_SALT_ENV] = 'test-salt-value';
    jest.clearAllMocks();
    resolveApiOk.mockResolvedValue({} as any);
});

describe('syncCanvasCourseRoster', () => {
    it('stores one hashed entry per student, carrying the Canvas user id', async () => {
        const mongo = makeMongo();
        const summary = await syncCanvasCourseRoster(mongo, makeCourse(), 'user-admin-1', {
            resolveApi: resolveApiOk,
            fetchRoster: async () => [
                { id: '11', name: 'Student One', integrationId: 'puid-one' },
                { id: '12', name: 'Student Two', integrationId: 'puid-two' },
            ] as any,
        });

        expect(summary.status).toBe('ok');
        expect(summary.rosterSize).toBe(2);
        expect(summary.identifiedCount).toBe(2);

        const snapshot: CourseRosterSnapshot = mongo.saveCourseLmsRosterSnapshot.mock.calls[0][0];
        expect(snapshot.entries).toEqual([
            { puidHash: hashRosterPuid('puid-one'), lmsUserId: '11' },
            { puidHash: hashRosterPuid('puid-two'), lmsUserId: '12' },
        ]);
        expect(snapshot.syncCredentialUserId).toBe(INSTRUCTOR_USER_ID);
        expect(snapshot.triggeredBy).toBe('user-admin-1');
    });

    it('stores no raw identifier and no name', async () => {
        const mongo = makeMongo();
        await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster: async () =>
                [{ id: '11', name: 'Ada Lovelace', integrationId: 'puid-one' }] as any,
        });

        // The whole point of the collection: nothing here may be an institutional identifier.
        const serialized = JSON.stringify(mongo.saveCourseLmsRosterSnapshot.mock.calls[0][0]);
        expect(serialized).not.toContain('puid-one');
        expect(serialized).not.toContain('Ada Lovelace');
    });

    it('reads the student roster, never the default enrollment scope', async () => {
        const mongo = makeMongo();
        const fetchRoster = jest.fn().mockResolvedValue([]);
        await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster,
        });

        expect(fetchRoster).toHaveBeenCalledWith(expect.anything(), '900');
    });

    it('treats a roster with rows but no identifiers as a permission gap, not an empty class', async () => {
        const mongo = makeMongo();
        const summary = await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster: async () =>
                [
                    { id: '11', name: 'Student One' },
                    { id: '12', name: 'Student Two' },
                ] as any,
        });

        expect(summary.status).toBe('identifiers_withheld');
        expect(summary.rosterSize).toBe(2);
        expect(summary.identifiedCount).toBe(0);
        // The previous snapshot must survive: overwriting it would strand the class.
        expect(mongo.saveCourseLmsRosterSnapshot).not.toHaveBeenCalled();
        expect(mongo.recordLmsRosterSyncOutcome).toHaveBeenCalledWith('course-1', 'identifiers_withheld');
    });

    it('keeps partial coverage rather than discarding the students it can match', async () => {
        const mongo = makeMongo();
        const summary = await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster: async () =>
                [
                    { id: '11', name: 'Student One', integrationId: 'puid-one' },
                    { id: '12', name: 'Student Two' },
                ] as any,
        });

        expect(summary.status).toBe('ok');
        expect(summary.rosterSize).toBe(2);
        expect(summary.identifiedCount).toBe(1);
        expect(summary.message).toContain('course code');
    });

    it('collapses one person appearing in two sections of a cross-listed course', async () => {
        const mongo = makeMongo();
        const summary = await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster: async () =>
                [
                    { id: '11', name: 'Student One', integrationId: 'puid-one' },
                    { id: '11', name: 'Student One', integrationId: 'puid-one' },
                ] as any,
        });

        const snapshot: CourseRosterSnapshot = mongo.saveCourseLmsRosterSnapshot.mock.calls[0][0];
        expect(snapshot.entries).toHaveLength(1);
        // rosterSize stays honest about what Canvas returned; entries describe people.
        expect(summary.rosterSize).toBe(2);
    });

    it('names the unpublished course behind an empty roster, and keeps the old snapshot', async () => {
        const mongo = makeMongo();
        const summary = await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster: async () => [] as any,
            fetchWorkflowState: async () => 'unpublished',
        });

        // Canvas holds enrollments in `creation_pending` until a course is published, so it
        // reports nobody regardless of who is enrolled. Writing that as a real empty roster
        // would replace a good snapshot on the strength of a Canvas setup step.
        expect(summary.status).toBe('unpublished');
        expect(summary.message).toMatch(/publish/i);
        expect(mongo.saveCourseLmsRosterSnapshot).not.toHaveBeenCalled();
        expect(mongo.recordLmsRosterSyncOutcome).toHaveBeenCalledWith('course-1', 'unpublished');
    });

    it('stores a genuinely empty roster on a published course', async () => {
        const mongo = makeMongo();
        const summary = await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster: async () => [] as any,
            fetchWorkflowState: async () => 'available',
        });

        // A published course with nobody in it is a legitimate state, not an error, and the
        // snapshot is written so `syncedAt` advances rather than reading as "never synced".
        expect(summary.status).toBe('ok');
        expect(summary.message).toMatch(/no students/i);
        expect(mongo.saveCourseLmsRosterSnapshot).toHaveBeenCalled();
        expect(mongo.saveCourseLmsRosterSnapshot.mock.calls[0][0].entries).toEqual([]);
    });

    it('treats an unreadable publish state as an ordinary empty roster', async () => {
        const mongo = makeMongo();
        const summary = await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster: async () => [] as any,
            fetchWorkflowState: async () => null,
        });

        // The publish check exists only to explain an empty result; failing to explain it must
        // not turn a successful sync into a failed one.
        expect(summary.status).toBe('ok');
        expect(mongo.saveCourseLmsRosterSnapshot).toHaveBeenCalled();
    });

    it('does not check the publish state when the roster is non-empty', async () => {
        const mongo = makeMongo();
        const fetchWorkflowState = jest.fn();

        await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster: async () =>
                [{ id: '11', name: 'Student One', integrationId: 'puid-one' }] as any,
            fetchWorkflowState,
        });

        // The common path must not pay for the diagnostic.
        expect(fetchWorkflowState).not.toHaveBeenCalled();
    });

    it('reports no_credential without touching the stored roster', async () => {
        const mongo = makeMongo();
        const summary = await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: async () => null,
            fetchRoster: async () => [] as any,
        });

        expect(summary.status).toBe('no_credential');
        expect(mongo.saveCourseLmsRosterSnapshot).not.toHaveBeenCalled();
        expect(mongo.recordLmsRosterSyncOutcome).toHaveBeenCalledWith('course-1', 'no_credential');
    });

    it('runs under the importing instructor, not whoever triggered the sync', async () => {
        const mongo = makeMongo();
        await syncCanvasCourseRoster(mongo, makeCourse(), 'user-admin-1', {
            resolveApi: resolveApiOk,
            fetchRoster: async () => [] as any,
        });

        // An admin holds no Canvas enrollment; using their credential would always fail.
        expect(resolveApiOk).toHaveBeenCalledWith(INSTRUCTOR_USER_ID);
    });

    it('survives a Canvas failure without clearing the roster or leaking the payload', async () => {
        const mongo = makeMongo();
        const summary = await syncCanvasCourseRoster(mongo, makeCourse(), undefined, {
            resolveApi: resolveApiOk,
            fetchRoster: async () => {
                throw new Error('Canvas 503');
            },
        });

        expect(summary.status).toBe('failed');
        expect(mongo.saveCourseLmsRosterSnapshot).not.toHaveBeenCalled();
        expect(mongo.recordLmsRosterSyncOutcome).toHaveBeenCalledWith('course-1', 'failed', 'Canvas 503');
    });

    it('refuses a course with no Canvas link', async () => {
        const mongo = makeMongo();
        await expect(
            syncCanvasCourseRoster(mongo, makeCourse({ lmsLink: undefined }), undefined, {
                resolveApi: resolveApiOk,
                fetchRoster: async () => [] as any,
            })
        ).rejects.toBeInstanceOf(RosterSyncUnavailableError);
    });

    it('refuses before reading a roster it could not store', async () => {
        delete process.env[ROSTER_SALT_ENV];
        const mongo = makeMongo();
        const fetchRoster = jest.fn();

        await expect(
            syncCanvasCourseRoster(mongo, makeCourse(), undefined, { resolveApi: resolveApiOk, fetchRoster })
        ).rejects.toBeInstanceOf(RosterSyncUnavailableError);

        // Reading a class roster for a sync that cannot hash it would be personal data for nothing.
        expect(fetchRoster).not.toHaveBeenCalled();
    });
});

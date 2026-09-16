/**
 * canvas-identity-once — the connected Canvas account is checked once per connection
 *
 * The check can read a roster, so repeating it on every import and release would be wasteful; not
 * repeating it after a reconnect as someone else would be unsafe. A TA synced from the course
 * roster must pass without Canvas, since a TA may not be allowed to read SIS identifiers.
 */

jest.mock('../canvas-config', () => ({ canvasConfig: { tokenStore: { get: jest.fn() } } }));
jest.mock('../canvas-course-sync', () => {
    class CanvasIdentityError extends Error {
        constructor(message: string, readonly reason: string) {
            super(message);
        }
    }
    return {
        assertInstructorIdentity: jest.fn(),
        CanvasIdentityError,
        CANVAS_ACCOUNT_MISMATCH_MESSAGE: 'belongs to someone else',
    };
});

import { canvasConfig } from '../canvas-config';
import { assertInstructorIdentity, CanvasIdentityError } from '../canvas-course-sync';
import { ensureCanvasIdentityVerified } from '../canvas-identity-once';
import { hashRosterPuid, ROSTER_SALT_ENV } from '../../utils/roster-identity';
import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';

const tokenGet = (canvasConfig as unknown as { tokenStore: { get: jest.Mock } }).tokenStore.get;
const assertIdentity = assertInstructorIdentity as jest.Mock;
const api = {} as Parameters<typeof ensureCanvasIdentityVerified>[0]['api'];

function mongoWith(user: Record<string, unknown> | null, snapshot: Record<string, unknown> | null = null) {
    return {
        findGlobalUserByUserId: jest.fn(async () => user),
        recordVerifiedCanvasAccount: jest.fn(async () => undefined),
        getCourseLmsRosterSnapshot: jest.fn(async () => snapshot),
    };
}

const staff = { userId: 'staff-1', puid: 'PUID_STAFF', affiliation: 'faculty' };

function run(mongo: ReturnType<typeof mongoWith>) {
    return ensureCanvasIdentityVerified({
        api,
        mongo: mongo as unknown as EngEAI_MongoDB,
        userKey: 'staff-1',
        courseId: 'course-1',
        canvasCourseId: '742'
    });
}

function rosterOf(entries: Array<Record<string, unknown>>, lmsCourseId = '742') {
    return { courseId: 'course-1', lmsCourseId, entries };
}

beforeEach(() => {
    process.env[ROSTER_SALT_ENV] = 'test-salt-value';
    tokenGet.mockReset();
    assertIdentity.mockReset();
});

describe('ensureCanvasIdentityVerified', () => {
    it('asks nothing when this connection’s account was already verified', async () => {
        tokenGet.mockResolvedValue({ canvasUserId: 11 });
        const mongo = mongoWith({ ...staff, canvasVerifiedUserId: '11' });

        await run(mongo);

        expect(assertIdentity).not.toHaveBeenCalled();
        expect(mongo.getCourseLmsRosterSnapshot).not.toHaveBeenCalled();
        expect(mongo.recordVerifiedCanvasAccount).not.toHaveBeenCalled();
    });

    it('verifies an unverified connection against teachers and TAs, then remembers it', async () => {
        tokenGet.mockResolvedValue({ canvasUserId: '11' });
        assertIdentity.mockResolvedValue('11');
        const mongo = mongoWith(staff);

        await run(mongo);

        expect(assertIdentity).toHaveBeenCalledWith(api, '742', staff, ['teacher', 'ta']);
        expect(mongo.recordVerifiedCanvasAccount).toHaveBeenCalledWith('staff-1', '11');
    });

    it('verifies again when the connection now names a different Canvas account', async () => {
        tokenGet.mockResolvedValue({ canvasUserId: '99' });
        assertIdentity.mockRejectedValue(new CanvasIdentityError('belongs to someone else', 'mismatch'));
        const mongo = mongoWith({ ...staff, canvasVerifiedUserId: '11' });

        await expect(run(mongo)).rejects.toMatchObject({ reason: 'mismatch' });
        expect(mongo.recordVerifiedCanvasAccount).not.toHaveBeenCalled();
    });

    it('does not remember an account the stored connection cannot name', async () => {
        tokenGet.mockResolvedValue({ canvasUserId: undefined });
        assertIdentity.mockResolvedValue('11');
        const mongo = mongoWith(staff);

        await run(mongo);

        expect(assertIdentity).toHaveBeenCalled();
        expect(mongo.recordVerifiedCanvasAccount).not.toHaveBeenCalled();
    });

    it('refuses a user with no active-users record without calling Canvas', async () => {
        tokenGet.mockResolvedValue({ canvasUserId: '11' });

        await expect(run(mongoWith(null))).rejects.toThrow('No active-users record');
        expect(assertIdentity).not.toHaveBeenCalled();
    });

    describe('with a synced course roster', () => {
        it('recognizes a synced TA without asking Canvas', async () => {
            tokenGet.mockResolvedValue({ canvasUserId: '21' });
            const mongo = mongoWith(staff, rosterOf([{ puidHash: hashRosterPuid('PUID_STAFF'), lmsUserId: '21', role: 'ta' }]));

            await run(mongo);

            expect(assertIdentity).not.toHaveBeenCalled();
            expect(mongo.recordVerifiedCanvasAccount).toHaveBeenCalledWith('staff-1', '21');
        });

        it('refuses an account the roster ties to someone else', async () => {
            tokenGet.mockResolvedValue({ canvasUserId: '21' });
            const mongo = mongoWith(staff, rosterOf([{ puidHash: hashRosterPuid('PUID_OTHER'), lmsUserId: '21', role: 'student' }]));

            await expect(run(mongo)).rejects.toMatchObject({ reason: 'mismatch' });
            expect(assertIdentity).not.toHaveBeenCalled();
            expect(mongo.recordVerifiedCanvasAccount).not.toHaveBeenCalled();
        });

        it('asks Canvas when the roster lists this person only as a student', async () => {
            tokenGet.mockResolvedValue({ canvasUserId: '21' });
            assertIdentity.mockResolvedValue('21');
            const mongo = mongoWith(staff, rosterOf([{ puidHash: hashRosterPuid('PUID_STAFF'), lmsUserId: '21', role: 'student' }]));

            await run(mongo);

            expect(assertIdentity).toHaveBeenCalled();
        });

        it('ignores a roster read from a different Canvas course', async () => {
            tokenGet.mockResolvedValue({ canvasUserId: '21' });
            assertIdentity.mockResolvedValue('21');
            const mongo = mongoWith(staff, rosterOf([{ puidHash: hashRosterPuid('PUID_OTHER'), lmsUserId: '21', role: 'ta' }], '999'));

            await run(mongo);

            expect(assertIdentity).toHaveBeenCalled();
        });

        it('tells a TA to ask for a roster sync when Canvas withholds SIS identifiers', async () => {
            tokenGet.mockResolvedValue({ canvasUserId: '21' });
            assertIdentity.mockRejectedValue(new CanvasIdentityError('ask your Canvas administrator', 'identifiers_withheld'));
            const mongo = mongoWith(staff, rosterOf([]));

            await expect(run(mongo)).rejects.toMatchObject({
                reason: 'identifiers_withheld',
                message: expect.stringContaining('ask an instructor to sync the course roster'),
            });
        });
    });
});

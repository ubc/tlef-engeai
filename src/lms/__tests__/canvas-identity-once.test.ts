/**
 * canvas-identity-once — the connected Canvas account is checked once per connection
 *
 * The check reads a roster, so repeating it on every import and release would be wasteful; not
 * repeating it after a reconnect as someone else would be unsafe. Both edges are pinned here.
 */

jest.mock('../canvas-config', () => ({ canvasConfig: { tokenStore: { get: jest.fn() } } }));
jest.mock('../canvas-course-sync', () => ({ assertInstructorIdentity: jest.fn() }));

import { canvasConfig } from '../canvas-config';
import { assertInstructorIdentity } from '../canvas-course-sync';
import { ensureCanvasIdentityVerified } from '../canvas-identity-once';
import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';

const tokenGet = (canvasConfig as unknown as { tokenStore: { get: jest.Mock } }).tokenStore.get;
const assertIdentity = assertInstructorIdentity as jest.Mock;
const api = {} as Parameters<typeof ensureCanvasIdentityVerified>[0]['api'];

function mongoWith(user: Record<string, unknown> | null) {
    return {
        findGlobalUserByUserId: jest.fn(async () => user),
        recordVerifiedCanvasAccount: jest.fn(async () => undefined)
    };
}

const staff = { userId: 'staff-1', puid: 'PUID_STAFF', affiliation: 'faculty' };

function run(mongo: ReturnType<typeof mongoWith>) {
    return ensureCanvasIdentityVerified({
        api,
        mongo: mongo as unknown as EngEAI_MongoDB,
        userKey: 'staff-1',
        canvasCourseId: '742'
    });
}

beforeEach(() => {
    tokenGet.mockReset();
    assertIdentity.mockReset();
});

describe('ensureCanvasIdentityVerified', () => {
    it('asks Canvas nothing when this connection’s account was already verified', async () => {
        tokenGet.mockResolvedValue({ canvasUserId: 11 });
        const mongo = mongoWith({ ...staff, canvasVerifiedUserId: '11' });

        await run(mongo);

        expect(assertIdentity).not.toHaveBeenCalled();
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
        assertIdentity.mockRejectedValue(Object.assign(new Error('belongs to someone else'), { reason: 'mismatch' }));
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
});

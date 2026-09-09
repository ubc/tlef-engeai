/**
 * Off-request Canvas client tests
 *
 * A queued release runs minutes or hours after the staff member who queued it left the page,
 * so it cannot use `req.canvasApi`. It rebuilds that person's client from the stored OAuth
 * tokens instead, which means reproducing what `canvas.requireAuth` does inline: refresh when
 * the access token is near expiry, persist the refreshed pair, and drop a credential whose
 * refresh was rejected rather than retrying with a dead token.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for rebuilding a staff member's Canvas client outside a request.
 */

const tokenStore = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
};
const refreshTokens = jest.fn();
const createApiClient = jest.fn((..._args: unknown[]) => ({ get: jest.fn() }) as unknown);

jest.mock('../../lms/canvas-config', () => ({
    get canvasConfig() {
        return {
            canvasDomain: 'canvas.test',
            clientId: 'id',
            clientSecret: 'secret',
            redirectUri: 'https://app.test/cb',
            tokenStore
        };
    }
}));

jest.mock('@ubc/ubc-genai-toolkit-lms-integration', () => ({
    canvas: {
        refreshTokens,
        createApiClient
    }
}));

import { resolveCanvasClientForUser } from '../canvas-client-for-user';

const hourFromNow = () => Date.now() + 3_600_000;

describe('resolveCanvasClientForUser', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        createApiClient.mockReturnValue({ get: jest.fn() });
    });

    it('returns null when the user has no stored canvas tokens', async () => {
        tokenStore.get.mockResolvedValue(null);
        expect(await resolveCanvasClientForUser('user-1')).toBeNull();
        expect(createApiClient).not.toHaveBeenCalled();
    });

    it('builds a client from a token that is still valid', async () => {
        tokenStore.get.mockResolvedValue({ accessToken: 'live', refreshToken: 'r', expiresAt: hourFromNow() });
        expect(await resolveCanvasClientForUser('user-1')).not.toBeNull();
        expect(refreshTokens).not.toHaveBeenCalled();
        expect(createApiClient).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'live' }));
    });

    it('refreshes and persists a token that is about to expire', async () => {
        tokenStore.get.mockResolvedValue({ accessToken: 'old', refreshToken: 'r', expiresAt: Date.now() + 1000 });
        refreshTokens.mockResolvedValue({ accessToken: 'new', expiresAt: hourFromNow() });

        expect(await resolveCanvasClientForUser('user-1')).not.toBeNull();

        expect(tokenStore.set).toHaveBeenCalledWith('user-1', expect.objectContaining({ accessToken: 'new' }));
        expect(createApiClient).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'new' }));
    });

    it('keeps the existing refresh token when Canvas returns none', async () => {
        tokenStore.get.mockResolvedValue({ accessToken: 'old', refreshToken: 'keep-me', expiresAt: 0 });
        refreshTokens.mockResolvedValue({ accessToken: 'new', expiresAt: hourFromNow() });

        await resolveCanvasClientForUser('user-1');

        expect(tokenStore.set).toHaveBeenCalledWith('user-1', expect.objectContaining({ refreshToken: 'keep-me' }));
    });

    it('drops a credential whose refresh was rejected', async () => {
        tokenStore.get.mockResolvedValue({ accessToken: 'old', refreshToken: 'r', expiresAt: 0 });
        refreshTokens.mockRejectedValue(new Error('revoked'));

        expect(await resolveCanvasClientForUser('user-1')).toBeNull();
        expect(tokenStore.delete).toHaveBeenCalledWith('user-1');
        expect(createApiClient).not.toHaveBeenCalled();
    });
});

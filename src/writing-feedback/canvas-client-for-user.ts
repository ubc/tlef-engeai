/**
 * Off-request Canvas client — acting as a staff member who has already left
 *
 * A queued release runs after the staff member who queued it has closed the page, so
 * `req.canvasApi` does not exist. The credential does: `canvas-config.ts` persists Canvas OAuth
 * tokens in Mongo keyed by `GlobalUser.userId`, never a PUID, and they outlive the request.
 *
 * This reproduces what `canvas.requireAuth` does inline — read, refresh near expiry, persist,
 * and build a client that refreshes again on a 401 — without the Express middleware around it.
 * It deliberately reuses the shared `canvasConfig`: building a second config would key a second
 * token collection and split each user's credential in two, which that module's own header
 * warns about.
 *
 * Acting as an absent person has a boundary. If the credential has been revoked or the user has
 * lost Canvas access in the meantime, this returns `null` and the caller fails the job with a
 * message asking that person to reconnect. It never falls back to another user's token.
 *
 * Never logs a token, a refresh token, or a user key.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Rebuilds one staff member's authenticated Canvas client outside a request.
 */

import { canvas } from '@ubc/ubc-genai-toolkit-lms-integration';
import { canvasConfig } from '../lms/canvas-config';

/** Refresh proactively inside this window, matching the package's own middleware. */
const REFRESH_BUFFER_MS = 60_000;

/** The authenticated client shape the release path consumes. */
export type CanvasApiClient = ReturnType<typeof canvas.createApiClient>;

/**
 * The credential shape the package stores and expects back.
 *
 * Taken from the token store rather than redeclared: `canvasUserId` is required on the way in,
 * so an approximation with it optional would not round-trip through `tokenStore.set`.
 */
type StoredTokens = NonNullable<Awaited<ReturnType<NonNullable<typeof canvasConfig>['tokenStore']['get']>>>;

/**
 * resolveCanvasClientForUser - rebuilds one staff member's Canvas client from stored tokens.
 *
 * @param userKey - `GlobalUser.userId` of the staff member to act as
 * @returns An authenticated client, or `null` when there is no usable credential
 */
export async function resolveCanvasClientForUser(userKey: string): Promise<CanvasApiClient | null> {
    const config = canvasConfig;
    if (!config) return null;

    let tokens = await config.tokenStore.get(userKey) as StoredTokens | null;
    if (!tokens) return null;

    if (tokens.expiresAt <= Date.now() + REFRESH_BUFFER_MS) {
        try {
            const refreshed = await canvas.refreshTokens(config, tokens.refreshToken);
            tokens = {
                accessToken: refreshed.accessToken,
                // Canvas does not always return a new refresh token; keeping the old one is
                // what makes a long-lived credential survive repeated refreshes.
                refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
                expiresAt: refreshed.expiresAt,
                canvasUserId: tokens.canvasUserId
            };
            await config.tokenStore.set(userKey, tokens);
        } catch {
            // A rejected refresh means the grant is gone. Delete the stale entry rather than
            // leaving a dead credential that fails every future job in the same way.
            await config.tokenStore.delete(userKey);
            return null;
        }
    }

    const current = tokens;
    return canvas.createApiClient({
        canvasDomain: config.canvasDomain,
        accessToken: current.accessToken,
        allowedDownloadHostSuffixes: config.allowedDownloadHostSuffixes,
        allowedUploadHostSuffixes: config.allowedUploadHostSuffixes,
        onUnauthorized: async () => {
            try {
                const refreshed = await canvas.refreshTokens(config, current.refreshToken);
                await config.tokenStore.set(userKey, {
                    accessToken: refreshed.accessToken,
                    refreshToken: refreshed.refreshToken ?? current.refreshToken,
                    expiresAt: refreshed.expiresAt,
                    canvasUserId: current.canvasUserId
                });
                return refreshed.accessToken;
            } catch {
                await config.tokenStore.delete(userKey);
                return null;
            }
        }
    });
}

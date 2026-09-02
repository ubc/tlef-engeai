// canvas-credential.ts
/**
 * canvas-credential.ts
 *
 * Builds an authenticated Canvas client for a **stored** user, outside any request.
 *
 * Everything else in EngE-AI reaches Canvas through `canvas.requireAuth(...)`, which resolves the
 * signed-in user's token from the request. Roster sync cannot: it runs on a schedule with nobody
 * signed in, and when an admin triggers it manually the caller is deliberately not the account
 * whose credential is used — an EngE-AI admin holds no Canvas enrollment, so their own token
 * could not read the roster even if they had one.
 *
 * The credential therefore belongs to the *course*, not the caller. `activeCourse.lmsLink.linkedBy`
 * names the instructor who imported the course, and their stored token is what every roster read
 * runs under, whoever pressed the button.
 *
 * **This module widens who can act with someone's Canvas credential, so it is deliberately narrow.**
 * It exposes one function, returns a client and nothing else, and never surfaces a token to a
 * caller. Authorization to *use* it is decided upstream by route middleware; nothing here is an
 * authorization check, and it must not be treated as one.
 *
 * The refresh-and-persist behaviour mirrors the package's own `middleware.ts` deliberately,
 * including the part that looks harsh: when a refresh fails the stored credential is deleted. A
 * refresh token Canvas rejects is dead, and keeping it would make every future sync retry a
 * credential that cannot recover. The instructor reconnects; the roster survives in the meantime
 * because a failed sync never clears the stored snapshot.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Resolves a Canvas API client for a stored user key, for request-less LMS reads.
 */

import { canvas } from '@ubc/ubc-genai-toolkit-lms-integration';
import { canvasConfig } from './canvas-config';
import { appLogger } from '../utils/logger';

/** The package's authenticated Canvas client. */
export type CanvasApiClient = NonNullable<Parameters<typeof canvas.getCourses>[0]>;

/**
 * Refresh a token this many milliseconds before it expires.
 *
 * A sync is a multi-request operation, so a token that is merely *valid right now* is not good
 * enough — it can lapse between the roster's first page and its last. Matches the package's own
 * buffer.
 */
const REFRESH_BUFFER_MS = 60_000;

/**
 * resolveCanvasApiForUser — an authenticated Canvas client for a stored user key.
 *
 * @param userKey - `GlobalUser.userId` whose stored Canvas authorization to act under. Never a
 * PUID: the token store is keyed by internal user id, per `resolveUserKey`.
 *
 * @returns A client, or `null` when Canvas is not configured, the user has no stored
 * authorization, or their refresh token has been revoked. `null` is an ordinary outcome that
 * callers must handle — it is what a sync reports as `no_credential`, not an error condition.
 */
export async function resolveCanvasApiForUser(userKey: string): Promise<CanvasApiClient | null> {
    if (!canvasConfig || !userKey) {
        return null;
    }

    // Bound once so the closures below keep the narrowed type; `canvasConfig` is a nullable
    // module export and TypeScript cannot carry the narrowing into a callback.
    const config = canvasConfig;

    let tokens = await config.tokenStore.get(userKey);
    if (!tokens) {
        return null;
    }

    // Refresh ahead of expiry rather than waiting for a 401, so a long roster read cannot expire
    // partway through.
    if (tokens.expiresAt <= Date.now() + REFRESH_BUFFER_MS) {
        try {
            const refreshed = await canvas.refreshTokens(config, tokens.refreshToken);
            tokens = {
                accessToken: refreshed.accessToken,
                // Canvas only sometimes rotates the refresh token; keep the old one when it does not.
                refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
                expiresAt: refreshed.expiresAt,
                canvasUserId: tokens.canvasUserId,
            };
            await config.tokenStore.set(userKey, tokens);
        } catch {
            await config.tokenStore.delete(userKey);
            // No identifiers: the key is an internal user id, but the surrounding context is a
            // named person and this line ends up in shared logs.
            appLogger.warn('[canvas-credential] Stored Canvas authorization could not be refreshed; cleared');
            return null;
        }
    }

    const current = tokens;
    return canvas.createApiClient({
        canvasDomain: config.canvasDomain,
        accessToken: current.accessToken,
        allowedDownloadHostSuffixes: config.allowedDownloadHostSuffixes,
        onUnauthorized: async () => {
            try {
                const refreshed = await canvas.refreshTokens(config, current.refreshToken);
                await config.tokenStore.set(userKey, {
                    accessToken: refreshed.accessToken,
                    refreshToken: refreshed.refreshToken ?? current.refreshToken,
                    expiresAt: refreshed.expiresAt,
                    canvasUserId: current.canvasUserId,
                });
                return refreshed.accessToken;
            } catch {
                await config.tokenStore.delete(userKey);
                return null;
            }
        },
    }) as CanvasApiClient;
}

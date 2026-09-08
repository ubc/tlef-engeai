/**
 * canvas-config.ts
 *
 * The single Canvas OAuth configuration, shared by every router that needs an authenticated
 * Canvas client.
 *
 * This exists because more than one feature now reads Canvas on behalf of the signed-in user:
 * `route-lms.ts` for course import/enrollment, and `route-writing-feedback.ts` for submission
 * intake. Both need `canvas.requireAuth(...)`, and both must resolve the *same* token store —
 * building a second config would key a second collection and silently split each user's
 * credential in two.
 *
 * Two invariants travel with this module:
 *
 * 1. **PUID never leaves `active-users`.** The store is keyed by `GlobalUser.userId`, resolved
 *    per request from the signed-in user's PUID. See {@link resolveUserKey}.
 * 2. **Missing configuration disables Canvas rather than crashing the app.** `loadConfigFromEnv`
 *    throws when its variables are unset, so the config is built behind a presence check and is
 *    `null` when Canvas is not deployed. Callers must branch on it, never assert it.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Shared Canvas OAuth config and per-user token-store key resolution.
 */

import type { Request } from 'express';
import { canvas, createMongoTokenStore } from '@ubc/ubc-genai-toolkit-lms-integration';
import type { MongoDbLike } from '@ubc/ubc-genai-toolkit-lms-integration';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';

/** Mount point of the LMS router, and the prefix every `basePath` builds on. */
export const LMS_BASE_PATH = '/api/lms';

/** Canvas OAuth router mount. Must line up with `CANVAS_REDIRECT_URI`'s path. */
export const CANVAS_BASE_PATH = `${LMS_BASE_PATH}/canvas/auth`;

/**
 * Environment variables Canvas requires. `loadConfigFromEnv` throws and names the missing
 * ones; this list lets us decide whether to call it at all.
 */
export const CANVAS_REQUIRED_ENV = [
    'CANVAS_DOMAIN',
    'CANVAS_CLIENT_ID',
    'CANVAS_CLIENT_SECRET',
    'CANVAS_REDIRECT_URI',
] as const;

/**
 * The Canvas OAuth scopes EngE-AI requests, one per endpoint the app calls.
 *
 * A Developer Key's scope list is only a ceiling. Canvas grants what the authorize URL asks
 * for, never what the key permits. Requesting nothing against a key with Enforce Scopes on is
 * refused with `error=invalid_scope`, which the OAuth callback reports only as a missing
 * authorization code.
 *
 * Adding a Canvas call means adding its scope here. Canvas compares the strings literally.
 */
export const CANVAS_OAUTH_SCOPES: readonly string[] = [
    'url:GET|/api/v1/users/:id',
    'url:GET|/api/v1/courses',
    'url:GET|/api/v1/courses/:course_id/sections',
    'url:GET|/api/v1/courses/:course_id/users',
    'url:GET|/api/v1/courses/:course_id/enrollments',
    'url:GET|/api/v1/courses/:course_id/assignments',
    'url:GET|/api/v1/courses/:course_id/assignments/:id',
    'url:GET|/api/v1/courses/:course_id/assignments/:assignment_id/submissions',
    'url:GET|/api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id',
    'url:POST|/api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id/comments/files',
    'url:PUT|/api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id',
    'url:POST|/api/v1/courses/:course_id/assignments/:assignment_id/submissions/update_grades',
    'url:GET|/api/v1/progress/:id',
] as const;

/**
 * canvasAuthorizeScopeParams — the scopes as Canvas expects them on the authorize URL.
 *
 * Canvas takes `scope` as one space-separated parameter (RFC 6749 §3.3). The package appends
 * one parameter per array entry, and Rails resolves repeated scalar params as last-one-wins —
 * so an array arrives as a single scope, the authorization still succeeds because that scope is
 * on the key, and every call outside it is refused with a bare 401. Collapsing to one entry
 * sends the documented form.
 *
 * @returns A single element holding the space-separated scope list
 */
export function canvasAuthorizeScopeParams(): string[] {
    return [CANVAS_OAUTH_SCOPES.join(' ')];
}

/** True when every named variable is set to a non-empty value. */
export function hasEnv(names: readonly string[]): boolean {
    return names.every((name) => Boolean(process.env[name]));
}

/**
 * resolveUserKey — derives the token-store key for the signed-in user.
 *
 * The LMS package persists this value as the document key in the token collections. It must
 * therefore **never** be the PUID: `active-users` is the only collection permitted to store
 * one. `GlobalUser.userId` is the stable internal identifier and is what gets persisted here.
 *
 * The lookup is asynchronous because `req.user` carries only the PUID; the package accepts
 * `string | Promise<string>` for exactly this case.
 *
 * Exported for testing: the PUID-never-persisted invariant is the single most important
 * behaviour in this module and must be regression-guarded.
 *
 * @param req - Express request carrying the passport-authenticated user
 * @returns The user's internal `GlobalUser.userId`
 * @throws {Error} When no user is signed in, or has no `active-users` record
 */
export async function resolveUserKey(req: Request): Promise<string> {
    const puid = (req as any).user?.puid;
    if (!puid) {
        throw new Error('LMS token lookup attempted without an authenticated user');
    }

    const mongoDB = await EngEAI_MongoDB.getInstance();
    const globalUser = await mongoDB.findGlobalUserByPUID(puid);
    if (!globalUser) {
        // Deliberately does not include the PUID — it must not reach logs.
        throw new Error('No active-users record for the signed-in user');
    }

    return globalUser.userId;
}

/**
 * Resolves the shared `Db` handle lazily, so this module does not force a connect at import
 * time.
 *
 * The cast is necessary and sound. The package models `MongoCollectionLike` structurally and
 * documents that "any real `Collection` instance satisfies this shape as-is" — which does not
 * hold against the mongodb 6.x driver: the package types `createIndex`'s spec as
 * `Record<string, unknown>` while the driver types it `IndexSpecification`, and neither is
 * assignable to the other, so even bivariant method checking rejects it. At runtime the
 * adapter only ever calls `createIndex({ userKey: 1 }, { unique: true })`, which is a valid
 * `IndexSpecification`, so the structural contract genuinely is satisfied.
 */
const mongoDbProvider = async (): Promise<MongoDbLike> =>
    (await EngEAI_MongoDB.getInstance()).db as unknown as MongoDbLike;

/**
 * Canvas configuration, or `null` when the provider is not configured.
 *
 * A separate collection per provider is mandatory: the store is keyed only by `userKey`, with
 * no provider discriminator, so a shared collection would have each provider silently
 * overwrite the other's tokens.
 */
export const canvasConfig = hasEnv(CANVAS_REQUIRED_ENV)
    ? canvas.loadConfigFromEnv({
          tokenStore: createMongoTokenStore(mongoDbProvider, {
              collectionName: process.env.CANVAS_TOKEN_COLLECTION_NAME || 'canvas_tokens',
          }),
          getUserKey: resolveUserKey,
          basePath: CANVAS_BASE_PATH,
          scopes: canvasAuthorizeScopeParams(),
      })
    : null;

/** The Mongo collection backing Canvas tokens; reported by diagnostics, never its contents. */
export const canvasTokenCollectionName = process.env.CANVAS_TOKEN_COLLECTION_NAME || 'canvas_tokens';

export { mongoDbProvider };

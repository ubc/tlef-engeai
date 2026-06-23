/**
 * auth-global-user.ts
 *
 * Post-authentication GlobalUser reconciliation (platform admin flags, etc.).
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { GlobalUser } from '../types/shared';
import { ensurePlatformAdminGlobalUser } from '../utils/admin';

/** Reconcile GlobalUser after SAML/local login before session assignment. */
export async function finalizeGlobalUserAfterAuth(
    mongoDB: EngEAI_MongoDB,
    globalUser: GlobalUser,
    puid: string
): Promise<GlobalUser> {
    return ensurePlatformAdminGlobalUser(mongoDB, globalUser, puid);
}

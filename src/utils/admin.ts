/**
 * Platform admin utilities.
 *
 * Admins are identified by full name (not PUID) via the ADMINS env var, a
 * comma-separated list, e.g. ADMINS=Richard Tape,Charisma Rusdiyanto
 * Matching is fuzzy (handles middle initials/suffix variation) via namesMatch.
 */

import type { GlobalUser } from '../types/shared';
import { namesMatch } from './name-matching';

/** True when the global user has platform admin privileges. */
export function isAdminUser(globalUser: GlobalUser | null | undefined): boolean {
    return globalUser?.isAdmin === true;
}

function getAdminNames(): string[] {
    return (process.env.ADMINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/** True if the given name matches an entry in the ADMINS allowlist. */
export function isAdminName(name: string | undefined): boolean {
    if (!name) return false;
    return getAdminNames().some((adminName) => namesMatch(adminName, name));
}

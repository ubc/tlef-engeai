/**
 * Affiliation resolution utilities
 *
 * Handles reconciliation between CWL-derived affiliation and database-stored affiliation.
 * When a user has dual roles (e.g. student + instructor), CWL takes precedence and
 * the database is updated to match. Users named in the ADMINS allowlist are always
 * treated as faculty (bypass CWL affiliation).
 */

import { isAdminName } from './admin';

/**
 * Checks if the given name is in the ADMINS allowlist (always treated as faculty).
 */
export function isFacultyOverrideName(name: string): boolean {
    return isAdminName(name);
}

/** Affiliation values used in the system */
export type AffiliationValue = 'student' | 'faculty' | 'staff' | 'empty';

/** Result of affiliation resolution */
export interface AffiliationResolution {
    /** The effective affiliation to use for the session */
    affiliation: string;
    /** Whether the database record should be updated to match CWL */
    needsDbUpdate: boolean;
}

/**
 * Resolves the effective affiliation by comparing CWL-derived affiliation with the database.
 *
 * - Names in the ADMINS allowlist: Always faculty (bypass CWL)
 * - Others: When DB affiliation differs from CWL, use CWL and flag for DB update.
 *   This corrects inconsistent DB data (e.g. user with student+instructor roles stored as faculty).
 *
 * @param cwlAffiliation - Affiliation from Passport (mapAffiliation of eduPersonAffiliation)
 * @param dbAffiliation - Affiliation from GlobalUser in database (undefined if new user)
 * @param name - User's full name for faculty override check (from SAML or local auth)
 * @returns Resolution with effective affiliation and whether DB needs update
 */
export function resolveAffiliation(
    cwlAffiliation: string,
    dbAffiliation: string | undefined,
    name: string
): AffiliationResolution {
    // Special overrides: admins are always faculty (bypass CWL affiliation)
    if (isFacultyOverrideName(name)) {
        return {
            affiliation: 'faculty',
            needsDbUpdate: dbAffiliation !== 'faculty'
        };
    }

    // New user (no DB record) - use CWL as-is, no update needed
    if (dbAffiliation === undefined) {
        return {
            affiliation: cwlAffiliation,
            needsDbUpdate: false
        };
    }

    // Existing user: if DB differs from CWL, use CWL and update DB
    if (dbAffiliation !== cwlAffiliation) {
        return {
            affiliation: cwlAffiliation,
            needsDbUpdate: true
        };
    }

    return {
        affiliation: dbAffiliation,
        needsDbUpdate: false
    };
}

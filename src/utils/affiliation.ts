/**
 * Affiliation resolution utilities
 *
 * Handles reconciliation between CWL-derived affiliation and database-stored affiliation.
 * When a user has dual roles (e.g. student + instructor), CWL takes precedence and
 * the database is updated to match. Users with PUIDs listed in env vars are always
 * treated as faculty (bypass CWL affiliation).
 */

/** PUIDs that always receive faculty affiliation regardless of CWL (from env: RICHARD_TAPE_PUID, CHARISMA_RUSDIYANTO_PUID) */
function getFacultyOverridePuids(): string[] {
    const puids: string[] = [];
    const richard = process.env.RICHARD_TAPE_PUID?.trim();
    const charisma = process.env.CHARISMA_RUSDIYANTO_PUID?.trim();
    if (richard) puids.push(richard);
    if (charisma) puids.push(charisma);
    return puids;
}

/**
 * Checks if the given PUID is in the faculty override list (always treated as faculty).
 */
export function isFacultyOverridePuid(puid: string): boolean {
    if (!puid || typeof puid !== 'string') return false;
    return getFacultyOverridePuids().includes(puid.trim());
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
 * - PUIDs in RICHARD_TAPE_PUID, CHARISMA_RUSDIYANTO_PUID: Always faculty (bypass CWL)
 * - Others: When DB affiliation differs from CWL, use CWL and flag for DB update.
 *   This corrects inconsistent DB data (e.g. user with student+instructor roles stored as faculty).
 *
 * @param cwlAffiliation - Affiliation from Passport (mapAffiliation of eduPersonAffiliation)
 * @param dbAffiliation - Affiliation from GlobalUser in database (undefined if new user)
 * @param puid - User's PUID for faculty override check (from SAML or local auth)
 * @returns Resolution with effective affiliation and whether DB needs update
 */
export function resolveAffiliation(
    cwlAffiliation: string,
    dbAffiliation: string | undefined,
    puid: string
): AffiliationResolution {
    // Special overrides: these PUIDs are always faculty (bypass CWL affiliation)
    if (isFacultyOverridePuid(puid)) {
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

// roster-identity.ts
/**
 * roster-identity.ts
 *
 * Keyed one-way identifiers for LMS roster entries.
 *
 * A Canvas roster row carries the student's PUID in `integration_id`. Storing a class list of
 * those verbatim would put an institutional identifier at rest for every enrolled student —
 * including the majority who have never opened EngE-AI — in a second collection outside
 * `active-users`. Enrollment matching only ever needs *equality*, so the raw value is not
 * required: hashing both sides under one key answers "is this the same person" and nothing else.
 *
 * The construction is HMAC-SHA256 keyed by {@link ROSTER_SALT_ENV}, not a plain
 * `sha256(salt || puid)`. PUIDs are short, structured, and drawn from a small space, so an
 * unkeyed digest of one is enumerable by anyone holding the salt *or* guessing the format; HMAC
 * keeps the key's role explicit and resists length-extension against future field concatenation.
 *
 * **The salt is load-bearing state, not a tunable.** Every stored roster hash is only comparable
 * to hashes produced under the same key. Rotating or losing it does not degrade matching, it ends
 * it: every course's roster stops recognizing anyone until an instructor re-syncs it from Canvas.
 * Treat it like `SESSION_SECRET` — set once per deployment, backed up, never rotated casually.
 *
 * What this deliberately does not provide: a way back to a PUID. Nothing here is reversible, and
 * no caller should try to display, export, or log a roster identity. Where a person needs to be
 * *addressed* rather than recognized — posting a grade to Canvas, say — the Canvas user id stored
 * beside the hash is the identifier for that, not this.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Salted, non-reversible identifiers used to match LMS rosters to EngE-AI users.
 */

import { createHmac } from 'crypto';

/** Environment variable holding the roster hashing key. */
export const ROSTER_SALT_ENV = 'ROSTER_HASH_SALT';

/**
 * Domain separator mixed into every digest.
 *
 * Binds a hash to this purpose, so a value produced here can never collide with one produced by
 * some later feature that happens to key the same salt over the same PUID. Versioned so that a
 * deliberate change of construction is distinguishable from a salt rotation.
 */
const ROSTER_HASH_DOMAIN = 'engeai-roster-identity-v1';

/**
 * isRosterIdentityConfigured — whether roster hashing can run at all.
 *
 * Callers use this to disable roster sync with an explanation rather than failing mid-import,
 * matching how the LMS providers treat their own missing configuration.
 */
export function isRosterIdentityConfigured(): boolean {
    return typeof process.env[ROSTER_SALT_ENV] === 'string' && process.env[ROSTER_SALT_ENV] !== '';
}

/**
 * normalizeRosterPuid — the canonical form both sides of a comparison are reduced to.
 *
 * Trimmed and lowercased, for the same reason `assertInstructorIdentity` compares that way: both
 * values are institutional identifiers for one person from one institution, so the only
 * differences worth tolerating are transport ones. Two distinct PUIDs never differ by case alone.
 *
 * Exported because the login-side check must normalize identically or every match silently fails.
 */
export function normalizeRosterPuid(puid: string): string {
    return puid.trim().toLowerCase();
}

/**
 * hashRosterPuid — the stored identity for one person.
 *
 * @param puid - a raw PUID, from a Canvas roster row or from the signed-in user's CWL identity
 * @returns Hex HMAC-SHA256 digest, stable across processes for a fixed salt
 *
 * @throws {Error} When {@link ROSTER_SALT_ENV} is unset. Deliberately loud: silently falling back
 * to an empty key would produce hashes that look correct, match each other, and be trivially
 * reproducible by anyone — a failure that would not surface until the data was already written.
 * @throws {Error} When `puid` is empty after normalization, which would otherwise store a digest
 * that every other identity-less row matches.
 */
export function hashRosterPuid(puid: string): string {
    const salt = process.env[ROSTER_SALT_ENV];
    if (!salt) {
        throw new Error(
            `${ROSTER_SALT_ENV} is not set, so roster identities cannot be computed. ` +
                'Set it to a long random value and keep it stable — changing it invalidates every stored roster.'
        );
    }

    const normalized = normalizeRosterPuid(puid);
    if (!normalized) {
        throw new Error('Cannot compute a roster identity for an empty PUID');
    }

    return createHmac('sha256', salt).update(ROSTER_HASH_DOMAIN).update('\0').update(normalized).digest('hex');
}

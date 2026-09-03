/**
 * roster-identity — keyed one-way identifiers for LMS roster entries
 *
 * The behaviours pinned here are the ones whose failure is silent and total:
 *
 * - Sync and login must derive the same digest for the same person. They normalize
 *   independently, so a divergence would not error — every student would simply stop being
 *   recognized, with a healthy-looking roster on disk.
 * - A missing salt must throw rather than hash under an empty key. A default key would produce
 *   digests that match each other and are reproducible by anyone, and nothing downstream would
 *   look wrong until the data was already written.
 * - Distinct people must not collide, including when one PUID is a prefix of another.
 */

import { hashRosterPuid, isRosterIdentityConfigured, normalizeRosterPuid, ROSTER_SALT_ENV } from '../roster-identity';

const ORIGINAL_SALT = process.env[ROSTER_SALT_ENV];

beforeEach(() => {
    process.env[ROSTER_SALT_ENV] = 'test-salt-value';
});

afterAll(() => {
    if (ORIGINAL_SALT === undefined) {
        delete process.env[ROSTER_SALT_ENV];
    } else {
        process.env[ROSTER_SALT_ENV] = ORIGINAL_SALT;
    }
});

describe('normalizeRosterPuid', () => {
    it('trims and lowercases so both sides of a comparison agree', () => {
        expect(normalizeRosterPuid('  ABC123  ')).toBe('abc123');
    });
});

describe('hashRosterPuid', () => {
    it('is stable for the same PUID under the same salt', () => {
        expect(hashRosterPuid('abc123')).toBe(hashRosterPuid('abc123'));
    });

    it('ignores case and surrounding whitespace', () => {
        // The roster side reads Canvas, the login side reads CWL. If these ever disagreed,
        // matching would fail silently for every student rather than raising anything.
        expect(hashRosterPuid('  ABC123 ')).toBe(hashRosterPuid('abc123'));
    });

    it('separates distinct PUIDs, including prefixes of one another', () => {
        expect(hashRosterPuid('abc123')).not.toBe(hashRosterPuid('abc1234'));
        expect(hashRosterPuid('abc123')).not.toBe(hashRosterPuid('abc12'));
    });

    it('produces different digests under different salts', () => {
        const underFirst = hashRosterPuid('abc123');
        process.env[ROSTER_SALT_ENV] = 'a-different-salt';
        // Pins the cost of rotating the salt: every stored roster stops matching.
        expect(hashRosterPuid('abc123')).not.toBe(underFirst);
    });

    it('never returns the PUID itself', () => {
        expect(hashRosterPuid('abc123')).not.toContain('abc123');
    });

    it('throws rather than hashing under an empty key when the salt is unset', () => {
        delete process.env[ROSTER_SALT_ENV];
        expect(() => hashRosterPuid('abc123')).toThrow(ROSTER_SALT_ENV);
    });

    it('refuses an empty PUID, which would otherwise match every identity-less row', () => {
        expect(() => hashRosterPuid('   ')).toThrow();
    });
});

describe('isRosterIdentityConfigured', () => {
    it('is false when the salt is unset or empty', () => {
        delete process.env[ROSTER_SALT_ENV];
        expect(isRosterIdentityConfigured()).toBe(false);

        process.env[ROSTER_SALT_ENV] = '';
        expect(isRosterIdentityConfigured()).toBe(false);
    });

    it('is true once a salt is present', () => {
        expect(isRosterIdentityConfigured()).toBe(true);
    });
});

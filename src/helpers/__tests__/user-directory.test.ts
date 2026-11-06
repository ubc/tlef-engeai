/**
 * User directory helpers
 *
 * @description Query parsing defaults, caps, and rejections, and the row allow-list with explicit
 * defaults for fields older `active-users` documents lack, course roles, and LMS connection presence.
 */

import { parseUserDirectoryQuery, toUserDirectoryEntry, USER_DIRECTORY_MAX_PAGE_SIZE, type UserDirectoryContext } from '../user-directory';
import type { GlobalUser } from '../../types/shared';

describe('parseUserDirectoryQuery', () => {
    it('defaults to the first page with no filters, treating blank values as absent', () => {
        expect(parseUserDirectoryQuery({})).toEqual({ ok: true, value: { page: 1, pageSize: 50 } });
        expect(parseUserDirectoryQuery({ q: '   ', affiliation: '', page: '' })).toEqual({ ok: true, value: { page: 1, pageSize: 50 } });
    });

    it('trims search text and caps the page size', () => {
        expect(parseUserDirectoryQuery({ q: ' Jane ', affiliation: 'faculty', page: '3', pageSize: '1000' })).toEqual({
            ok: true,
            value: { search: 'Jane', affiliation: 'faculty', page: 3, pageSize: USER_DIRECTORY_MAX_PAGE_SIZE }
        });
    });

    it('rejects non-positive pages, unknown affiliations, and overlong searches', () => {
        expect(parseUserDirectoryQuery({ page: '0' }).ok).toBe(false);
        expect(parseUserDirectoryQuery({ pageSize: '-5' }).ok).toBe(false);
        expect(parseUserDirectoryQuery({ affiliation: 'alumni' }).ok).toBe(false);
        expect(parseUserDirectoryQuery({ q: 'x'.repeat(201) }).ok).toBe(false);
    });
});

describe('toUserDirectoryEntry', () => {
    const base: GlobalUser = {
        name: 'Synthetic User', puid: 'SYNTHETICPUID0001', userId: 'user-1', coursesEnrolled: [],
        affiliation: 'faculty', status: 'active', createdAt: new Date('2026-01-02T03:04:05Z'), updatedAt: new Date('2026-02-02T03:04:05Z')
    };
    const emptyContext: UserDirectoryContext = { courses: new Map(), canvasConnected: new Set(), moodleConnected: new Set() };

    it('fills explicit defaults for fields older documents lack', () => {
        expect(toUserDirectoryEntry(base, emptyContext)).toEqual({
            userId: 'user-1', name: 'Synthetic User', puid: 'SYNTHETICPUID0001', affiliation: 'faculty', status: 'active',
            isAdmin: false, courses: [], createdAt: '2026-01-02T03:04:05.000Z', updatedAt: '2026-02-02T03:04:05.000Z',
            studentOnboardingCompleted: false, instructorOnboarding: {},
            canvasVerifiedUserId: null, canvasVerifiedAt: null, lmsConnections: { canvas: false, moodle: false }
        });
    });

    it('resolves course names and the role from the staff lists, including legacy string entries', () => {
        const courses = new Map([
            ['c-1', { courseName: 'CHBE 241', instructors: [{ userId: 'user-1', name: 'Synthetic User' }], teachingAssistants: [] }],
            ['c-2', { courseName: 'LLED 200', instructors: [], teachingAssistants: ['user-1'] }],
            ['c-3', { courseName: 'APSC 183', instructors: ['someone-else'], teachingAssistants: [] }]
        ]) as UserDirectoryContext['courses'];
        const entry = toUserDirectoryEntry({ ...base, coursesEnrolled: ['c-1', 'c-2', 'c-3', 'c-gone'] }, { ...emptyContext, courses });

        expect(entry.courses).toEqual([
            { id: 'c-1', courseName: 'CHBE 241', role: 'instructor' },
            { id: 'c-2', courseName: 'LLED 200', role: 'ta' },
            { id: 'c-3', courseName: 'APSC 183', role: 'student' },
            { id: 'c-gone', courseName: null, role: null }
        ]);
    });

    it('reports LMS connections by userId', () => {
        const entry = toUserDirectoryEntry(base, { ...emptyContext, canvasConnected: new Set(['user-1']), moodleConnected: new Set(['other']) });
        expect(entry.lmsConnections).toEqual({ canvas: true, moodle: false });
    });

    it('copies only allow-listed fields', () => {
        const entry = toUserDirectoryEntry(
            { ...base, isAdmin: true, isTestStudent: true, testStudentOwnerUserId: 'owner', instructorOnboarding: { contentSetup: true } },
            emptyContext
        );
        expect(entry).toMatchObject({ isAdmin: true, instructorOnboarding: { contentSetup: true } });
        expect(entry).not.toHaveProperty('isTestStudent');
        expect(entry).not.toHaveProperty('testStudentOwnerUserId');
    });
});

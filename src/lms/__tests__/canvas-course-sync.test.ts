/**
 * canvas-course-sync — Canvas-driven course import and enrollment
 *
 * The behaviours pinned here are the ones whose failure modes are silent:
 *
 * - A course id arriving from the browser must be re-checked against Canvas. Skipping that
 *   would let anyone import a course they do not teach by editing one request.
 * - An importing instructor's Canvas `integration_id` must equal their CWL PUID. Without it,
 *   OAuth proves only that *some* teacher account was authorized, not that it is this person.
 * - "Canvas withheld the identifier" must not be reported as "you are not that person". The
 *   symptoms are identical and only one of them is the user's to fix.
 * - Two instructors on one Canvas course must land on one EngE-AI course. A second import
 *   creating a duplicate would split their students across two copies with no visible error.
 * - Sync must never remove enrollment; a dropped student silently losing their chat history
 *   is worse than a stale roster row.
 * - Only the *teacher* roster may be read, only on import. Roster rows carry the PUID at UBC,
 *   and `active-users` is the only collection permitted to hold one.
 */

jest.mock('@ubc/ubc-genai-toolkit-lms-integration', () => ({
    canvas: { getCourses: jest.fn(), getCourseUsers: jest.fn() },
    // Mirrors the real helper for the one field this module matches on, so the
    // "Canvas withheld the identifier" branch is exercised rather than stubbed past.
    rosterFieldCoverage: (users: Array<{ integrationId?: string }>) => ({
        total: users.length,
        integrationId: users.filter((user) => user.integrationId).length,
        sisId: 0,
        email: 0,
        loginId: 0,
    }),
}));
jest.mock('../../helpers/provision-course', () => ({ provisionCourse: jest.fn() }));
jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { canvas } from '@ubc/ubc-genai-toolkit-lms-integration';
import { connectCanvasCourse, listCanvasCourseOptions } from '../canvas-course-sync';
import { provisionCourse } from '../../helpers/provision-course';
import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import type { activeCourse, GlobalUser } from '../../types/shared';

const getCourses = canvas.getCourses as jest.Mock;
const getCourseUsers = canvas.getCourseUsers as jest.Mock;
const provisionCourseMock = provisionCourse as jest.Mock;

const CANVAS_COURSE = {
    id: '742',
    name: 'Introduction to Engineering',
    code: 'APSC 183',
    raw: {},
};

const instructor = {
    userId: 'instructor-1',
    puid: 'PUID_INSTRUCTOR',
    name: 'Ada Byron',
    affiliation: 'faculty',
    coursesEnrolled: [],
} as unknown as GlobalUser;

/** Canvas user id of the account the stored token belongs to, as `/users/self` reports it. */
const CONNECTED_CANVAS_USER_ID = 11;

/**
 * Teacher roster carrying both the connected account and a co-instructor.
 *
 * The co-instructor row matters: a check that scanned the whole roster for the signed-in user's
 * PUID would pass whenever that user teaches the course, no matter whose token was connected.
 */
const MATCHING_TEACHER_ROSTER = [
    { id: '11', name: 'Ada Byron', integrationId: 'PUID_INSTRUCTOR', raw: {} },
    { id: '12', name: 'Co Teacher', integrationId: 'PUID_SOMEONE_ELSE', raw: {} },
];

/** Stubs `/users/self` so the roster search has an account to look for. */
function connectedAs(canvasUserId: number | string): void {
    apiGet.mockResolvedValue({ id: canvasUserId });
}

const student = {
    userId: 'student-1',
    puid: 'PUID_STUDENT',
    name: 'Grace Hopper',
    affiliation: 'student',
    coursesEnrolled: [],
} as unknown as GlobalUser;

const linkedCourse = {
    id: 'engeai-course-1',
    courseName: 'APSC 183',
    instructors: [{ userId: 'instructor-2', name: 'Other Instructor' }],
    lmsLink: { provider: 'canvas', courseId: '742' },
} as unknown as activeCourse;

/** Stub façade exposing only what the service calls. */
function mongoStub(overrides: Partial<Record<string, jest.Mock>> = {}) {
    return {
        findCourseByLmsLink: jest.fn(async () => null),
        findCoursesByLmsLinks: jest.fn(async () => new Map()),
        getCourseByName: jest.fn(async () => null),
        enrollUserInCourse: jest.fn(async () => undefined),
        updateActiveCourse: jest.fn(async () => null),
        getDefaultAcademicPeriodId: jest.fn(async () => 'period-default'),
        ...overrides,
    } as unknown as EngEAI_MongoDB;
}

/** `req.canvasApi`, of which only `get` ('/users/self') is exercised here. */
const apiGet = jest.fn();
const api = { get: apiGet } as unknown as Parameters<typeof connectCanvasCourse>[0];

beforeEach(() => {
    getCourses.mockReset();
    getCourseUsers.mockReset();
    provisionCourseMock.mockReset();
    apiGet.mockReset();
    connectedAs(CONNECTED_CANVAS_USER_ID);
});

describe('listCanvasCourseOptions', () => {
    beforeEach(() => {
        getCourseUsers.mockResolvedValue(MATCHING_TEACHER_ROSTER);
    });

    it('reads teacher enrollments for faculty and student enrollments for students', async () => {
        getCourses.mockResolvedValue([CANVAS_COURSE]);

        await listCanvasCourseOptions(api, mongoStub(), instructor);
        expect(getCourses).toHaveBeenCalledWith(api, { enrollment_type: 'teacher' });

        await listCanvasCourseOptions(api, mongoStub(), student);
        expect(getCourses).toHaveBeenLastCalledWith(api, { enrollment_type: 'student' });
    });

    it('marks courses EngE-AI already has, and leaves the rest unconnected', async () => {
        getCourses.mockResolvedValue([CANVAS_COURSE, { ...CANVAS_COURSE, id: '999', code: 'CHBE 241' }]);
        const mongoDB = mongoStub({
            findCoursesByLmsLinks: jest.fn(async () => new Map([['742', linkedCourse]])),
        });

        const options = await listCanvasCourseOptions(api, mongoDB, student);

        expect(options).toHaveLength(2);
        expect(options[0]).toMatchObject({ canvasCourseId: '742', connected: true, engeAiCourseId: 'engeai-course-1' });
        expect(options[1]).toMatchObject({ canvasCourseId: '999', connected: false });
        expect(options[1].engeAiCourseId).toBeUndefined();
    });

    it('does not expose the provider raw payload to callers', async () => {
        getCourses.mockResolvedValue([{ ...CANVAS_COURSE, raw: { secret_sis_id: 'do-not-leak' } }]);

        const options = await listCanvasCourseOptions(api, mongoStub(), student);

        expect(JSON.stringify(options)).not.toContain('do-not-leak');
        expect(options[0]).not.toHaveProperty('raw');
    });

    /**
     * The reported scenario: two EngE-AI users share a browser, Canvas is still signed in as the
     * first, and the second's "Connect to Canvas" silently re-authorizes the first person's Canvas
     * account. The second user's EngE-AI account then holds a token that is not theirs.
     */
    it('returns no course names when the stored token belongs to another person', async () => {
        getCourses.mockResolvedValue([CANVAS_COURSE]);
        getCourseUsers.mockResolvedValue([
            { id: '11', name: 'Amir', integrationId: 'PUID_SOMEONE_ELSE', raw: {} },
        ]);

        await expect(listCanvasCourseOptions(api, mongoStub(), instructor)).rejects.toMatchObject({
            reason: 'mismatch',
        });
    });

    it('verifies once for the whole list, not once per course', async () => {
        getCourses.mockResolvedValue([
            CANVAS_COURSE,
            { ...CANVAS_COURSE, id: '999' },
            { ...CANVAS_COURSE, id: '1000' },
        ]);

        await listCanvasCourseOptions(api, mongoStub(), instructor);

        // integration_id identifies the Canvas account, not the enrollment, so one course settles
        // every row. Three roster reads here would triple the wait for no added assurance.
        expect(getCourseUsers).toHaveBeenCalledTimes(1);
    });

    it('skips verification when the instructor teaches nothing — there is nothing to disclose', async () => {
        getCourses.mockResolvedValue([]);

        await expect(listCanvasCourseOptions(api, mongoStub(), instructor)).resolves.toEqual([]);
        expect(getCourseUsers).not.toHaveBeenCalled();
    });
});

describe('connectCanvasCourse — authorization', () => {
    it('refuses a Canvas course the instructor does not teach', async () => {
        getCourses.mockResolvedValue([CANVAS_COURSE]);
        const mongoDB = mongoStub();

        await expect(connectCanvasCourse(api, mongoDB, instructor, '999')).rejects.toThrow(
            /not listed as an instructor/
        );
        expect(provisionCourseMock).not.toHaveBeenCalled();
        expect(mongoDB.enrollUserInCourse).not.toHaveBeenCalled();
    });

    it('refuses a Canvas course the student is not enrolled in', async () => {
        getCourses.mockResolvedValue([CANVAS_COURSE]);
        const mongoDB = mongoStub();

        await expect(connectCanvasCourse(api, mongoDB, student, '999')).rejects.toThrow(
            /not enrolled in/
        );
        expect(mongoDB.enrollUserInCourse).not.toHaveBeenCalled();
    });

    it('re-reads enrollment from Canvas rather than trusting the requested id', async () => {
        getCourses.mockResolvedValue([]);
        const mongoDB = mongoStub({ findCourseByLmsLink: jest.fn(async () => linkedCourse) });

        // The course exists and is linked; only the caller's Canvas enrollment is missing.
        await expect(connectCanvasCourse(api, mongoDB, student, '742')).rejects.toThrow();
        expect(mongoDB.enrollUserInCourse).not.toHaveBeenCalled();
    });

    it('never reads a student roster — only the teacher roster, only on import', async () => {
        getCourses.mockResolvedValue([CANVAS_COURSE]);
        getCourseUsers.mockResolvedValue(MATCHING_TEACHER_ROSTER);
        provisionCourseMock.mockResolvedValue({ id: 'new-course', courseName: 'APSC 183' });

        await connectCanvasCourse(api, mongoStub(), instructor, '742');

        // `getCourseUsers` defaults to students when enrollmentTypes is omitted, so passing it
        // explicitly is what keeps student PUIDs out of EngE-AI entirely.
        expect(getCourseUsers).toHaveBeenCalledWith(api, '742', { enrollmentTypes: ['teacher'] });
        for (const call of getCourseUsers.mock.calls) {
            expect(call[2]?.enrollmentTypes).toEqual(['teacher']);
        }
    });

    it('reads no roster at all on the student path', async () => {
        getCourses.mockResolvedValue([CANVAS_COURSE]);

        await connectCanvasCourse(api, mongoStub(), student, '742');
        await listCanvasCourseOptions(api, mongoStub(), student);

        expect(getCourseUsers).not.toHaveBeenCalled();
    });
});

describe('connectCanvasCourse — instructor identity verification', () => {
    beforeEach(() => {
        getCourses.mockResolvedValue([CANVAS_COURSE]);
        provisionCourseMock.mockResolvedValue({ id: 'new-course', courseName: 'APSC 183' });
    });

    it('imports when the Canvas integration_id matches the CWL PUID', async () => {
        getCourseUsers.mockResolvedValue(MATCHING_TEACHER_ROSTER);

        const result = await connectCanvasCourse(api, mongoStub(), instructor, '742');

        expect(result.status).toBe('imported');
    });

    /**
     * Reproduces the reported setup exactly: Canvas signed in as an admin who also teaches the
     * course, while EngE-AI is signed in as an instructor who is *also* on that teacher roster.
     *
     * A check that asked "does anyone here carry my PUID?" finds the instructor's own row and
     * passes — while the token in hand belongs to the admin. The row that has to carry the PUID
     * is the connected account's, so the roster is searched by Canvas user id.
     */
    it('refuses when the token belongs to another teacher on the same course', async () => {
        connectedAs(99); // the admin account Canvas re-authorized
        getCourseUsers.mockResolvedValue([
            { id: '99', name: 'Admin', integrationId: 'ADMINPUID', raw: {} },
            // The signed-in instructor really is a teacher here — that must not be enough.
            { id: '11', name: 'Ada Byron', integrationId: 'PUID_INSTRUCTOR', raw: {} },
        ]);
        const mongoDB = mongoStub();

        await expect(connectCanvasCourse(api, mongoDB, instructor, '742')).rejects.toMatchObject({
            reason: 'mismatch',
        });
        expect(provisionCourseMock).not.toHaveBeenCalled();
    });

    it('identifies the connected account before reading the roster', async () => {
        getCourseUsers.mockResolvedValue(MATCHING_TEACHER_ROSTER);

        await connectCanvasCourse(api, mongoStub(), instructor, '742');

        expect(apiGet).toHaveBeenCalledWith('/users/self');
    });

    it('tolerates Canvas returning the account id as a number', async () => {
        // `/users/self` reports a numeric id; roster ids are normalized to strings by the package.
        connectedAs(11);
        getCourseUsers.mockResolvedValue(MATCHING_TEACHER_ROSTER);

        await expect(connectCanvasCourse(api, mongoStub(), instructor, '742')).resolves.toMatchObject(
            { status: 'imported' }
        );
    });

    it('keeps the credential when the connected account is absent from the roster', async () => {
        connectedAs(12345);
        getCourseUsers.mockResolvedValue(MATCHING_TEACHER_ROSTER);

        // A concluded or restricted enrolment reaches here; there is no identifier to read and no
        // evidence of impersonation, so this must not be reported as a mismatch.
        await expect(connectCanvasCourse(api, mongoStub(), instructor, '742')).rejects.toMatchObject(
            { reason: 'self_not_on_roster' }
        );
    });

    it('matches regardless of surrounding whitespace or case', async () => {
        getCourseUsers.mockResolvedValue([
            { id: '11', name: 'Ada Byron', integrationId: '  puid_instructor  ', raw: {} },
        ]);

        await expect(connectCanvasCourse(api, mongoStub(), instructor, '742')).resolves.toMatchObject(
            { status: 'imported' }
        );
    });

    it('refuses when the connected account carries someone else’s identifier', async () => {
        connectedAs(12);
        getCourseUsers.mockResolvedValue([
            { id: '12', name: 'Co Teacher', integrationId: 'PUID_SOMEONE_ELSE', raw: {} },
        ]);
        const mongoDB = mongoStub();

        await expect(connectCanvasCourse(api, mongoDB, instructor, '742')).rejects.toMatchObject({
            reason: 'mismatch',
        });
        expect(provisionCourseMock).not.toHaveBeenCalled();
        expect(mongoDB.enrollUserInCourse).not.toHaveBeenCalled();
    });

    it('tags each failure with a reason, so only a mismatch discards the credential', async () => {
        // The route deletes the stored token on `mismatch` alone. A withheld identifier may sit
        // behind a perfectly correct credential, and throwing it away would punish the instructor
        // for an account permission they do not control.
        getCourseUsers.mockResolvedValue([
            { id: '11', name: 'Ada Byron', integrationId: undefined, raw: {} },
        ]);
        await expect(connectCanvasCourse(api, mongoStub(), instructor, '742')).rejects.toMatchObject({
            reason: 'identifiers_withheld',
        });

        const noPuid = { ...instructor, puid: '' } as unknown as GlobalUser;
        await expect(connectCanvasCourse(api, mongoStub(), noPuid, '742')).rejects.toMatchObject({
            reason: 'no_puid',
        });
    });

    it('distinguishes a withheld identifier from a genuine mismatch', async () => {
        // Canvas serializes integration_id only for callers with `read_sis`; a complete, correct
        // roster can come back with the field empty for everyone. Reporting that as "you are not
        // that person" would send the instructor to re-authorize, which cannot fix a permission.
        getCourseUsers.mockResolvedValue([
            { id: '11', name: 'Ada Byron', integrationId: undefined, raw: {} },
            { id: '12', name: 'Co Teacher', integrationId: undefined, raw: {} },
        ]);

        await expect(connectCanvasCourse(api, mongoStub(), instructor, '742')).rejects.toThrow(
            /did not return SIS identifiers/
        );
    });

    it('refuses when the EngE-AI account carries no PUID', async () => {
        const noPuid = { ...instructor, puid: '' } as unknown as GlobalUser;

        await expect(connectCanvasCourse(api, mongoStub(), noPuid, '742')).rejects.toThrow(
            /no CWL identifier/
        );
        expect(getCourseUsers).not.toHaveBeenCalled();
    });

    it('verifies before touching the database, so a mismatch learns nothing about EngE-AI', async () => {
        getCourseUsers.mockResolvedValue([
            { id: '12', name: 'Co Teacher', integrationId: 'PUID_SOMEONE_ELSE', raw: {} },
        ]);
        const mongoDB = mongoStub({ findCourseByLmsLink: jest.fn(async () => linkedCourse) });

        await expect(connectCanvasCourse(api, mongoDB, instructor, '742')).rejects.toThrow();
        expect(mongoDB.findCourseByLmsLink).not.toHaveBeenCalled();
    });

    it('keeps PUIDs out of the failure message', async () => {
        getCourseUsers.mockResolvedValue([
            { id: '12', name: 'Co Teacher', integrationId: 'PUID_SOMEONE_ELSE', raw: {} },
        ]);

        await expect(connectCanvasCourse(api, mongoStub(), instructor, '742')).rejects.toThrow(
            expect.objectContaining({
                message: expect.not.stringContaining('PUID_SOMEONE_ELSE'),
            }) as Error
        );
    });

    it('does not verify identity on the student path — Canvas cannot supply it', async () => {
        const mongoDB = mongoStub({ findCourseByLmsLink: jest.fn(async () => linkedCourse) });

        const result = await connectCanvasCourse(api, mongoDB, student, '742');

        expect(result.status).toBe('joined');
        expect(getCourseUsers).not.toHaveBeenCalled();
    });
});

describe('connectCanvasCourse — instructor', () => {
    beforeEach(() => {
        getCourses.mockResolvedValue([CANVAS_COURSE]);
        // Identity verification is covered in its own block; these cases assume it passes.
        getCourseUsers.mockResolvedValue(MATCHING_TEACHER_ROSTER);
    });

    it('imports a course Canvas lists them as teaching', async () => {
        provisionCourseMock.mockResolvedValue({ id: 'new-course', courseName: 'APSC 183' });
        const mongoDB = mongoStub();

        const result = await connectCanvasCourse(api, mongoDB, instructor, '742', 'period-7');

        expect(result.status).toBe('imported');
        expect(result.courseId).toBe('new-course');
        expect(provisionCourseMock).toHaveBeenCalledWith(
            mongoDB,
            expect.objectContaining({
                courseName: 'APSC 183',
                creator: instructor,
                academicPeriodId: 'period-7',
                // Canvas supplies no course structure, so setup is still owed.
                courseSetup: false,
                lmsLink: expect.objectContaining({
                    provider: 'canvas',
                    courseId: '742',
                    linkedBy: 'instructor-1',
                }),
            })
        );
    });

    it('joins the existing course instead of creating a second copy', async () => {
        const mongoDB = mongoStub({ findCourseByLmsLink: jest.fn(async () => linkedCourse) });

        const result = await connectCanvasCourse(api, mongoDB, instructor, '742');

        expect(result.status).toBe('joined');
        expect(result.courseId).toBe('engeai-course-1');
        expect(provisionCourseMock).not.toHaveBeenCalled();
        expect(mongoDB.enrollUserInCourse).toHaveBeenCalledWith(instructor, 'engeai-course-1', 'faculty');
        expect(mongoDB.updateActiveCourse).toHaveBeenCalledWith('engeai-course-1', {
            instructors: [
                { userId: 'instructor-2', name: 'Other Instructor' },
                { userId: 'instructor-1', name: 'Ada Byron' },
            ],
        });
    });

    it('does not duplicate an instructor already on the course', async () => {
        const alreadyOn = {
            ...linkedCourse,
            instructors: [{ userId: 'instructor-1', name: 'Ada Byron' }],
        } as unknown as activeCourse;
        const mongoDB = mongoStub({ findCourseByLmsLink: jest.fn(async () => alreadyOn) });

        await connectCanvasCourse(api, mongoDB, instructor, '742');

        expect(mongoDB.updateActiveCourse).not.toHaveBeenCalled();
    });

    it('refuses when an unlinked EngE-AI course already holds the name', async () => {
        const mongoDB = mongoStub({
            getCourseByName: jest.fn(async () => ({ id: 'other', courseName: 'APSC 183' })),
        });

        await expect(connectCanvasCourse(api, mongoDB, instructor, '742')).rejects.toThrow(
            /already has a course named/
        );
        expect(provisionCourseMock).not.toHaveBeenCalled();
    });

    it('falls back to the default academic period when the picker names none', async () => {
        provisionCourseMock.mockResolvedValue({ id: 'new-course', courseName: 'APSC 183' });
        const mongoDB = mongoStub();

        await connectCanvasCourse(api, mongoDB, instructor, '742');

        expect(provisionCourseMock).toHaveBeenCalledWith(
            mongoDB,
            expect.objectContaining({ academicPeriodId: 'period-default' })
        );
    });
});

describe('connectCanvasCourse — student', () => {
    beforeEach(() => {
        getCourses.mockResolvedValue([CANVAS_COURSE]);
    });

    it('enrolls into the course the instructor imported', async () => {
        const mongoDB = mongoStub({ findCourseByLmsLink: jest.fn(async () => linkedCourse) });

        const result = await connectCanvasCourse(api, mongoDB, student, '742');

        expect(result.status).toBe('joined');
        expect(result.courseId).toBe('engeai-course-1');
        expect(mongoDB.enrollUserInCourse).toHaveBeenCalledWith(student, 'engeai-course-1', 'student');
    });

    it('reports the wait on the instructor rather than failing, when nothing is linked', async () => {
        const mongoDB = mongoStub();

        const result = await connectCanvasCourse(api, mongoDB, student, '742');

        expect(result.status).toBe('awaiting_instructor');
        expect(result.courseId).toBeUndefined();
        expect(result.message).toMatch(/instructor/i);
        expect(mongoDB.enrollUserInCourse).not.toHaveBeenCalled();
    });

    it('never creates a course', async () => {
        await connectCanvasCourse(api, mongoStub(), student, '742');

        expect(provisionCourseMock).not.toHaveBeenCalled();
    });

    it('never removes enrollment — sync only ever adds', async () => {
        const mongoDB = mongoStub({ findCourseByLmsLink: jest.fn(async () => linkedCourse) });

        await connectCanvasCourse(api, mongoDB, student, '742');

        // A course the student holds in EngE-AI but no longer in Canvas is simply not visited;
        // nothing in this path can drop an enrollment.
        expect(Object.keys(mongoDB)).not.toContain('removeCourseFromGlobalUser');
        expect(mongoDB.updateActiveCourse).not.toHaveBeenCalled();
    });
});

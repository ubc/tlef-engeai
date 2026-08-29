/**
 * canvas-course-sync.ts
 *
 * Course enrollment sync between Canvas and EngE-AI.
 *
 * EngE-AI has two kinds of course. One is created by an admin and joined with a six-character
 * code; nothing here touches it. The other is imported from Canvas by an instructor, and this
 * module owns its whole lifecycle: listing what the signed-in user could connect, importing a
 * course an instructor teaches, and enrolling a student into a course their instructor already
 * imported.
 *
 * **Enrollment is resolved per user.** Each person authorizes Canvas as themselves, so the
 * enrollments Canvas reports back are that person's own — there is no roster-wide matching of
 * Canvas users to EngE-AI accounts, which is where grade-import integrations misfile records.
 *
 * **Instructor imports additionally prove the connected Canvas account is the same person.**
 * OAuth proves only that someone authorized *a* Canvas account with a teacher enrollment; it does
 * not prove that account belongs to the signed-in EngE-AI user. {@link assertInstructorIdentity}
 * closes that by requiring the Canvas `integration_id` — the PUID at UBC — of *the account the
 * token belongs to* to match the PUID CWL authenticated. Reading it means reading a roster, with
 * two hard limits:
 *
 * 1. **Teacher roster only, instructor paths only.** `enrollmentTypes: ['teacher']` is passed
 *    explicitly, because `getCourseUsers` defaults to students. No student roster is ever read,
 *    and the student join path performs no roster read at all. The check runs when *listing* an
 *    instructor's courses as well as when importing one — listing is where another person's
 *    course names would otherwise be disclosed.
 * 2. **Compared in memory, never stored, never logged.** The teacher roster carries other
 *    instructors' PUIDs; `active-users` remains the only collection holding a PUID at rest.
 *
 * The roster is the only place a teacher can read this. Canvas grants `read_sis` through a
 * `TeacherEnrollment` on a *course*, not at the account level, so `GET /users/self` returns no
 * `integration_id` for an instructor — verified against Canvas's own `lib/api/v1/user.rb`, where
 * `user_can_read_sis_data?` resolves the permission against the course context.
 *
 * Sync only ever **adds** enrollment. A student whose Canvas enrollment disappears keeps their
 * EngE-AI access and their chat history: a transient Canvas error, a revoked token, and a genuine
 * drop are indistinguishable from here, and silently locking someone out of their own
 * conversations is the worse failure.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Canvas-driven course import for instructors and enrollment for students.
 */

import { canvas, rosterFieldCoverage } from '@ubc/ubc-genai-toolkit-lms-integration';
import type { LmsCourse } from '@ubc/ubc-genai-toolkit-lms-integration';
import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { activeCourse, CourseLmsLink, GlobalUser, InstructorInfo } from '../types/shared';
import { provisionCourse } from '../helpers/provision-course';
import { isAdminUser } from '../utils/admin';
import { appLogger } from '../utils/logger';

/** The provider this module imports from. Stored on every link it writes. */
const PROVIDER: CourseLmsLink['provider'] = 'canvas';

/**
 * Course shape a freshly imported Canvas course starts with.
 *
 * Canvas supplies a name and a code and nothing about how the course is taught, so the import
 * cannot know whether it runs by week or by topic. These defaults exist only to make the course
 * real enough to appear in the instructor's list; `courseSetup: false` sends them through
 * EngE-AI's existing setup flow the first time they open it, and setup overwrites both.
 */
const IMPORT_DEFAULT_FRAME_TYPE = 'byWeek' as const;
const IMPORT_DEFAULT_TILES = 12;

/** Which Canvas enrollment decides what a given EngE-AI user may do. */
export type CanvasRole = 'teacher' | 'student';

/** Why {@link assertInstructorIdentity} refused. */
export type CanvasIdentityFailure =
    /** The connected Canvas account belongs to someone else. Its token is not usable here. */
    | 'mismatch'
    /** Canvas declined to serialize `integration_id`; says nothing about who this person is. */
    | 'identifiers_withheld'
    /** The EngE-AI account carries no PUID to compare against. */
    | 'no_puid'
    /**
     * The connected Canvas account is not on this course's teacher roster, so there is no row to
     * read an identifier from. Not evidence of impersonation — a concluded or restricted
     * enrollment reaches here too — so the credential is kept.
     */
    | 'self_not_on_roster';

/**
 * Raised when the connected Canvas account cannot be confirmed as the signed-in user.
 *
 * Carries {@link CanvasIdentityFailure} because callers act on the distinction: only a genuine
 * `mismatch` justifies discarding the stored credential. Matching on the message text instead
 * would couple the route's behaviour to wording that exists to be read by humans and changed.
 */
export class CanvasIdentityError extends Error {
    constructor(
        message: string,
        readonly reason: CanvasIdentityFailure
    ) {
        super(message);
        this.name = 'CanvasIdentityError';
    }
}

/** One row in the "Connect to Canvas" picker. */
export interface CanvasCourseOption {
    /** Canvas's own course id, as a string. Provider-scoped — meaningless without {@link PROVIDER}. */
    canvasCourseId: string;
    name: string;
    code: string;
    /** How the signed-in user is enrolled in Canvas, which decides import vs. join. */
    role: CanvasRole;
    /** True when some instructor has already imported this Canvas course into EngE-AI. */
    connected: boolean;
    /** The EngE-AI course id, present only when `connected`. */
    engeAiCourseId?: string;
}

/** Outcome of connecting one Canvas course, shaped for the course-selection page. */
export interface ConnectCanvasCourseResult {
    status: 'imported' | 'joined' | 'awaiting_instructor';
    /** Absent only for `awaiting_instructor`, where no EngE-AI course exists yet. */
    courseId?: string;
    courseName?: string;
    /** Human-readable outcome for the picker to display. */
    message: string;
}

/** Minimal contract for the package's authenticated Canvas client, so tests can stand one in. */
export type CanvasApi = Parameters<typeof canvas.getCourses>[0];

/**
 * canvasRoleFor — which Canvas enrollment type applies to an EngE-AI user.
 *
 * EngE-AI affiliation decides, not Canvas: a faculty member connecting EngE-AI is importing
 * courses they teach, and a student is joining courses they take. Admins follow the instructor
 * path, consistent with every other authorization check in the app.
 */
export function canvasRoleFor(globalUser: GlobalUser): CanvasRole {
    return globalUser.affiliation === 'faculty' || isAdminUser(globalUser) ? 'teacher' : 'student';
}

/**
 * listCanvasCoursesForRole — the signed-in user's Canvas courses for one enrollment type.
 *
 * `enrollment_type` is applied by Canvas, so the result is an authorization fact from the
 * institution rather than a claim from the browser. Every caller that acts on a course id
 * re-derives this list rather than trusting one the client sent.
 *
 * The package paginates internally; before 1.0.0 it did not, and a course list longer than ten
 * rows came back silently truncated.
 */
async function listCanvasCoursesForRole(api: CanvasApi, role: CanvasRole): Promise<LmsCourse[]> {
    return canvas.getCourses(api, { enrollment_type: role });
}

/**
 * listCanvasCourseOptions — everything the picker needs for the signed-in user.
 *
 * Annotates each Canvas course with whether EngE-AI already has it, so a student can see at a
 * glance which of their courses are available and an instructor can see which they have already
 * imported. The linked-course lookup is one batched query, not one per row.
 *
 * @param api - authenticated Canvas client from the package's `requireAuth`
 * @param mongoDB - connected `EngEAI_MongoDB` singleton
 * @param globalUser - the signed-in user; decides which enrollment type is read
 */
export async function listCanvasCourseOptions(
    api: CanvasApi,
    mongoDB: EngEAI_MongoDB,
    globalUser: GlobalUser
): Promise<CanvasCourseOption[]> {
    const role = canvasRoleFor(globalUser);
    const canvasCourses = await listCanvasCoursesForRole(api, role);

    // Verify before returning anything, not just before importing. The stored Canvas token may
    // belong to someone else — Canvas re-authorizes whoever is already signed in to it, so a
    // second EngE-AI user on a shared browser silently ends up holding the first user's token.
    // Checking only at import would mean this list is that person's course names, shown to
    // someone with no right to them.
    //
    // One check covers every row: `integration_id` identifies the Canvas *account*, not the
    // enrollment, so confirming it against any one course they teach settles the whole list.
    // The first course is enough, and keeps this to a single extra request.
    if (role === 'teacher' && canvasCourses.length > 0) {
        await assertInstructorIdentity(api, canvasCourses[0].id, globalUser);
    }

    const linked = await mongoDB.findCoursesByLmsLinks(
        PROVIDER,
        canvasCourses.map((course) => course.id)
    );

    return canvasCourses.map((course) => {
        const match = linked.get(course.id);
        return {
            canvasCourseId: course.id,
            name: course.name,
            code: course.code,
            role,
            connected: Boolean(match),
            ...(match ? { engeAiCourseId: match.id } : {}),
        };
    });
}

/**
 * connectCanvasCourse — connects one Canvas course for the signed-in user.
 *
 * Branches on the user's EngE-AI affiliation, but only after Canvas has confirmed the matching
 * enrollment. An instructor importing a course they do not teach, or a student joining a course
 * they are not enrolled in, is rejected before any write.
 *
 * @param api - authenticated Canvas client
 * @param mongoDB - connected `EngEAI_MongoDB` singleton
 * @param globalUser - the signed-in user
 * @param canvasCourseId - Canvas course id chosen in the picker; untrusted until verified below
 *
 * @throws {Error} When the user holds no matching Canvas enrollment for `canvasCourseId`; when an
 * instructor's connected Canvas identity fails {@link assertInstructorIdentity}; or when a
 * different EngE-AI course already claims the Canvas course.
 */
export async function connectCanvasCourse(
    api: CanvasApi,
    mongoDB: EngEAI_MongoDB,
    globalUser: GlobalUser,
    canvasCourseId: string,
    academicPeriodId?: string
): Promise<ConnectCanvasCourseResult> {
    const role = canvasRoleFor(globalUser);

    // 1. Re-read the enrollment from Canvas. The id arrived from the browser, so the only thing
    //    that makes it trustworthy is finding it in the list Canvas filtered by enrollment type.
    const canvasCourses = await listCanvasCoursesForRole(api, role);
    const canvasCourse = canvasCourses.find((course) => course.id === canvasCourseId);
    if (!canvasCourse) {
        throw new Error(
            role === 'teacher'
                ? 'You are not listed as an instructor for that Canvas course'
                : 'You are not enrolled in that Canvas course'
        );
    }

    // 2. For instructors, prove the connected Canvas account is this person. Runs before any
    //    write, and before the link lookup, so a mismatched account learns nothing about which
    //    courses EngE-AI already has. Students are not verified this way — see the note on
    //    `connectStudent`.
    if (role === 'teacher') {
        await assertInstructorIdentity(api, canvasCourseId, globalUser);
    }

    // 3. Has an instructor already imported it?
    const existing = await mongoDB.findCourseByLmsLink(PROVIDER, canvasCourseId);

    if (role === 'student') {
        return connectStudent(mongoDB, globalUser, canvasCourse, existing);
    }
    return connectInstructor(mongoDB, globalUser, canvasCourse, existing, academicPeriodId);
}

/**
 * Student path: join an already-imported course, or report that the instructor has not set it up.
 *
 * A student cannot create the EngE-AI course. Reporting that plainly matters — an empty result
 * here means "your instructor has not connected this course yet", which is a different problem
 * from "something went wrong", and only the instructor can fix it.
 *
 * No PUID check happens here, and none is possible: Canvas grants `read_sis` to teachers, not
 * students, so a student's token cannot read `integration_id` for anyone including themselves.
 * The exposure is bounded — joining a course this way reaches exactly what the course code
 * already grants — but it is a real gap, not an oversight. Closing it needs an identity source
 * outside Canvas.
 */
async function connectStudent(
    mongoDB: EngEAI_MongoDB,
    globalUser: GlobalUser,
    canvasCourse: LmsCourse,
    existing: activeCourse | null
): Promise<ConnectCanvasCourseResult> {
    if (!existing) {
        return {
            status: 'awaiting_instructor',
            message:
                `${canvasCourse.name} is not set up on EngE-AI yet. ` +
                'Your instructor needs to connect it from their side first.',
        };
    }

    await mongoDB.enrollUserInCourse(globalUser, existing.id, 'student');
    appLogger.log(`[canvas-sync] Enrolled student in ${existing.courseName} via Canvas`);

    return {
        status: 'joined',
        courseId: existing.id,
        courseName: existing.courseName,
        message: `You have been added to ${existing.courseName}.`,
    };
}

/**
 * Instructor path: import the Canvas course, or join the EngE-AI course already imported from it.
 *
 * Joining rather than creating is what keeps co-taught courses together. Two instructors on one
 * Canvas course must land on one EngE-AI course, or their students split across two copies
 * depending on which instructor imported first.
 */
async function connectInstructor(
    mongoDB: EngEAI_MongoDB,
    globalUser: GlobalUser,
    canvasCourse: LmsCourse,
    existing: activeCourse | null,
    academicPeriodId?: string
): Promise<ConnectCanvasCourseResult> {
    if (existing) {
        await mongoDB.enrollUserInCourse(globalUser, existing.id, 'faculty');
        await addInstructorToCourse(mongoDB, existing, globalUser);

        return {
            status: 'joined',
            courseId: existing.id,
            courseName: existing.courseName,
            message: `${existing.courseName} is already on EngE-AI — you have been added as an instructor.`,
        };
    }

    // A Canvas course name is free text and may collide with a course EngE-AI already has under
    // a different origin. Refusing is right: `courseName` prefixes this course's collections, so
    // reusing one would merge two unrelated courses' rosters and chats.
    const courseName = resolveImportedCourseName(canvasCourse);
    const nameClash = await mongoDB.getCourseByName(courseName);
    if (nameClash) {
        throw new Error(
            `EngE-AI already has a course named "${courseName}" that is not connected to Canvas. ` +
                'Ask a platform admin to rename or connect it.'
        );
    }

    const link: CourseLmsLink = {
        provider: PROVIDER,
        courseId: canvasCourse.id,
        name: canvasCourse.name,
        code: canvasCourse.code,
        linkedAt: new Date(),
        linkedBy: globalUser.userId,
    };

    const created = await provisionCourse(mongoDB, {
        courseName,
        frameType: IMPORT_DEFAULT_FRAME_TYPE,
        tilesNumber: IMPORT_DEFAULT_TILES,
        creator: globalUser,
        // Falls back to the catalog default when the picker did not name a period, matching how
        // an unassigned course is grouped on the selection page.
        academicPeriodId: academicPeriodId ?? (await mongoDB.getDefaultAcademicPeriodId()),
        // Canvas supplies no course structure, so setup is still owed. This is what routes the
        // instructor into EngE-AI's setup flow when they first open the course.
        courseSetup: false,
        lmsLink: link,
    });

    appLogger.log(`[canvas-sync] Imported Canvas course as ${created.courseName} (${created.id})`);

    return {
        status: 'imported',
        courseId: created.id,
        courseName: created.courseName,
        message: `${created.courseName} has been added to EngE-AI. Finish setting it up to open it to students.`,
    };
}

/**
 * assertInstructorIdentity — proves the **connected Canvas account** belongs to the signed-in user.
 *
 * A teacher enrollment on the course is necessary but not sufficient. OAuth establishes only that
 * *some* Canvas account was authorized — a shared machine, a still-signed-in colleague, or a
 * deliberately supplied second account all satisfy it. Requiring the Canvas `integration_id` to
 * equal the PUID CWL authenticated is what ties the two identities to one person.
 *
 * The subtlety worth stating, because getting it wrong looks like it works: it is not enough to
 * find *someone* on the teacher roster carrying this PUID. That only proves the EngE-AI user
 * teaches the course, which they may well do while the token in hand belongs to somebody else —
 * exactly what happens when Canvas re-authorizes an already-signed-in account. The row that must
 * carry the PUID is the one belonging to the token's own Canvas account, so the account is
 * resolved first via `/users/self` and the roster is then searched **by Canvas user id**.
 *
 * `/users/self` cannot answer this alone: it returns the account id for anyone, but Canvas
 * withholds `integration_id` there for an ordinary instructor. `read_sis` is granted through a
 * `TeacherEnrollment` on a *course*, so the identifier is only readable in a course roster —
 * hence both calls.
 *
 * Reads the **teacher** roster only. `getCourseUsers` defaults to students, so `enrollmentTypes`
 * is passed explicitly; a student roster is never fetched anywhere in this module. The values are
 * compared in memory and discarded — none is returned, persisted, or logged, because the roster
 * carries other instructors' PUIDs and `active-users` is the only collection permitted to hold
 * one at rest.
 *
 * Comparison is trimmed and case-insensitive. Both sides are institutional identifiers for the
 * same person from the same institution, so the only differences worth tolerating are transport
 * ones; two distinct PUIDs never differ by case alone.
 *
 * @param api - authenticated Canvas client
 * @param canvasCourseId - the course being imported; also the context that grants `read_sis`
 * @param globalUser - the signed-in instructor, whose `puid` is the expected value
 *
 * @throws {CanvasIdentityError} Tagged with a {@link CanvasIdentityFailure} the caller branches on;
 * only `mismatch` means the credential is someone else's.
 */
export async function assertInstructorIdentity(
    api: CanvasApi,
    canvasCourseId: string,
    globalUser: GlobalUser
): Promise<void> {
    const expectedPuid = (globalUser.puid ?? '').trim().toLowerCase();
    if (!expectedPuid) {
        throw new CanvasIdentityError(
            'Your EngE-AI account has no CWL identifier, so Canvas cannot be verified',
            'no_puid'
        );
    }

    // 1. Whose token is this? The raw client is the package's own, so refresh and error handling
    //    are unchanged; the package exposes no "current user" helper, which the LMS guide names as
    //    the one sanctioned reason to call `get` directly.
    const self = await api.get<{ id?: number | string }>('/users/self');
    const connectedCanvasUserId = self?.id === undefined ? '' : String(self.id);

    // 2. That account's own roster row is the only one whose identifier means anything here.
    const teachers = await canvas.getCourseUsers(api, canvasCourseId, {
        enrollmentTypes: ['teacher'],
    });
    const connectedTeacher = teachers.find((teacher) => teacher.id === connectedCanvasUserId);

    if (!connectedTeacher) {
        // Canvas listed the course under this account's teacher enrollments, yet the account is
        // absent from the teacher roster — a concluded or otherwise restricted enrollment. No
        // identifier to read, and no evidence of impersonation, so the credential is kept.
        throw new CanvasIdentityError(
            'EngE-AI could not confirm your Canvas account against this course’s instructor list. ' +
                'Check that your Canvas instructor enrolment for this course is active.',
            'self_not_on_roster'
        );
    }

    if ((connectedTeacher.integrationId ?? '').trim().toLowerCase() === expectedPuid) {
        return;
    }

    // A roster where nobody carried an integration_id is Canvas declining to serialize the field,
    // not evidence about who this person is. Canvas hides it from callers without `read_sis`, and
    // the symptom is identical to a genuine mismatch — so it must not be reported as one. The
    // instructor cannot fix a permissions gap by re-authorizing, which is what the other message
    // would tell them to do.
    const coverage = rosterFieldCoverage(teachers);
    if (coverage.integrationId === 0) {
        throw new CanvasIdentityError(
            'Canvas did not return SIS identifiers for this course, so EngE-AI cannot confirm the ' +
                'connected account is yours. Ask your Canvas administrator to grant the ' +
                'SIS Data - read permission for instructors.',
            'identifiers_withheld'
        );
    }

    throw new CanvasIdentityError(
        'The Canvas account connected to EngE-AI belongs to someone else, so it has been ' +
            'disconnected. Sign out of Canvas in this browser, then connect again with your own ' +
            'Canvas account.',
        'mismatch'
    );
}

/**
 * resolveImportedCourseName — the EngE-AI course name for an imported Canvas course.
 *
 * Prefers Canvas's course code (`APSC 183`) over its full title, because the code is what
 * EngE-AI courses are named elsewhere and what appears throughout the UI. Falls back to the
 * title when a Canvas course has no code.
 */
export function resolveImportedCourseName(canvasCourse: LmsCourse): string {
    return (canvasCourse.code || canvasCourse.name || '').trim();
}

/**
 * addInstructorToCourse — adds a co-instructor to `activeCourse.instructors`, idempotently.
 *
 * Tolerates the legacy `string[]` instructor shape still present on older courses, normalizing
 * to `InstructorInfo[]` on write the same way the course-entry route does.
 */
async function addInstructorToCourse(
    mongoDB: EngEAI_MongoDB,
    course: activeCourse,
    globalUser: GlobalUser
): Promise<void> {
    const instructors: InstructorInfo[] = (course.instructors ?? []).map((inst) =>
        typeof inst === 'string' ? { userId: inst, name: 'Unknown' } : inst
    );

    if (instructors.some((inst) => inst.userId === globalUser.userId)) {
        return;
    }

    instructors.push({ userId: globalUser.userId, name: globalUser.name });
    await mongoDB.updateActiveCourse(course.id, { instructors });
}

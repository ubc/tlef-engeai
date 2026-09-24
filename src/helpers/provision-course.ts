/**
 * provision-course.ts
 *
 * Single source of truth for materializing a new EngE-AI course.
 *
 * Two entry points create courses and must agree on every side effect: `POST /api/courses`
 * (admin-assigned course names) and the Canvas import in `src/lms/canvas-course-sync.ts`.
 * Provisioning is not one insert — it generates the course id and code, builds default
 * week/topic content, creates the per-course collections, files a `CourseUser` row for the
 * creator, adds the course to their `coursesEnrolled`, and folds in platform admins. A second
 * implementation of that sequence would drift, and the drift would show up as a course that
 * half-works.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Shared course creation used by the courses API and by LMS import.
 */

import type {
    activeCourse,
    CourseFeatures,
    CourseLmsLink,
    frameType,
    GlobalUser,
    InstructorInfo,
    User,
} from '../types/shared';
import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { addAdminsToCourse } from './instructor-helpers';
import { buildTopicOrWeekInstances } from './build-default-course-content';
import { normalizeCourseFeaturesInput } from '../dashboard-setting/course-features';
import { appLogger } from '../utils/logger';

/** Everything {@link provisionCourse} needs that it cannot derive itself. */
export interface ProvisionCourseInput {
    /** Display name; also the prefix for this course's collections. Caller trims and de-duplicates. */
    courseName: string;
    frameType: frameType;
    tilesNumber: number;
    /** The signed-in user creating the course; always ends up an instructor on it. */
    creator: GlobalUser;
    /** Additional instructors beyond the creator. */
    instructors?: InstructorInfo[] | string[];
    teachingAssistants?: InstructorInfo[] | string[];
    features?: CourseFeatures;
    academicPeriodId?: string;
    /**
     * Whether course setup is already complete. Defaults to `false` so the instructor is sent
     * through setup on first entry — which is what an LMS import wants, since Canvas supplies a
     * name but nothing about weeks, topics, or content.
     */
    courseSetup?: boolean;
    /** Set only for LMS imports; see {@link CourseLmsLink}. */
    lmsLink?: CourseLmsLink;
}

/**
 * provisionCourse — creates a course and every record that must exist alongside it.
 *
 * Mirrors the ordering the courses API has always used: insert the catalog row first, then
 * re-read it to pick up the generated `courseCode`, then attach people. The people steps are
 * individually best-effort and logged rather than thrown, because a course that exists with a
 * missing admin row is recoverable, while a half-inserted course is not.
 *
 * Caller is responsible for authorization and for rejecting duplicate course names.
 *
 * @param mongoDB - connected `EngEAI_MongoDB` singleton
 * @param input - see {@link ProvisionCourseInput}
 *
 * @returns The created course, including its generated `id` and `courseCode`.
 */
export async function provisionCourse(
    mongoDB: EngEAI_MongoDB,
    input: ProvisionCourseInput
): Promise<activeCourse> {
    const courseName = input.courseName.trim();
    const creatorUserId = input.creator.userId;
    const date = new Date();

    // 1. Generate the course id from the shape the generator expects.
    const id = mongoDB.idGenerator.courseID({ ...input, courseName, date } as unknown as activeCourse);

    // 2. Default week/topic scaffolding; the instructor reshapes this during course setup.
    const topicOrWeekInstances = buildTopicOrWeekInstances(
        input.frameType,
        input.tilesNumber,
        courseName,
        mongoDB.idGenerator
    );

    // 3. The creator is always an instructor, whatever the caller passed.
    const instructors = normalizeInstructors(input.instructors);
    if (!instructors.some((inst) => inst.userId === creatorUserId)) {
        instructors.push({ userId: creatorUserId, name: input.creator.name });
    }

    let courseData: activeCourse = {
        id,
        date,
        courseName,
        courseSetup: input.courseSetup ?? false,
        contentSetup: false,
        flagSetup: false,
        monitorSetup: false,
        instructors,
        teachingAssistants: normalizeInstructors(input.teachingAssistants),
        frameType: input.frameType,
        tilesNumber: input.tilesNumber,
        topicOrWeekInstances,
        features: normalizeCourseFeaturesInput(input.features, creatorUserId),
        ...(input.academicPeriodId ? { academicPeriodId: input.academicPeriodId } : {}),
        ...(input.lmsLink ? { lmsLink: input.lmsLink } : {}),
    };

    // 4. Insert the catalog row and materialize the per-course collections.
    await mongoDB.postActiveCourse(courseData);

    // 5. Re-read to pick up the `courseCode` generated during insert.
    const created = await mongoDB.getActiveCourse(id);
    if (created) {
        courseData = created as unknown as activeCourse;
    }

    // 6. File the creator's roster row in `{courseName}_users`.
    try {
        const existing = await mongoDB.findStudentByUserId(courseName, creatorUserId);
        if (!existing) {
            const courseUser: Partial<User> = {
                name: input.creator.name,
                userId: creatorUserId,
                courseName,
                courseId: id,
                userOnboarding: false,
                affiliation: 'faculty',
                status: 'active',
                chats: [],
            };
            await mongoDB.createStudent(courseName, courseUser);
        }
    } catch (error) {
        appLogger.error('[PROVISION-COURSE] Failed to create creator CourseUser:', { error });
    }

    // 7. Make the course visible on the creator's course selection page.
    try {
        if (!input.creator.coursesEnrolled.includes(id)) {
            await mongoDB.addCourseToGlobalUser(input.creator.puid, id);
        }
    } catch (error) {
        appLogger.error('[PROVISION-COURSE] Failed to add course to creator enrollment:', { error });
    }

    // 8. Platform admins join every course, however it was created.
    try {
        const withAdmins = await addAdminsToCourse(mongoDB, id, courseName, courseData.instructors);
        await mongoDB.updateActiveCourse(id, { instructors: withAdmins });
        courseData = { ...courseData, instructors: withAdmins };
    } catch (error) {
        appLogger.error('[PROVISION-COURSE] Failed to add admins to course:', { error });
    }

    appLogger.log(`[PROVISION-COURSE] Created course ${courseName} (${id})`);
    return courseData;
}

/** Accepts the legacy `string[]` instructor shape alongside the current `InstructorInfo[]`. */
function normalizeInstructors(raw: InstructorInfo[] | string[] | undefined): InstructorInfo[] {
    if (!raw?.length) {
        return [];
    }
    return raw.map((inst) => (typeof inst === 'string' ? { userId: inst, name: 'Unknown' } : inst));
}

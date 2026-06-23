/**
 * course-roster-mongo.ts
 * @description Course roster role mutations (student ↔ TA).
 */

import type { activeCourse, InstructorInfo } from '../../types/shared';
import { activeCourseListCollection } from './mongo-collections';
import { instructorEntryUserId } from '../../utils/course-staff';
import type { MongoDalContext } from './mongo-context';
import { getCollectionNames } from './collection-registry-mongo';

export class CourseRosterError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CourseRosterError';
    }
}

function toInstructorInfo(entry: InstructorInfo | string): InstructorInfo {
    return typeof entry === 'string' ? { userId: entry, name: 'Unknown' } : entry;
}

/**
 * Promotes an enrolled student to TA (adds to teachingAssistants, keeps enrollment).
 */
export async function promoteStudentToTA(
    ctx: MongoDalContext,
    course: activeCourse,
    targetUserId: string,
    targetName: string
): Promise<activeCourse> {
    if (isInTAs(course, targetUserId)) {
        return course;
    }

    const collectionNames = await getCollectionNames(ctx, course.courseName);
    const courseUser = await ctx.db.collection(collectionNames.users).findOne({ userId: targetUserId });
    if (!courseUser) {
        throw new CourseRosterError('User not found in course roster');
    }

    const affiliation = (courseUser as { affiliation?: string }).affiliation;
    if (affiliation !== 'student') {
        throw new CourseRosterError('Only students can be promoted to TA');
    }

    const entry: InstructorInfo = { userId: targetUserId, name: targetName };
    const coll = activeCourseListCollection(ctx.db);
    await coll.updateOne(
        { id: course.id },
        { $addToSet: { teachingAssistants: entry } }
    );

    const updated = (await coll.findOne({ id: course.id })) as activeCourse | null;
    if (!updated) {
        throw new CourseRosterError('Course not found after update');
    }
    return updated;
}

/**
 * Demotes a TA back to student (removes from teachingAssistants only).
 */
export async function demoteTAToStudent(
    ctx: MongoDalContext,
    course: activeCourse,
    targetUserId: string
): Promise<activeCourse> {
    if (!isInTAs(course, targetUserId)) {
        return course;
    }

    const coll = activeCourseListCollection(ctx.db);
    const existing = (course.teachingAssistants ?? []).map(toInstructorInfo);
    const filtered = existing.filter((ta) => ta.userId !== targetUserId);

    await coll.updateOne(
        { id: course.id },
        { $set: { teachingAssistants: filtered } }
    );

    const updated = (await coll.findOne({ id: course.id })) as activeCourse | null;
    if (!updated) {
        throw new CourseRosterError('Course not found after update');
    }
    return updated;
}

function isInTAs(course: activeCourse, userId: string): boolean {
    return (course.teachingAssistants ?? []).some((ta) => instructorEntryUserId(ta) === userId);
}

// course-lms-link-mongo.ts
/**
 * course-lms-link-mongo.ts
 *
 * @description Reads and writes `activeCourse.lmsLink` on the **`active-course-list`** catalog —
 * the pointer from an EngE-AI course to the LMS course it was imported from.
 *
 * This link is the whole mechanism behind student enrollment sync. An instructor imports a
 * Canvas course, which writes the link; a student who later connects the same Canvas account
 * is matched into that EngE-AI course by looking their Canvas course ids up here. No roster is
 * ever read: each person authenticates to Canvas as themselves, so the enrollment Canvas
 * reports for them is the enrollment we act on.
 *
 * That matters beyond convenience. Canvas exposes an institutional identifier on roster rows —
 * at UBC it holds the PUID — and `active-users` is the only collection permitted to store one.
 * Resolving enrollment per-user keeps identity out of this collection entirely.
 */

import type { activeCourse, CourseLmsLink } from '../../types/shared';
import { activeCourseListCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/**
 * Unique partial index over the LMS link.
 *
 * Partial because the overwhelming majority of courses are admin-created and carry no
 * `lmsLink`; a plain unique index would treat all of their missing values as duplicates of
 * one another and reject every course after the first. Unique because two EngE-AI courses
 * claiming the same Canvas course would make student matching ambiguous — the student would
 * land in whichever row was read first.
 *
 * The name and the `partialFilterExpression` are a matched pair: MongoDB rejects an index
 * whose filter changed under a name that already exists. If this definition ever needs to
 * change, do it as an explicit reviewed migration, not by editing in place.
 */
export const COURSE_LMS_LINK_INDEX = {
    keys: { 'lmsLink.provider': 1, 'lmsLink.courseId': 1 },
    options: {
        name: 'lms_link_provider_course_unique',
        unique: true,
        partialFilterExpression: { 'lmsLink.courseId': { $exists: true } },
        background: true,
    },
} as const;

/**
 * createCourseLmsLinkIndex — best-effort provisioning of {@link COURSE_LMS_LINK_INDEX}.
 *
 * Failures are logged rather than thrown, matching `createFlagIndexes` and the scenario index
 * helpers: an index that fails to build must not stop the application from booting. The
 * uniqueness it enforces is a safety net, not the primary guard — {@link setCourseLmsLink}
 * checks for an existing claim before writing.
 */
export async function createCourseLmsLinkIndex(ctx: MongoDalContext): Promise<void> {
    try {
        await activeCourseListCollection(ctx.db).createIndex(
            COURSE_LMS_LINK_INDEX.keys as Record<string, 1>,
            COURSE_LMS_LINK_INDEX.options as any
        );
    } catch (error) {
        appLogger.warn('[lms-link] Index creation warning on active-course-list:', error);
    }
}

/**
 * findCourseByLmsLink — the EngE-AI course imported from a given LMS course, if any.
 *
 * Both arguments are required: LMS course ids are provider-scoped, so a bare id is ambiguous
 * as soon as more than one provider is configured.
 *
 * @param ctx - MongoDalContext
 * @param provider - which LMS `externalCourseId` belongs to
 * @param externalCourseId - the LMS's own course id, as a string
 *
 * @returns The linked course, or `null` when no instructor has imported it yet — which is the
 * ordinary case for a student who connects before their instructor has.
 */
export async function findCourseByLmsLink(
    ctx: MongoDalContext,
    provider: CourseLmsLink['provider'],
    externalCourseId: string
): Promise<activeCourse | null> {
    const doc = await activeCourseListCollection(ctx.db).findOne({
        'lmsLink.provider': provider,
        'lmsLink.courseId': externalCourseId,
    });
    return (doc as unknown as activeCourse) ?? null;
}

/**
 * findCoursesByLmsLinks — the subset of the given LMS courses that are already imported.
 *
 * Batched so the course picker can annotate a user's whole Canvas course list in one query
 * rather than one per row. Returns a map keyed by LMS course id for direct lookup.
 *
 * @param ctx - MongoDalContext
 * @param provider - which LMS the ids belong to
 * @param externalCourseIds - LMS course ids to look up; an empty array short-circuits
 */
export async function findCoursesByLmsLinks(
    ctx: MongoDalContext,
    provider: CourseLmsLink['provider'],
    externalCourseIds: string[]
): Promise<Map<string, activeCourse>> {
    if (externalCourseIds.length === 0) {
        return new Map();
    }

    const docs = (await activeCourseListCollection(ctx.db)
        .find({
            'lmsLink.provider': provider,
            'lmsLink.courseId': { $in: externalCourseIds },
        })
        .toArray()) as unknown as activeCourse[];

    return new Map(docs.map((course) => [course.lmsLink!.courseId, course]));
}

/**
 * setCourseLmsLink — attaches an LMS link to an existing EngE-AI course.
 *
 * Refuses when a *different* course already claims the same LMS course, so a second import of
 * one Canvas course cannot split students across two EngE-AI courses. Re-linking the same
 * course to the same LMS course is a no-op rather than an error, which keeps a retried import
 * idempotent.
 *
 * @param ctx - MongoDalContext
 * @param courseId - `activeCourse.id` receiving the link
 * @param link - the LMS reference to store
 *
 * @throws {Error} When another EngE-AI course is already linked to `link.courseId`.
 */
export async function setCourseLmsLink(
    ctx: MongoDalContext,
    courseId: string,
    link: CourseLmsLink
): Promise<void> {
    const existing = await findCourseByLmsLink(ctx, link.provider, link.courseId);
    if (existing && existing.id !== courseId) {
        throw new Error(
            `Another EngE-AI course is already connected to that ${link.provider} course`
        );
    }

    await activeCourseListCollection(ctx.db).updateOne({ id: courseId }, { $set: { lmsLink: link } });
    appLogger.log(`[lms-link] Linked course ${courseId} to ${link.provider} course ${link.courseId}`);
}

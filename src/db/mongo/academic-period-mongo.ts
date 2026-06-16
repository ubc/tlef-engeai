/**
 * academic-period-mongo.ts
 *
 * CRUD for `academic-periods` and dual-write `linkCourseToPeriod`.
 * AP-001 lazy migration: assign default `2025W2` when a course lacks `academicPeriodId`.
 */

import type { AcademicPeriodDocument, activeCourse } from '../../types/shared';
import { activeCourseListCollection, academicPeriodsCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/** Canonical default period title for legacy courses (UBC Winter Term 2, 2025–26). */
export const DEFAULT_ACADEMIC_PERIOD_TITLE = '2025W2';

/** Locked seed dates for {@link DEFAULT_ACADEMIC_PERIOD_TITLE}. */
export const DEFAULT_ACADEMIC_PERIOD_START = new Date('2026-01-06T00:00:00.000Z');
export const DEFAULT_ACADEMIC_PERIOD_END = new Date('2026-04-30T00:00:00.000Z');

export class AcademicPeriodValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AcademicPeriodValidationError';
    }
}

function parseDate(value: Date | string): Date {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
        throw new AcademicPeriodValidationError('Invalid date');
    }
    return d;
}

export function validatePeriodDates(startDate: Date | string, endDate: Date | string): void {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (end.getTime() <= start.getTime()) {
        throw new AcademicPeriodValidationError('endDate must be after startDate');
    }
}

/**
 * Idempotent startup seed — ensures the default `2025W2` period document exists.
 */
export async function ensureDefaultAcademicPeriod(ctx: MongoDalContext): Promise<AcademicPeriodDocument> {
    const coll = academicPeriodsCollection(ctx.db);
    const existing = (await coll.findOne({ title: DEFAULT_ACADEMIC_PERIOD_TITLE })) as AcademicPeriodDocument | null;
    if (existing) {
        return existing;
    }

    const now = new Date();
    const doc: AcademicPeriodDocument = {
        id: ctx.idGenerator.uniqueIDGenerator(`academic-period-${DEFAULT_ACADEMIC_PERIOD_TITLE}-${now.toISOString()}`),
        title: DEFAULT_ACADEMIC_PERIOD_TITLE,
        startDate: DEFAULT_ACADEMIC_PERIOD_START,
        endDate: DEFAULT_ACADEMIC_PERIOD_END,
        courseIds: [],
        createdAt: now,
        updatedAt: now
    };
    await coll.insertOne(doc as any);
    appLogger.log(`[academic-period] Seeded default period ${DEFAULT_ACADEMIC_PERIOD_TITLE}`);
    return doc;
}

export async function getDefaultAcademicPeriodId(ctx: MongoDalContext): Promise<string> {
    const period = await ensureDefaultAcademicPeriod(ctx);
    return period.id;
}

export async function getAcademicPeriodById(
    ctx: MongoDalContext,
    id: string
): Promise<AcademicPeriodDocument | null> {
    return (await academicPeriodsCollection(ctx.db).findOne({ id })) as AcademicPeriodDocument | null;
}

export async function getAcademicPeriodByTitle(
    ctx: MongoDalContext,
    title: string
): Promise<AcademicPeriodDocument | null> {
    return (await academicPeriodsCollection(ctx.db).findOne({ title })) as AcademicPeriodDocument | null;
}

export async function listAcademicPeriods(ctx: MongoDalContext): Promise<AcademicPeriodDocument[]> {
    const docs = await academicPeriodsCollection(ctx.db).find({}).sort({ startDate: -1 }).toArray();
    return docs as unknown as AcademicPeriodDocument[];
}

export async function createAcademicPeriod(
    ctx: MongoDalContext,
    input: { title: string; startDate: Date | string; endDate: Date | string }
): Promise<AcademicPeriodDocument> {
    const title = input.title.trim();
    if (!title) {
        throw new AcademicPeriodValidationError('title is required');
    }
    validatePeriodDates(input.startDate, input.endDate);

    const coll = academicPeriodsCollection(ctx.db);
    const duplicate = await coll.findOne({ title });
    if (duplicate) {
        throw new AcademicPeriodValidationError(`Academic period title already exists: ${title}`);
    }

    const now = new Date();
    const doc: AcademicPeriodDocument = {
        id: ctx.idGenerator.uniqueIDGenerator(`academic-period-${title}-${now.toISOString()}`),
        title,
        startDate: parseDate(input.startDate),
        endDate: parseDate(input.endDate),
        courseIds: [],
        createdAt: now,
        updatedAt: now
    };
    await coll.insertOne(doc as any);
    return doc;
}

export async function updateAcademicPeriod(
    ctx: MongoDalContext,
    id: string,
    input: { title?: string; startDate?: Date | string; endDate?: Date | string }
): Promise<AcademicPeriodDocument | null> {
    const existing = await getAcademicPeriodById(ctx, id);
    if (!existing) {
        return null;
    }

    const title = input.title !== undefined ? input.title.trim() : existing.title;
    const startDate = input.startDate !== undefined ? parseDate(input.startDate) : existing.startDate;
    const endDate = input.endDate !== undefined ? parseDate(input.endDate) : existing.endDate;

    if (!title) {
        throw new AcademicPeriodValidationError('title is required');
    }
    validatePeriodDates(startDate, endDate);

    if (title !== existing.title) {
        const duplicate = await academicPeriodsCollection(ctx.db).findOne({ title, id: { $ne: id } });
        if (duplicate) {
            throw new AcademicPeriodValidationError(`Academic period title already exists: ${title}`);
        }
    }

    const now = new Date();
    const result = await academicPeriodsCollection(ctx.db).findOneAndUpdate(
        { id },
        { $set: { title, startDate, endDate, updatedAt: now } },
        { returnDocument: 'after' }
    );
    return (result as AcademicPeriodDocument | null) ?? null;
}

/**
 * Single owner for dual-write: sets `course.academicPeriodId` and syncs `period.courseIds`.
 * Removes the course from any previous period's `courseIds` when moving.
 */
export async function linkCourseToPeriod(
    ctx: MongoDalContext,
    courseId: string,
    periodId: string
): Promise<void> {
    const courseColl = activeCourseListCollection(ctx.db);
    const periodColl = academicPeriodsCollection(ctx.db);

    const course = (await courseColl.findOne({ id: courseId })) as activeCourse | null;
    if (!course) {
        throw new Error(`Course not found: ${courseId}`);
    }

    const targetPeriod = (await periodColl.findOne({ id: periodId })) as AcademicPeriodDocument | null;
    if (!targetPeriod) {
        throw new Error(`Academic period not found: ${periodId}`);
    }

    const previousPeriodId = course.academicPeriodId;
    const now = new Date();

    if (previousPeriodId && previousPeriodId !== periodId) {
        await periodColl.updateOne(
            { id: previousPeriodId },
            { $pull: { courseIds: courseId }, $set: { updatedAt: now } } as any
        );
    }

    await courseColl.updateOne(
        { id: courseId },
        { $set: { academicPeriodId: periodId, updatedAt: Date.now().toString() } }
    );

    await periodColl.updateOne(
        { id: periodId },
        { $addToSet: { courseIds: courseId }, $set: { updatedAt: now } }
    );
}

/**
 * AP-001: persist default period FK on first read when missing.
 */
export async function lazyMigrateCourseAcademicPeriod(
    ctx: MongoDalContext,
    course: activeCourse
): Promise<activeCourse> {
    if (course.academicPeriodId) {
        return course;
    }

    try {
        let period = await getAcademicPeriodByTitle(ctx, DEFAULT_ACADEMIC_PERIOD_TITLE);
        if (!period) {
            if (!ctx.idGenerator) {
                return course;
            }
            period = await ensureDefaultAcademicPeriod(ctx);
        }

        await linkCourseToPeriod(ctx, course.id, period.id);
        appLogger.log(`[AP-001] Linked course ${course.id} to default period ${DEFAULT_ACADEMIC_PERIOD_TITLE}`);

        const updated = (await activeCourseListCollection(ctx.db).findOne({ id: course.id })) as activeCourse | null;
        return updated ?? { ...course, academicPeriodId: period.id };
    } catch (error) {
        appLogger.warn(`[AP-001] Skipped lazy migrate for course ${course.id}:`, error);
        return course;
    }
}

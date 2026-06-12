// report-fixture-seed-mongo.ts
/**
 * report-fixture-seed-mongo.ts
 * @description Destructive Test 3 report fixture seed — removes all Test 3 student roster rows,
 * memory-agent rows, and prior fixture global users, then imports synthetic students from JSON.
 */

import type { MemoryAgentEntry } from '../../types/shared';
import { countUnmappedLabels } from '../../helpers/struggle-chapter-normalize';
import { getActiveCourse } from './course-mongo';
import { getCollectionNames } from './collection-registry-mongo';
import {
    createStudent,
    getCourseUsersMongoCollection
} from './course-user-mongo';
import {
    addCourseToGlobalUser,
    createGlobalUser,
    findGlobalUserByPUID
} from './global-user-mongo';
import { activeUsersMongoCollection } from './mongo-collections';
import { createMemoryAgentEntry } from './memory-agent-mongo';
import { getAllInstructorStruggleTopics } from './topic-week-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

export const REPORT_FIXTURE_TARGET_COURSE_NAME = 'Test 3';

export const REPORT_FIXTURE_PUID_PREFIX = 'seed-test3-';

export type ReportFixtureSeedErrorCode = 'COURSE_NOT_FOUND' | 'WRONG_COURSE' | 'EMPTY_PAYLOAD';

export class ReportFixtureSeedError extends Error {
    readonly code: ReportFixtureSeedErrorCode;

    constructor(message: string, code: ReportFixtureSeedErrorCode) {
        super(message);
        this.name = 'ReportFixtureSeedError';
        this.code = code;
    }
}

export interface ReportFixtureSeedSummary {
    courseId: string;
    courseName: string;
    studentsSeeded: number;
    memoryAgentRowsCreated: number;
    /** Course roster student documents removed before import */
    studentsRemoved: number;
    /** Synthetic `active-users` rows removed (`seed-test3-*` prefix) */
    syntheticGlobalUsersRemoved: number;
    /** Non-synthetic global students unenrolled from Test 3 */
    globalStudentsUnenrolled: number;
    /** Labels in JSON that did not match any instructor catalog chapter (omitted from storage) */
    unmappedLabelCount: number;
}

/**
 * Validates request body shape: `{ struggleTopicsByStudent: Record<string, string[]> }`.
 *
 * @returns Parsed map or `null` when invalid
 */
export function parseStruggleTopicsByStudentBody(body: unknown): Record<string, string[]> | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return null;
    }
    const raw = (body as { struggleTopicsByStudent?: unknown }).struggleTopicsByStudent;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }

    const result: Record<string, string[]> = {};
    for (const [name, topics] of Object.entries(raw as Record<string, unknown>)) {
        const trimmedName = name.trim();
        if (!trimmedName || !Array.isArray(topics)) {
            return null;
        }
        if (!topics.every((t) => typeof t === 'string')) {
            return null;
        }
        result[trimmedName] = topics;
    }

    if (Object.keys(result).length === 0) {
        return null;
    }

    return result;
}

/**
 * Builds a deterministic synthetic `puid` for report fixture students (isolated from SAML users).
 */
export function buildReportFixtureSyntheticPuid(studentName: string): string {
    const slug = studentName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${REPORT_FIXTURE_PUID_PREFIX}${slug || 'unknown'}`;
}

/** @deprecated Use {@link buildReportFixtureSyntheticPuid} */
export const buildSeedTest3SyntheticPuid = buildReportFixtureSyntheticPuid;

/**
 * Removes all Test 3 student roster documents and memory-agent rows, then imports students from JSON payload.
 *
 * @throws {@link ReportFixtureSeedError} when course is missing, wrong course, or payload is empty
 */
export async function seedReportFixture(
    ctx: MongoDalContext,
    courseId: string,
    struggleTopicsByStudent: Record<string, string[]>
): Promise<ReportFixtureSeedSummary> {
    const names = Object.keys(struggleTopicsByStudent);
    if (names.length === 0) {
        throw new ReportFixtureSeedError('struggleTopicsByStudent must be a non-empty object', 'EMPTY_PAYLOAD');
    }

    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new ReportFixtureSeedError(`Course not found: ${courseId}`, 'COURSE_NOT_FOUND');
    }

    const courseName = course.courseName;
    if (courseName !== REPORT_FIXTURE_TARGET_COURSE_NAME) {
        throw new ReportFixtureSeedError(
            `Report fixture seed is only allowed for "${REPORT_FIXTURE_TARGET_COURSE_NAME}" (got "${courseName}")`,
            'WRONG_COURSE'
        );
    }

    appLogger.log(`[REPORT-FIXTURE] Starting seed for ${courseName} (${courseId}), ${names.length} students`);

    const catalog = await getAllInstructorStruggleTopics(ctx, courseId);

    const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
    const studentsRemovedResult = await userCollection.deleteMany({ affiliation: 'student' });

    const collectionNames = await getCollectionNames(ctx, courseName);
    const memoryAgentCollection = ctx.db.collection(collectionNames.memoryAgent);
    const memDeleteResult = await memoryAgentCollection.deleteMany({});

    const activeUsersCollection = activeUsersMongoCollection(ctx.db);
    const syntheticGlobalDeleteResult = await activeUsersCollection.deleteMany({
        puid: { $regex: `^${REPORT_FIXTURE_PUID_PREFIX}` }
    });
    const globalStudentsUnenrolledResult = await activeUsersCollection.updateMany(
        { affiliation: 'student', coursesEnrolled: courseId },
        { $pull: { coursesEnrolled: courseId }, $set: { updatedAt: new Date() } } as any
    );

    let studentsSeeded = 0;
    let memoryAgentRowsCreated = 0;
    let unmappedLabelCount = 0;

    for (const name of names) {
        const struggleTopics = struggleTopicsByStudent[name];
        const trimmedName = name.trim();
        const puid = buildReportFixtureSyntheticPuid(trimmedName);
        const userId = ctx.idGenerator.globalUserID(puid, trimmedName, 'student');

        unmappedLabelCount += countUnmappedLabels(struggleTopics, catalog);

        let globalUser = await findGlobalUserByPUID(ctx, puid);
        if (!globalUser) {
            globalUser = await createGlobalUser(ctx, {
                name: trimmedName,
                puid,
                userId,
                affiliation: 'student',
                coursesEnrolled: [courseId],
                status: 'active'
            });
        } else if (!globalUser.coursesEnrolled.includes(courseId)) {
            await addCourseToGlobalUser(ctx, puid, courseId);
        }

        await createStudent(ctx, courseName, {
            name: trimmedName,
            userId,
            courseName,
            courseId,
            userOnboarding: true,
            affiliation: 'student',
            status: 'active',
            chats: []
        });

        const now = new Date();
        const entry: MemoryAgentEntry = {
            name: trimmedName,
            userId,
            role: 'Student',
            struggleTopics,
            createdAt: now,
            updatedAt: now
        };
        await createMemoryAgentEntry(ctx, courseName, entry);

        studentsSeeded += 1;
        memoryAgentRowsCreated += 1;
    }

    const summary: ReportFixtureSeedSummary = {
        courseId,
        courseName,
        studentsSeeded,
        memoryAgentRowsCreated,
        studentsRemoved: studentsRemovedResult.deletedCount,
        syntheticGlobalUsersRemoved: syntheticGlobalDeleteResult.deletedCount,
        globalStudentsUnenrolled: globalStudentsUnenrolledResult.modifiedCount,
        unmappedLabelCount
    };

    appLogger.log(
        `[REPORT-FIXTURE] Completed seed: ${summary.studentsSeeded} students imported, ` +
            `${summary.studentsRemoved} roster students removed, ` +
            `${memDeleteResult.deletedCount} memory-agent rows removed, ` +
            `${summary.syntheticGlobalUsersRemoved} synthetic global users removed, ` +
            `${summary.globalStudentsUnenrolled} non-synthetic global students unenrolled, ` +
            `unmappedLabelCount=${summary.unmappedLabelCount}`
    );

    if (summary.unmappedLabelCount > 0) {
        appLogger.warn(
            `[REPORT-FIXTURE] ${summary.unmappedLabelCount} label(s) did not match Test 3 instructor catalog and were omitted`
        );
    }

    return summary;
}

/** @deprecated Use {@link seedReportFixture} */
export const seedTest3ReportFixture = seedReportFixture;

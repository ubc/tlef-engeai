// flag-mongo.ts
/**
 * flag-mongo.ts
 * @author @gatahcha (refactor)
 * @description Moderation **flags** stored in each course’s `{courseName}_flags` collection — CRUD, validation, analytics, and enrichment with roster names.
 */

import type { Collection } from 'mongodb';
import type {
    FlagReport,
    FlagReportActor,
    ManualFlagEscalationListPage,
    ManualFlagEscalationView
} from '../../types/shared';
import {
    isManualFlagType,
    validateManualFlagStatusTransition
} from '../../flags/manual-flag-policy';
import { getAllActiveCourses } from './course-mongo';
import { batchFindUsersByUserIds } from './course-user-mongo';
import { getCollectionNames } from './collection-registry-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/**
 * Resolves the `{courseName}_flags` collection using `getCollectionNames`.
 *
 * @internal
 */
async function getFlagsCollection(ctx: MongoDalContext, courseName: string): Promise<Collection> {
    const collections = await getCollectionNames(ctx, courseName);
    return ctx.db.collection(collections.flags);
}

/**
 * validateFlagDocument
 *
 * Static shape check for telemetry / remediation — **does not guarantee business invariants**, only structural rules carried from legacy validators.
 *
 * @param flagDocument - `any` — raw BSON document
 *
 * @returns `{ isValid, issues[] }`
 *
 * @internal
 */
function validateFlagDocument(flagDocument: any): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    const requiredFields = [
        'id',
        'courseName',
        'date',
        'flagType',
        'reportType',
        'chatContent',
        'userId',
        'status',
        'createdAt',
        'updatedAt'
    ];
    for (const field of requiredFields) {
        if (flagDocument[field] === undefined || flagDocument[field] === null) {
            issues.push(`Missing required field: ${field}`);
        }
    }
    if (flagDocument.id && typeof flagDocument.id !== 'string') {
        issues.push('Field "id" must be a string');
    }
    if (flagDocument.userId && typeof flagDocument.userId !== 'number') {
        issues.push('Field "userId" must be a number');
    }
    if (flagDocument.status && !['unresolved', 'resolved', 'escalated'].includes(flagDocument.status)) {
        issues.push('Field "status" must be "unresolved", "resolved", or "escalated"');
    }
    if (flagDocument.flagType && !isManualFlagType(flagDocument.flagType)) {
        issues.push('Field "flagType" has invalid value');
    }
    if (flagDocument.date && !(flagDocument.date instanceof Date)) {
        issues.push('Field "date" must be a Date object');
    }
    if (flagDocument.createdAt && !(flagDocument.createdAt instanceof Date)) {
        issues.push('Field "createdAt" must be a Date object');
    }
    if (flagDocument.updatedAt && !(flagDocument.updatedAt instanceof Date)) {
        issues.push('Field "updatedAt" must be a Date object');
    }
    return { isValid: issues.length === 0, issues };
}

/**
 * createFlagReport
 *
 * Persists one `FlagReport` document keyed by canonical `flagReport.id`.
 *
 * @param ctx - MongoDalContext
 * @param flagReport - `FlagReport`
 *
 * @returns Mongo `InsertOneResult`
 *
 * Actions:
 * - Insert into `{course}_flags`; wrap unexpected errors into `Error(...)` strings (legacy UX).
 */
export async function createFlagReport(ctx: MongoDalContext, flagReport: FlagReport) {
    appLogger.log('🏴 Creating flag report:', flagReport.id, 'for course:', flagReport.courseName);
    try {
        const flagsCollection = await getFlagsCollection(ctx, flagReport.courseName);
        const result = await flagsCollection.insertOne(flagReport as any);
        appLogger.log('🏴 Flag report created successfully:', flagReport.id, 'MongoDB ID:', result.insertedId);
        return result;
    } catch (error) {
        appLogger.log('🏴 Error creating flag report:', flagReport.id, 'Error:', error);
        throw new Error(`Failed to create flag report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * getAllFlagReports
 *
 * @param ctx - MongoDalContext
 * @param courseName - string — logical namespace (not necessarily `courseId`)
 *
 * @returns All flag BSON docs cast to `FlagReport[]`.
 */
export async function getAllFlagReports(ctx: MongoDalContext, courseName: string): Promise<FlagReport[]> {
    appLogger.log('🏴 Getting flag reports for course:', courseName);
    const flagsCollection = await getFlagsCollection(ctx, courseName);
    return await flagsCollection.find({}).toArray().then(arr => arr as unknown as FlagReport[]);
}

/**
 * getFlagReport
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param flagId - string — equals doc `id` field (string key, not `_id`)
 *
 * @returns `FlagReport | null`
 */
export async function getFlagReport(
    ctx: MongoDalContext,
    courseName: string,
    flagId: string
): Promise<FlagReport | null> {
    appLogger.log('🏴 Getting flag report:', flagId, 'for course:', courseName);
    const flagsCollection = await getFlagsCollection(ctx, courseName);
    return (await flagsCollection.findOne({ id: flagId })) as FlagReport | null;
}

/**
 * updateFlagReport
 *
 * Generic `$set` merge for instructor edits; always stamps `updatedAt` and normalizes `response` to empty string when absent.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param flagId - string
 * @param updateData - `Partial<FlagReport>`
 *
 * @returns `findOneAndUpdate` result (post image per options)
 */
export async function updateFlagReport(
    ctx: MongoDalContext,
    courseName: string,
    flagId: string,
    updateData: Partial<FlagReport>
) {
    appLogger.log('🏴 Updating flag report:', flagId, 'for course:', courseName, 'with data:', updateData);
    try {
        const flagsCollection = await getFlagsCollection(ctx, courseName);
        const updateWithTimestamp: Partial<FlagReport> & { updatedAt: Date } = {
            ...updateData,
            updatedAt: new Date()
        };
        if (updateData.response === undefined || updateData.response === null) {
            (updateWithTimestamp as Record<string, unknown>).response = '';
        }
        appLogger.log('🏴 About to update with query:', { id: flagId });
        appLogger.log('🏴 About to update with data:', { $set: updateWithTimestamp });
        const result = await flagsCollection.findOneAndUpdate(
            { id: flagId },
            { $set: updateWithTimestamp },
            { returnDocument: 'after' }
        );
        appLogger.log('🏴 Update result:', result);
        return result;
    } catch (error) {
        appLogger.log('🏴 Error updating flag report:', flagId, 'Error:', error);
        throw new Error(`Failed to update flag report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * deleteFlagReport
 *
 * Removes a single moderator flag by string `id`.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param flagId - string
 *
 * @returns Mongo `DeleteResult`
 */
export async function deleteFlagReport(ctx: MongoDalContext, courseName: string, flagId: string) {
    appLogger.log('🏴 Deleting flag report:', flagId, 'for course:', courseName);
    const flagsCollection = await getFlagsCollection(ctx, courseName);
    return await flagsCollection.deleteOne({ id: flagId });
}

/**
 * deleteAllFlagReports
 *
 * Destructive reset for a course’s flag bucket — use only in admin tooling.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 *
 * @returns Mongo `DeleteResult`
 */
export async function deleteAllFlagReports(ctx: MongoDalContext, courseName: string) {
    appLogger.log('🏴 Deleting all flag reports for course:', courseName);
    const flagsCollection = await getFlagsCollection(ctx, courseName);
    return await flagsCollection.deleteMany({});
}

/**
 * updateFlagStatus
 *
 * Status transition with validation + optional instructor audit fields.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param flagId - string
 * @param newStatus - string — `unresolved` | `resolved`
 * @param response - string | undefined — instructor reply when resolving
 * @param instructorId - string | undefined — last actor `userId`
 *
 * @returns Updated `FlagReport` or throws if missing / invalid
 *
 * Actions:
 * - Load current doc, run `validateManualFlagStatusTransition`.
 * - `$set` status, timestamps, optional response / audit metadata.
 */
export async function updateFlagStatus(
    ctx: MongoDalContext,
    courseName: string,
    flagId: string,
    newStatus: string,
    response?: string,
    instructorId?: string
): Promise<FlagReport | null> {
    appLogger.log(`[MONGODB] 🔄 Updating flag status: ${flagId} to ${newStatus} in course: ${courseName}`);
    try {
        const flagsCollection = await getFlagsCollection(ctx, courseName);
        const currentFlag = await flagsCollection.findOne({ id: flagId });
        if (!currentFlag) {
            throw new Error(`Flag not found: ${flagId}`);
        }
        const validation = validateManualFlagStatusTransition((currentFlag as any).status, newStatus);
        if (!validation.isValid) {
            throw new Error(validation.error);
        }
        const updateData: Record<string, unknown> = {
            status: newStatus,
            updatedAt: new Date()
        };
        if (response !== undefined) {
            updateData.response = response;
        }
        if (instructorId) {
            updateData.lastUpdatedBy = instructorId;
            updateData.lastUpdatedAt = new Date();
        }
        const result = await flagsCollection.findOneAndUpdate(
            { id: flagId },
            { $set: updateData },
            { returnDocument: 'after' }
        );
        if (!result) {
            throw new Error(`Failed to update flag: ${flagId}`);
        }
        appLogger.log(`[MONGODB] ✅ Flag status updated successfully: ${flagId} -> ${newStatus}`);
        return result as unknown as FlagReport;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error updating flag status:`, error);
        throw error;
    }
}

/**
 * getFlagStatistics
 *
 * Materializes rollups in application memory (legacy approach — fine for moderate volumes).
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 *
 * @returns Totals, group-by maps, and activity windows (24h / 7d / 30d using `createdAt`)
 */
export async function getFlagStatistics(
    ctx: MongoDalContext,
    courseName: string
): Promise<{
    total: number;
    unresolved: number;
    resolved: number;
    byType: { [key: string]: number };
    byStatus: { [key: string]: number };
    recentActivity: { last24Hours: number; last7Days: number; last30Days: number };
}> {
    appLogger.log(`[MONGODB] 📊 Getting flag statistics for course: ${courseName}`);
    try {
        const flagsCollection = await getFlagsCollection(ctx, courseName);
        const allFlags = await flagsCollection.find({}).toArray();
        const total = allFlags.length;
        const unresolved = allFlags.filter(f => f.status === 'unresolved').length;
        const resolved = allFlags.filter(f => f.status === 'resolved').length;
        const byType: { [key: string]: number } = {};
        allFlags.forEach(flag => {
            const ft = flag.flagType as string;
            byType[ft] = (byType[ft] || 0) + 1;
        });
        const byStatus: { [key: string]: number } = {};
        allFlags.forEach(flag => {
            const st = flag.status as string;
            byStatus[st] = (byStatus[st] || 0) + 1;
        });
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const recentActivity = {
            last24Hours: allFlags.filter(f => (f.createdAt as Date) >= last24Hours).length,
            last7Days: allFlags.filter(f => (f.createdAt as Date) >= last7Days).length,
            last30Days: allFlags.filter(f => (f.createdAt as Date) >= last30Days).length
        };
        const stats = { total, unresolved, resolved, byType, byStatus, recentActivity };
        appLogger.log(`[MONGODB] 📊 Flag statistics retrieved:`, stats);
        return stats;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error getting flag statistics:`, error);
        throw error;
    }
}

/**
 * validateFlagCollection
 *
 * Scans every document and concatenates human-readable issues for CSV-style exports / admin warnings.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 *
 * @returns `{ isValid, issues[], stats{...} }`
 */
export async function validateFlagCollection(ctx: MongoDalContext, courseName: string) {
    appLogger.log('🔍 [MONGODB] Validating flag collection for course:', courseName);
    try {
        const flagsCollection = await getFlagsCollection(ctx, courseName);
        const issues: string[] = [];
        const allFlags = await flagsCollection.find({}).toArray();
        let invalidDocuments = 0;
        for (const flag of allFlags) {
            const validation = validateFlagDocument(flag);
            if (!validation.isValid) {
                invalidDocuments++;
                issues.push(`Flag ${(flag as any).id}: ${validation.issues.join(', ')}`);
            }
        }
        const totalFlags = allFlags.length;
        const unresolvedFlags = allFlags.filter(f => f.status === 'unresolved').length;
        const resolvedFlags = allFlags.filter(f => f.status === 'resolved').length;
        const isValid = invalidDocuments === 0;
        appLogger.log('🔍 [MONGODB] Flag collection validation result:', {
            isValid,
            totalFlags,
            unresolvedFlags,
            resolvedFlags,
            invalidDocuments,
            issuesCount: issues.length
        });
        return {
            isValid,
            issues,
            stats: {
                totalFlags,
                unresolvedFlags,
                resolvedFlags,
                invalidDocuments
            }
        };
    } catch (error) {
        appLogger.error('🔍 [MONGODB] Error validating flag collection:', error);
        throw new Error(
            `Flag collection validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

/**
 * createFlagIndexes
 *
 * Creates the standard compound / single-field indexes with `{ background: true }`. Partial failures are collected, not thrown, unless the outer try fails.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 *
 * @returns `{ success, indexesCreated[], errors[] }`
 */
export async function createFlagIndexes(
    ctx: MongoDalContext,
    courseName: string
): Promise<{ success: boolean; indexesCreated: string[]; errors: string[] }> {
    appLogger.log('📊 [MONGODB] Creating indexes for flag collection:', courseName);
    try {
        const flagsCollection = await getFlagsCollection(ctx, courseName);
        const indexesCreated: string[] = [];
        const errors: string[] = [];
        const indexDefinitions = [
            {
                name: 'status_createdAt',
                spec: { status: 1, createdAt: -1 } as Record<string, 1 | -1>,
                description: 'Primary query index for unresolved flags sorted by newest first'
            },
            {
                name: 'userId',
                spec: { userId: 1 } as Record<string, 1 | -1>,
                description: 'User lookup index for flags by specific user'
            },
            {
                name: 'courseName_status',
                spec: { courseName: 1, status: 1 } as Record<string, 1 | -1>,
                description: 'Course-specific flag filtering'
            },
            {
                name: 'flagType_status',
                spec: { flagType: 1, status: 1 } as Record<string, 1 | -1>,
                description: 'Filter flags by type'
            }
        ];
        for (const indexDef of indexDefinitions) {
            try {
                await flagsCollection.createIndex(indexDef.spec, { name: indexDef.name, background: true });
                indexesCreated.push(indexDef.name);
                appLogger.log('📊 [MONGODB] Created index:', indexDef.name, '-', indexDef.description);
            } catch (indexError) {
                const errorMsg = `Failed to create index ${indexDef.name}: ${indexError instanceof Error ? indexError.message : 'Unknown error'}`;
                errors.push(errorMsg);
                appLogger.error('📊 [MONGODB]', errorMsg);
            }
        }
        const success = errors.length === 0;
        appLogger.log('📊 [MONGODB] Index creation result:', {
            success,
            indexesCreated: indexesCreated.length,
            errors: errors.length
        });
        return { success, indexesCreated, errors };
    } catch (error) {
        appLogger.error('📊 [MONGODB] Error creating indexes:', error);
        throw new Error(`Index creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * getFlagReportsWithUserNames
 *
 * Cross-domain helper: bulk-loads roster rows so analytics UIs can show **student display names** without exposing `puid`.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 *
 * @returns `FlagReport` objects extended with optional `userName` / `userAffiliation`
 *
 * Actions:
 * - `getAllFlagReports`.
 * - Unique `userId` list → `batchFindUsersByUserIds` (map keys are stringified for stable joins).
 * - Default missing users to `"Unknown User"` / `"Unknown"`.
 */
export async function getFlagReportsWithUserNames(
    ctx: MongoDalContext,
    courseName: string
): Promise<
    Array<
        FlagReport & {
            userName?: string;
            userAffiliation?: string;
        }
    >
> {
    appLogger.log(`[MONGODB] 🔍 Getting flag reports with user names for course: ${courseName}`);
    try {
        const flagReports = await getAllFlagReports(ctx, courseName);
        if (flagReports.length === 0) return [];
        const userIds = [...new Set(flagReports.map(flag => flag.userId))];
        const userMap = await batchFindUsersByUserIds(ctx, courseName, userIds);
        const flagsWithNames = flagReports.map(flag => {
            const userInfo = userMap.get(String(flag.userId));
            return {
                ...flag,
                userName: userInfo?.name || 'Unknown User',
                userAffiliation: userInfo?.affiliation || 'Unknown'
            };
        });
        appLogger.log(`[MONGODB] ✅ Retrieved ${flagsWithNames.length} flag reports with user names`);
        return flagsWithNames;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error getting flag reports with user names:`, error);
        throw error;
    }
}

/** Thrown when a flag id does not exist in the requested course collection. */
export class FlagReportNotFoundError extends Error {
    constructor(message = 'Flag report not found') {
        super(message);
        this.name = 'FlagReportNotFoundError';
    }
}

/** Thrown when a flag lifecycle action conflicts with the current status. */
export class FlagReportConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FlagReportConflictError';
    }
}

export interface ManualFlagAdminListFilters {
    page?: number;
    pageSize?: number;
    courseId?: string;
    courseIds?: string[];
    reviewState?: 'needs-review' | 'reviewed' | 'all';
    dateFrom?: Date;
    dateTo?: Date;
}

function normalizedManualFlagPagination(filters: ManualFlagAdminListFilters): { page: number; pageSize: number } {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters.pageSize && filters.pageSize > 0 ? Math.min(filters.pageSize, 200) : 50;
    return { page, pageSize };
}

function toManualEscalationView(courseId: string, flag: FlagReport): ManualFlagEscalationView {
    return {
        id: flag.id,
        courseId,
        courseName: flag.courseName,
        flagType: flag.flagType,
        reportType: flag.reportType,
        chatContent: flag.chatContent,
        status: 'escalated',
        escalatedAt: (flag.escalatedAt ?? flag.updatedAt).toISOString(),
        escalatedByName: flag.escalatedBy?.name,
        adminReviewedAt: flag.adminReviewedAt?.toISOString(),
        adminReviewedByName: flag.adminReviewedBy?.name,
        createdAt: flag.createdAt.toISOString()
    };
}

/**
 * escalateFlagReport - Moves one unresolved manual flag into the platform-admin queue.
 *
 * @param ctx - MongoDalContext
 * @param courseName - Owning course namespace
 * @param flagId - Flag document id
 * @param actor - Staff identity snapshot recorded on the escalation
 * @returns Updated flag document
 */
export async function escalateFlagReport(
    ctx: MongoDalContext,
    courseName: string,
    flagId: string,
    actor: FlagReportActor
): Promise<FlagReport> {
    const flagsCollection = await getFlagsCollection(ctx, courseName);
    const updated = await flagsCollection.findOneAndUpdate(
        { id: flagId, status: 'unresolved' },
        {
            $set: {
                status: 'escalated',
                escalatedAt: new Date(),
                escalatedBy: actor,
                updatedAt: new Date()
            }
        },
        { returnDocument: 'after' }
    );
    if (!updated) {
        const existing = await flagsCollection.findOne({ id: flagId });
        if (!existing) throw new FlagReportNotFoundError();
        throw new FlagReportConflictError('Only unresolved flags can be escalated to administrators');
    }
    return updated as unknown as FlagReport;
}

/**
 * markManualFlagAdminReviewed - Records platform-admin review on an escalated manual flag.
 *
 * @param ctx - MongoDalContext
 * @param courseName - Owning course namespace
 * @param flagId - Flag document id
 * @param actor - Platform-admin identity snapshot
 * @returns Updated flag document
 */
export async function markManualFlagAdminReviewed(
    ctx: MongoDalContext,
    courseName: string,
    flagId: string,
    actor: FlagReportActor
): Promise<FlagReport> {
    const flagsCollection = await getFlagsCollection(ctx, courseName);
    const updated = await flagsCollection.findOneAndUpdate(
        { id: flagId, status: 'escalated', adminReviewedAt: { $exists: false } },
        {
            $set: {
                adminReviewedAt: new Date(),
                adminReviewedBy: actor,
                updatedAt: new Date()
            }
        },
        { returnDocument: 'after' }
    );
    if (!updated) {
        const existing = await flagsCollection.findOne({ id: flagId });
        if (!existing) throw new FlagReportNotFoundError();
        if (existing.status !== 'escalated') {
            throw new FlagReportConflictError('Only escalated flags can be marked reviewed');
        }
        throw new FlagReportConflictError('Escalated flag has already been reviewed');
    }
    return updated as unknown as FlagReport;
}

/**
 * listEscalatedManualFlagsForAdmin - Cross-course escalated manual flag queue for platform admins.
 *
 * ponytail: scans active courses in memory — fine for moderate volumes; upgrade to aggregation if needed.
 *
 * @param ctx - MongoDalContext
 * @param filters - Pagination, course scope, review state, and optional date window
 * @returns Paginated safe escalation rows
 */
export async function listEscalatedManualFlagsForAdmin(
    ctx: MongoDalContext,
    filters: ManualFlagAdminListFilters
): Promise<ManualFlagEscalationListPage> {
    const pagination = normalizedManualFlagPagination(filters);
    const courses = await getAllActiveCourses(ctx);
    const allowedCourseIds = filters.courseIds
        ? new Set(filters.courseIds)
        : filters.courseId
          ? new Set([filters.courseId])
          : null;

    const rows: Array<{ sortAt: Date; view: ManualFlagEscalationView }> = [];

    for (const course of courses) {
        if (allowedCourseIds && !allowedCourseIds.has(course.id)) continue;
        const flags = await getAllFlagReports(ctx, course.courseName);
        for (const flag of flags) {
            if (flag.status !== 'escalated') continue;
            const sortAt = flag.escalatedAt ?? flag.updatedAt ?? flag.createdAt;
            if (filters.dateFrom && sortAt < filters.dateFrom) continue;
            if (filters.dateTo && sortAt > filters.dateTo) continue;
            if (filters.reviewState === 'needs-review' && flag.adminReviewedAt) continue;
            if (filters.reviewState === 'reviewed' && !flag.adminReviewedAt) continue;
            rows.push({ sortAt, view: toManualEscalationView(course.id, flag) });
        }
    }

    rows.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
    const total = rows.length;
    const start = (pagination.page - 1) * pagination.pageSize;
    const items = rows.slice(start, start + pagination.pageSize).map((row) => row.view);
    return { items, page: pagination.page, pageSize: pagination.pageSize, total };
}

/**
 * countManualFlagsAwaitingAdminReview - Counts unreviewed escalated manual flags across active courses.
 */
export async function countManualFlagsAwaitingAdminReview(ctx: MongoDalContext): Promise<number> {
    const page = await listEscalatedManualFlagsForAdmin(ctx, {
        page: 1,
        pageSize: 1,
        reviewState: 'needs-review'
    });
    return page.total;
}

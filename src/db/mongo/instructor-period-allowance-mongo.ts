/**
 * instructor-period-allowance-mongo.ts
 *
 * Period-scoped instructor course allow-lists (`instructor-period-allowances`).
 */

import type { InstructorPeriodAllowance } from '../../types/shared';
import { instructorPeriodAllowancesCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';

export async function getAllowanceForInstructorAndPeriod(
    ctx: MongoDalContext,
    puid: string,
    academicPeriodId: string
): Promise<InstructorPeriodAllowance | null> {
    return (await instructorPeriodAllowancesCollection(ctx.db).findOne({
        puid,
        academicPeriodId
    })) as InstructorPeriodAllowance | null;
}

export async function listAllowancesForPeriod(
    ctx: MongoDalContext,
    academicPeriodId: string
): Promise<InstructorPeriodAllowance[]> {
    const docs = await instructorPeriodAllowancesCollection(ctx.db)
        .find({ academicPeriodId })
        .toArray();
    return docs as unknown as InstructorPeriodAllowance[];
}

export async function setInstructorPeriodAllowance(
    ctx: MongoDalContext,
    puid: string,
    academicPeriodId: string,
    allowedCourseNames: string[]
): Promise<InstructorPeriodAllowance> {
    const now = new Date();
    const normalized = [...new Set(allowedCourseNames.map((n) => n.trim()).filter(Boolean))];

    await instructorPeriodAllowancesCollection(ctx.db).updateOne(
        { puid, academicPeriodId },
        {
            $set: {
                puid,
                academicPeriodId,
                allowedCourseNames: normalized,
                updatedAt: now
            }
        },
        { upsert: true }
    );

    return {
        puid,
        academicPeriodId,
        allowedCourseNames: normalized,
        updatedAt: now
    };
}

export async function getAllowedCourseNamesForInstructor(
    ctx: MongoDalContext,
    puid: string,
    academicPeriodId: string
): Promise<string[]> {
    const doc = await getAllowanceForInstructorAndPeriod(ctx, puid, academicPeriodId);
    return doc?.allowedCourseNames ?? [];
}

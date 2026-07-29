/**
 * migrate-course-feature-defaults.ts
 *
 * One-time idempotent backfill: Memory Agent and Guided Pathway were always-on
 * before course-level toggles. Existing courses missing those keys get
 * `enabled: true` so behavior does not regress. New courses still default to
 * disabled (absent key) until Settings or course-setup opts in.
 *
 * Rollback: unset `features.memoryAgent` / `features.guidedPathway` on courses
 * that should not retain the legacy-on state (manual).
 *
 * @author: EngE-AI Team
 * @date: 2026-07-29
 * @version: 1.0.0
 * @description: Backfill memoryAgent + guidedPathway enabled on existing courses.
 */

import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { activeCourse } from '../types/shared';
import { appLogger } from '../utils/logger';

/**
 * migrateCourseFeatureDefaults - enable memoryAgent + guidedPathway where absent.
 *
 * Only writes when a capability key is missing; never overrides an explicit
 * `enabled: false` set by staff after the feature shipped.
 *
 * @returns void
 */
export async function migrateCourseFeatureDefaults(): Promise<void> {
    const instance = await EngEAI_MongoDB.getInstance();
    const courses = (await instance.getAllActiveCourses()) as unknown as activeCourse[];
    let patched = 0;

    for (const course of courses) {
        if (!course?.id) continue;

        const features = { ...course.features };
        let changed = false;

        // Legacy always-on: only fill missing keys, never flip an explicit off.
        if (features.memoryAgent === undefined) {
            features.memoryAgent = { enabled: true, enabledAt: new Date(), enabledBy: 'platform-migration' };
            changed = true;
        }
        if (features.guidedPathway === undefined) {
            features.guidedPathway = { enabled: true, enabledAt: new Date(), enabledBy: 'platform-migration' };
            changed = true;
        }

        if (!changed) continue;

        await instance.updateActiveCourse(course.id, { features });
        patched += 1;
    }

    appLogger.log(
        `[MIGRATE-COURSE-FEATURES] Processed ${courses.length} course(s), backfilled memoryAgent/guidedPathway on ${patched}`
    );
}

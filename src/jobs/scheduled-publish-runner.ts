import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { activeCourse, TopicOrWeekInstance } from '../types/shared';
import { appLogger } from '../utils/logger';

const GLOBAL_THROTTLE_MS = 45_000;

let lastGlobalSweepAt = 0;

// Global sweep in progress flag : used to prevent concurrent sweeps
let sweepInProgress = false;

/** @internal Reset throttle state (unit tests only). */
export function resetScheduledPublishThrottleForTests(): void {
    lastGlobalSweepAt = 0;
    sweepInProgress = false;
}

/**
 * Publishes all due topic/week instances using scheduled-task documents and active-course updates.
 * Deletes a scheduled-task row only after a successful course save.
 */
export async function runDueScheduledPublishTasks(mongo?: EngEAI_MongoDB): Promise<void> {
    const m = mongo ?? (await EngEAI_MongoDB.getInstance());
    const courses = await m.getAllActiveCourses();
    const now = new Date();

    for (const course of courses) {
        const c = course as unknown as activeCourse;
        const courseId = c.id;
        const courseName = c.courseName;
        if (!courseName) {
            continue;
        }

        let dueTasks: Awaited<ReturnType<EngEAI_MongoDB['findDueScheduledTasksForCourse']>>;
        try {
            dueTasks = await m.findDueScheduledTasksForCourse(courseName, now);
        } catch (err) {
            appLogger.warn(`[scheduled-publish] Could not read scheduled tasks for ${courseName}:`, err);
            continue;
        }

        for (const task of dueTasks) {
            const topicOrWeekId = task.content?.topicOrWeekId;
            if (!topicOrWeekId) {
                await m.deleteScheduledTaskById(courseName, task.id);
                continue;
            }

            const fresh = await m.getActiveCourse(courseId);
            if (!fresh) {
                appLogger.warn(`[scheduled-publish] Course ${courseId} missing; removing orphan scheduled task ${task.id}`);
                await m.deleteScheduledTaskById(courseName, task.id);
                continue;
            }

            const tw = fresh.topicOrWeekInstances?.find((t: TopicOrWeekInstance) => t.id === topicOrWeekId);
            if (!tw) {
                appLogger.log(`[scheduled-publish] Topic/week ${topicOrWeekId} missing; removing orphan scheduled task ${task.id}`);
                await m.deleteScheduledTaskById(courseName, task.id);
                continue;
            }

            if (tw.published) {
                await m.deleteScheduledTaskById(courseName, task.id);
                continue;
            }

            tw.published = true;
            tw.scheduledPublishAt = null;
            tw.updatedAt = new Date();

            try {
                const updated = await m.updateActiveCourse(courseId, {
                    topicOrWeekInstances: fresh.topicOrWeekInstances
                });
                if (!updated) {
                    appLogger.warn(`[scheduled-publish] updateActiveCourse returned null for ${courseId}; keeping scheduled task ${task.id}`);
                    continue;
                }
            } catch (err) {
                appLogger.error(`[scheduled-publish] Failed to publish topic/week ${topicOrWeekId} for ${courseId}:`, err);
                continue;
            }

            try {
                await m.deleteScheduledTaskById(courseName, task.id);
                appLogger.log(`[scheduled-publish] Published "${tw.title}" (id=${topicOrWeekId}) for course ${courseId}`);
            } catch (delErr) {
                appLogger.error(`[scheduled-publish] Published course but failed to delete scheduled task ${task.id}:`, delErr);
            }
        }
    }
}

/**
 * Runs the due publish sweep at most once per GLOBAL_THROTTLE_MS and never concurrently.
 * Throttles the scheduled publish tasks to prevent excessive database writes.
 *
 * @param mongo - Optional EngEAI_MongoDB instance (for testing).
 */
export async function runDueScheduledPublishTasksThrottled(mongo?: EngEAI_MongoDB): Promise<void> {
    const now = Date.now();

    // (avoids overlapping scans of all courses and duplicate publish attempts).
    if (sweepInProgress) {
        return;
    }

    // check if the last global sweep is within the throttle window
    if (now - lastGlobalSweepAt < GLOBAL_THROTTLE_MS) {
        return;
    }

    // set the last global sweep time and mark the sweep as in progress
    lastGlobalSweepAt = now;
    sweepInProgress = true;

    // run the due publish sweep
    try {
        await runDueScheduledPublishTasks(mongo);
    } finally {
        // release the lock so a later request can run the next sweep after the throttle gap.
        sweepInProgress = false;
    }
}

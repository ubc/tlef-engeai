import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { activeCourse, TopicOrWeekInstance } from '../types/shared';
import { appLogger } from '../utils/logger';

/**
 * Scans all active courses and publishes topic/week instances whose scheduledPublishAt is due.
 */
export async function runScheduledPublishSweep(): Promise<void> {
    const mongo = await EngEAI_MongoDB.getInstance();
    const courses = await mongo.getAllActiveCourses();
    const now = new Date();

    for (const course of courses) {
        const c = course as unknown as activeCourse;
        const courseId = c.id;
        const instances = c.topicOrWeekInstances;
        if (!instances?.length) {
            continue;
        }

        let changed = false;
        for (const tw of instances) {
            if (tw.published) {
                continue;
            }
            const raw = tw.scheduledPublishAt;
            if (raw == null) {
                continue;
            }
            const when = raw instanceof Date ? raw : new Date(raw as string);
            if (Number.isNaN(when.getTime())) {
                continue;
            }
            if (when <= now) {
                tw.published = true;
                tw.scheduledPublishAt = null;
                tw.updatedAt = new Date();
                changed = true;
                appLogger.log(`[scheduled-publish] Published topic/week "${tw.title}" (id=${tw.id}) for course ${courseId}`);
            }
        }

        if (changed) {
            await mongo.updateActiveCourse(courseId, { topicOrWeekInstances: instances });
        }
    }
}

export function startScheduledPublishSweepInterval(intervalMs: number = 60_000): ReturnType<typeof setInterval> {
    return setInterval(() => {
        runScheduledPublishSweep().catch((err) => {
            appLogger.error('[scheduled-publish] Sweep failed:', err);
        });
    }, intervalMs);
}

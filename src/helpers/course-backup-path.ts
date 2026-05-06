/**
 * course-backup-path.ts
 * @description ZIP root and per-file entry names for instructor course Mongo backups.
 */

import { sanitizeZipPathSegment } from './conversation-export-path';

/**
 * Basename without `.zip` for the outer archive: `{CourseName} - Backup`.
 */
export function buildCourseMongoBackupArchiveBasename(courseDisplayName: string): string {
    return `${sanitizeZipPathSegment(courseDisplayName)} - Backup`;
}

/**
 * Filesystem-safe slug from logical `course.courseName`; used inside JSON filenames.
 */
export function courseMongoBackupFilenameSlug(courseName: string): string {
    return sanitizeZipPathSegment(courseName);
}

/**
 * Five backup JSON filenames (flat under the archive root folder).
 */
export function buildCourseMongoBackupJsonFilenames(courseNameSlug: string): {
    activeCourseList: string;
    flags: string;
    scheduledTasks: string;
    users: string;
    memoryAgent: string;
} {
    return {
        activeCourseList: `active-courselist_${courseNameSlug}.json`,
        flags: `${courseNameSlug}_flag.json`,
        scheduledTasks: `${courseNameSlug}_scheduled_tasks.json`,
        users: `${courseNameSlug}_users.json`,
        memoryAgent: `${courseNameSlug}_memory_agent.json`
    };
}

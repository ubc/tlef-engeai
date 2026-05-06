import {
    buildCourseMongoBackupArchiveBasename,
    buildCourseMongoBackupJsonFilenames,
    courseMongoBackupFilenameSlug
} from '../course-backup-path';
import { sanitizeZipPathSegment } from '../conversation-export-path';

describe('course-backup-path', () => {
    it('buildCourseMongoBackupArchiveBasename sanitizes display name', () => {
        expect(buildCourseMongoBackupArchiveBasename('ENGR 100')).toBe(
            `${sanitizeZipPathSegment('ENGR 100')} - Backup`
        );
    });

    it('buildCourseMongoBackupJsonFilenames matches spec pattern', () => {
        const slug = courseMongoBackupFilenameSlug('My Course');
        const names = buildCourseMongoBackupJsonFilenames(slug);
        expect(names.activeCourseList).toBe(`active-courselist_${slug}.json`);
        expect(names.flags).toBe(`${slug}_flag.json`);
        expect(names.scheduledTasks).toBe(`${slug}_scheduled_tasks.json`);
        expect(names.users).toBe(`${slug}_users.json`);
        expect(names.memoryAgent).toBe(`${slug}_memory_agent.json`);
    });
});

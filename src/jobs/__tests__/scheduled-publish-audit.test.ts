import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    formatAuditLine,
    formatVancouverIsoTimestamp,
    ScheduledPublishAudit,
    setScheduledPublishAuditLogPathForTests
} from '../scheduled-publish-audit';

describe('formatVancouverIsoTimestamp', () => {
    it('returns ISO-like string with offset for Vancouver', () => {
        const s = formatVancouverIsoTimestamp(new Date('2026-07-15T12:00:00.000Z'));
        expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
        expect(s).toContain('-07:00');
    });

    it('uses -08:00 in Pacific standard time', () => {
        const s = formatVancouverIsoTimestamp(new Date('2026-01-15T12:00:00.000Z'));
        expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
        expect(s).toContain('-08:00');
    });
});

describe('formatAuditLine', () => {
    it('includes tag, kind, and key=value pairs', () => {
        const line = formatAuditLine('PUBLISHED', {
            courseId: 'c1',
            courseName: 'MyCourse',
            topicOrWeekId: 'tw-1',
            taskId: 'task-1',
            title: 'Week 3 intro'
        });
        expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(line).toContain('[scheduled-publish-audit]');
        expect(line).toContain('PUBLISHED');
        expect(line).toContain('courseId=c1');
        expect(line).toContain('title="Week 3 intro"');
    });

    it('formats TASK_SCHEDULE_REMOVED with reason', () => {
        const line = formatAuditLine('TASK_SCHEDULE_REMOVED', {
            courseId: 'c1',
            courseName: 'MyCourse',
            topicOrWeekId: 'tw-1',
            reason: 'user_cleared'
        });
        expect(line).toContain('TASK_SCHEDULE_REMOVED');
        expect(line).toContain('reason=user_cleared');
    });
});

describe('ScheduledPublishAudit append', () => {
    let tmpFile: string;

    beforeEach(async () => {
        tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'audit-test-')), 'audit.log');
        setScheduledPublishAuditLogPathForTests(tmpFile);
    });

    afterEach(() => {
        setScheduledPublishAuditLogPathForTests(null);
    });

    it('appends one line per event', async () => {
        const audit = ScheduledPublishAudit.getInstance();
        await audit.line('TASK_SCHEDULED', {
            courseId: 'x',
            courseName: 'Y',
            topicOrWeekId: 'z',
            scheduledPublishAt: '2026-04-14T08:00:00.000-07:00'
        });
        const content = await fs.readFile(tmpFile, 'utf8');
        const lines = content.trim().split('\n');
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('TASK_SCHEDULED');
        expect(lines[0]).toContain('courseId=x');
    });
});

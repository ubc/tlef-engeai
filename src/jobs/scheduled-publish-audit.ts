/**
 * @fileoverview Scheduled publish audit log — append-only plain text (`.log`), not NDJSON.
 *
 * **Path:** `{cwd}/logs/scheduled-publish-audit/audit.log` (fixed in this module; not env-driven).
 *
 * **Line format:** `<ISO_TIMESTAMP> [scheduled-publish-audit] <KIND> key=value ...`
 * - Timestamp: ISO-8601 with offset for **America/Vancouver** (DST-aware).
 * - Values with spaces are double-quoted; one event per line.
 *
 * **Behavior:** Creates parent directories on write; never truncates or rotates from app code (external rotation OK).
 * Write failures are logged via `appLogger.error` and do not throw to callers.
 *
 * Independent of `appLogger` PRODUCTION no-op — audit still writes when the process can access the filesystem.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { appLogger } from '../utils/logger';

const AUDIT_TAG = '[scheduled-publish-audit]';
const VANCOUVER_TZ = 'America/Vancouver';

const DEFAULT_AUDIT_LOG_PATH = path.join(
    process.cwd(),
    'logs',
    'scheduled-publish-audit',
    'audit.log'
);

/**
 * Discriminator for each audit line (`<KIND>`). Uppercase snake_case; matches {@link ScheduledPublishAudit} helpers.
 */
export type ScheduledPublishAuditKind =
    | 'TASK_SCHEDULED'
    | 'TASK_SCHEDULE_REMOVED'
    | 'PUBLISHED'
    | 'PUBLISH_FAILED'
    | 'PUBLISH_OK_DELETE_FAILED'
    | 'SKIPPED_UPDATE_NOOP'
    | 'TASK_REMOVED_NO_TOPIC_ID'
    | 'TASK_REMOVED_ORPHAN_COURSE'
    | 'TASK_REMOVED_ORPHAN_TOPIC'
    | 'TASK_REMOVED_ALREADY_PUBLISHED'
    | 'COURSE_TASKS_READ_FAILED';

/** Why the scheduled-task row was removed from Mongo (see {@link ScheduledPublishAudit.taskScheduleRemoved}). */
export type TaskScheduleRemovedReason = 'user_cleared' | 'manual_publish' | 'topic_deleted';

let auditLogPathOverride: string | null = null;

/**
 * Redirects the audit log file path (unit tests only).
 *
 * @param p - Absolute path to a file to use instead of the default `logs/scheduled-publish-audit/audit.log`, or `null` to restore it.
 * @internal
 */
export function setScheduledPublishAuditLogPathForTests(p: string | null): void {
    auditLogPathOverride = p;
}

function getAuditLogPath(): string {
    return auditLogPathOverride ?? DEFAULT_AUDIT_LOG_PATH;
}

/**
 * Formats an instant as ISO-8601 **civil time in America/Vancouver** with numeric offset (e.g. `-07:00` / `-08:00`).
 *
 * @param date - Instant to format.
 * @returns String suitable for the leading timestamp on each audit line.
 */
export function formatVancouverIsoTimestamp(date: Date): string {
    const frac = String(date.getMilliseconds()).padStart(3, '0');
    const main = new Intl.DateTimeFormat('en-CA', {
        timeZone: VANCOUVER_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = main.formatToParts(date);
    const pick = (t: Intl.DateTimeFormatPart['type']) =>
        parts.find((p) => p.type === t)?.value ?? '';

    const year = pick('year');
    const month = pick('month');
    const day = pick('day');
    const hour = pick('hour');
    const minute = pick('minute');
    const second = pick('second');

    const offParts = new Intl.DateTimeFormat('en-US', {
        timeZone: VANCOUVER_TZ,
        timeZoneName: 'longOffset'
    }).formatToParts(date);
    const rawTz = offParts.find((p) => p.type === 'timeZoneName')?.value ?? 'Z';
    const offset = rawTz.replace(/^GMT/i, '').trim() || 'Z';

    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${frac}${offset}`;
}

function escapeFieldValue(v: string): string {
    const needsQuote = /[\s"]/.test(v);
    if (!needsQuote) {
        return v;
    }
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

function formatField(key: string, value: string | number | boolean | undefined | null): string | null {
    if (value === undefined || value === null) {
        return null;
    }
    const str = typeof value === 'string' ? escapeFieldValue(value) : String(value);
    return `${key}=${str}`;
}

/**
 * Builds one audit line (no trailing newline). Uses **current time** for the leading timestamp.
 *
 * @param kind - Event kind.
 * @param fields - Structured fields; `undefined` / `null` omitted; string values with spaces or quotes are quoted.
 */
export function formatAuditLine(
    kind: ScheduledPublishAuditKind,
    fields: Record<string, string | number | boolean | undefined | null>
): string {
    const ts = formatVancouverIsoTimestamp(new Date());
    const pairs = Object.entries(fields)
        .map(([k, v]) => formatField(k, v))
        .filter((x): x is string => x !== null);
    return `${ts} ${AUDIT_TAG} ${kind} ${pairs.join(' ')}`;
}

function serializeError(err: unknown): { errorName: string; errorMessage: string } {
    if (err instanceof Error) {
        return { errorName: err.name, errorMessage: err.message };
    }
    return { errorName: 'Error', errorMessage: String(err) };
}

/**
 * Singleton that appends scheduled-publish audit lines to `audit.log`.
 *
 * Prefer the typed `taskScheduled`, `published`, etc. methods over {@link line} when possible.
 */
export class ScheduledPublishAudit {
    private static instance: ScheduledPublishAudit | null = null;

    /**
     * Returns the process-wide singleton used as {@link scheduledPublishAudit}.
     */
    static getInstance(): ScheduledPublishAudit {
        if (ScheduledPublishAudit.instance === null) {
            ScheduledPublishAudit.instance = new ScheduledPublishAudit();
        }
        return ScheduledPublishAudit.instance;
    }

    /**
     * Appends a **pre-formatted** line to the audit file, plus a newline.
     * Ensures the parent directory exists. Swallows filesystem errors after logging.
     *
     * @param line - Full text line (no `\n`); typically from {@link formatAuditLine}.
     */
    async appendLine(line: string): Promise<void> {
        const filePath = getAuditLogPath();
        try {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.appendFile(filePath, `${line}\n`, { encoding: 'utf8' });
        } catch (e) {
            appLogger.error('[scheduled-publish-audit] Failed to append audit.log:', e);
        }
    }

    /**
     * Formats and appends one line using the standard template and **now** as event time.
     *
     * @param kind - Audit event kind.
     * @param fields - Key/value pairs for the tail of the line.
     */
    async line(
        kind: ScheduledPublishAuditKind,
        fields: Record<string, string | number | boolean | undefined | null>
    ): Promise<void> {
        await this.appendLine(formatAuditLine(kind, fields));
    }

    /**
     * API route scheduled a draft topic/week for future publish (`TASK_SCHEDULED`).
     * `scheduledPublishAt` in the line is formatted in Vancouver time like the leading timestamp.
     */
    async taskScheduled(fields: {
        courseId: string;
        courseName: string;
        topicOrWeekId: string;
        scheduledPublishAt: Date;
        title?: string;
    }): Promise<void> {
        const scheduledPublishAt = formatVancouverIsoTimestamp(fields.scheduledPublishAt);
        await this.line('TASK_SCHEDULED', {
            courseId: fields.courseId,
            courseName: fields.courseName,
            topicOrWeekId: fields.topicOrWeekId,
            scheduledPublishAt,
            ...(fields.title !== undefined ? { title: fields.title } : {})
        });
    }

    /**
     * Scheduled-task row was deleted for this topic/week (`TASK_SCHEDULE_REMOVED`): user cleared the
     * publish time, published manually, or deleted the topic/week instance. Distinct from runner-driven
     * automatic publish (`PUBLISHED`) and orphan cleanups.
     *
     * @param fields.reason - `user_cleared` — PATCH schedule to null; `manual_publish` — marked published;
     *   `topic_deleted` — topic/week instance removed.
     */
    async taskScheduleRemoved(fields: {
        courseId: string;
        courseName: string;
        topicOrWeekId: string;
        reason: TaskScheduleRemovedReason;
        title?: string;
    }): Promise<void> {
        await this.line('TASK_SCHEDULE_REMOVED', {
            courseId: fields.courseId,
            courseName: fields.courseName,
            topicOrWeekId: fields.topicOrWeekId,
            reason: fields.reason,
            ...(fields.title !== undefined ? { title: fields.title } : {})
        });
    }

    /**
     * Runner successfully updated the course and removed the scheduled-task row (`PUBLISHED`).
     */
    async published(fields: {
        courseId: string;
        courseName: string;
        topicOrWeekId: string;
        taskId: string;
        title?: string;
    }): Promise<void> {
        await this.line('PUBLISHED', {
            courseId: fields.courseId,
            courseName: fields.courseName,
            topicOrWeekId: fields.topicOrWeekId,
            taskId: fields.taskId,
            ...(fields.title !== undefined ? { title: fields.title } : {})
        });
    }

    /**
     * Runner failed while saving the published topic/week; task row left in DB (`PUBLISH_FAILED`).
     */
    async publishFailed(fields: {
        courseId: string;
        courseName: string;
        topicOrWeekId: string;
        taskId: string;
        error: unknown;
    }): Promise<void> {
        const { errorName, errorMessage } = serializeError(fields.error);
        await this.line('PUBLISH_FAILED', {
            courseId: fields.courseId,
            courseName: fields.courseName,
            topicOrWeekId: fields.topicOrWeekId,
            taskId: fields.taskId,
            errorName,
            errorMessage
        });
    }

    /**
     * Course saved as published but deleting the scheduled-task document failed (`PUBLISH_OK_DELETE_FAILED`).
     */
    async publishOkDeleteFailed(fields: {
        courseId: string;
        courseName: string;
        topicOrWeekId: string;
        taskId: string;
        error: unknown;
    }): Promise<void> {
        const { errorName, errorMessage } = serializeError(fields.error);
        await this.line('PUBLISH_OK_DELETE_FAILED', {
            courseId: fields.courseId,
            courseName: fields.courseName,
            topicOrWeekId: fields.topicOrWeekId,
            taskId: fields.taskId,
            errorName,
            errorMessage
        });
    }

    /**
     * `updateActiveCourse` returned no document; scheduled task kept (`SKIPPED_UPDATE_NOOP`).
     */
    async skippedUpdateNoop(fields: {
        courseId: string;
        courseName: string;
        topicOrWeekId: string;
        taskId: string;
    }): Promise<void> {
        await this.line('SKIPPED_UPDATE_NOOP', fields);
    }

    /**
     * Task document had no `topicOrWeekId`; row deleted (`TASK_REMOVED_NO_TOPIC_ID`).
     */
    async taskRemovedNoTopicId(fields: { courseName: string; taskId: string }): Promise<void> {
        await this.line('TASK_REMOVED_NO_TOPIC_ID', fields);
    }

    /**
     * Active course document missing; orphan task removed (`TASK_REMOVED_ORPHAN_COURSE`).
     */
    async taskRemovedOrphanCourse(fields: { courseId: string; courseName: string; taskId: string }): Promise<void> {
        await this.line('TASK_REMOVED_ORPHAN_COURSE', fields);
    }

    /**
     * Topic/week instance missing on the course; orphan task removed (`TASK_REMOVED_ORPHAN_TOPIC`).
     */
    async taskRemovedOrphanTopic(fields: {
        courseId: string;
        courseName: string;
        topicOrWeekId: string;
        taskId: string;
    }): Promise<void> {
        await this.line('TASK_REMOVED_ORPHAN_TOPIC', fields);
    }

    /**
     * Content was already published; redundant task row deleted (`TASK_REMOVED_ALREADY_PUBLISHED`).
     */
    async taskRemovedAlreadyPublished(fields: {
        courseId: string;
        courseName: string;
        topicOrWeekId: string;
        taskId: string;
    }): Promise<void> {
        await this.line('TASK_REMOVED_ALREADY_PUBLISHED', fields);
    }

    /**
     * Failed to query due tasks for a course during the sweep (`COURSE_TASKS_READ_FAILED`).
     */
    async courseTasksReadFailed(fields: { courseName: string; error: unknown }): Promise<void> {
        const { errorName, errorMessage } = serializeError(fields.error);
        await this.line('COURSE_TASKS_READ_FAILED', {
            courseName: fields.courseName,
            errorName,
            errorMessage
        });
    }
}

/**
 * Shared {@link ScheduledPublishAudit} instance for the app and routes.
 */
export const scheduledPublishAudit = ScheduledPublishAudit.getInstance();

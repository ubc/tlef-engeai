/**
 * Scenario usage CSV — formats the per-student usage report for instructors to download
 *
 * One row per student. Columns are deliberately few so a prof can read the sheet at a glance;
 * detail lives in the Monitor scenarios panel. Times use the course's practice-day timezone.
 *
 * @author: Kathleen Tom
 * @date: 2026-11-20
 * @version: 1.0.0
 * @description: CSV serialization for the Practice Scenarios usage export.
 */

import type { ScenarioUsageReport } from '../db/mongo/scenario-usage-mongo';
import { PRACTICE_DAY_TIMEZONE } from './scenario-practice-limits';

/**
 * Quote a CSV cell when needed, and neutralize spreadsheet formulas: a cell starting with
 * `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` so Excel/Sheets show it as text.
 */
export function csvCell(value: string | number): string {
    let text = String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** `YYYY-MM-DD HH:mm` in the practice-day timezone — sorts correctly as text in a spreadsheet. */
export function formatCsvDateTime(date: Date | null, timeZone: string = PRACTICE_DAY_TIMEZONE): string {
    if (!date) return '';
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(date)
            .map((p) => [p.type, p.value])
    );
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * buildScenarioUsageCsv — the downloadable sheet.
 *
 * Starts with a UTF-8 byte-order mark so Excel opens accented names correctly.
 *
 * @param report - Per-student totals from `getScenarioUsageReport`
 * @returns CSV text with a header row and one row per student
 */
export function buildScenarioUsageCsv(report: ScenarioUsageReport): string {
    const header = [
        'Student name',
        `Questions attempted (of ${report.publishedQuestionCount} published)`,
        'Questions completed',
        'Practice answers submitted',
        'Exams submitted',
        'Days active',
        `Last activity (${PRACTICE_DAY_TIMEZONE})`,
        'Flagged answers',
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const row of report.rows) {
        lines.push(
            [
                row.studentName,
                row.questionsAttempted,
                row.questionsCompleted,
                row.practiceAnswers,
                row.examsSubmitted,
                row.daysActive,
                formatCsvDateTime(row.lastActivityAt),
                row.flaggedAnswers,
            ]
                .map(csvCell)
                .join(',')
        );
    }
    return `﻿${lines.join('\r\n')}\r\n`;
}

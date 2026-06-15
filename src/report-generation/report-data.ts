/**
 * report-data.ts
 * @author: @gatahcha
 * @date: 2026-06-15
 * @description: Appendix row shaping and PDF legend/chapter formatting via ReportDataService.
 */

import type { CourseSummaryStackedBar, MonitorStruggleUserRow, StruggleStatsLegendItem } from '../types/shared';
import type { IReportDataService, StudentAppendixChapterGroup, StudentAppendixPdfRow } from './report-contracts';

/**
 * Application service for shaping struggle stats into PDF-ready rows and formatted strings.
 *
 * Key methods: {@link buildStudentAppendixPdfRows}, {@link filterPdfLegendItems},
 * {@link formatPdfStruggleLine}, {@link buildLabelChapterNumberMap}.
 */
export class ReportDataService implements IReportDataService {
    private static instance: ReportDataService | null = null;

    private constructor() {}

    /**
     * Returns the shared data-shaping service (stateless; singleton for API consistency).
     *
     * @returns ReportDataService singleton instance
     */
    public static getInstance(): ReportDataService {
        if (!ReportDataService.instance) {
            ReportDataService.instance = new ReportDataService();
        }
        return ReportDataService.instance;
    }

    /**
     * Maps topic/week id to 1-based chapter number from stacked-bar categories.
     *
     * @param stackedBar - Course-wide struggle distribution payload
     * @returns Map of category id → chapter number (order + 1)
     */
    buildChapterNumberByTopicOrWeekId(stackedBar: CourseSummaryStackedBar): Map<string, number> {
        return new Map(stackedBar.categories.map((category) => [category.id, category.order + 1]));
    }

    /**
     * Maps struggle label to its 1-based chapter number (first chapter column with data).
     *
     * @param stackedBar - Course-wide struggle distribution payload
     * @returns Map of topic label → chapter number
     */
    buildLabelChapterNumberMap(stackedBar: CourseSummaryStackedBar): Map<string, number> {
        const chapterNumById = this.buildChapterNumberByTopicOrWeekId(stackedBar);
        const result = new Map<string, number>();

        for (const series of stackedBar.series) {
            for (const value of series.values) {
                if (value.studentCount <= 0) {
                    continue;
                }
                const chapterNum = chapterNumById.get(value.categoryId);
                if (chapterNum !== undefined) {
                    result.set(series.topic, chapterNum);
                    break;
                }
            }
        }

        return result;
    }

    /**
     * Omits catalog legend rows with zero course-wide student count.
     *
     * @param legend - Full struggle-topic legend from stats aggregation
     * @returns Legend items with studentCount &gt; 0 only
     */
    filterPdfLegendItems(legend: StruggleStatsLegendItem[]): StruggleStatsLegendItem[] {
        return legend.filter((item) => item.studentCount > 0);
    }

    /**
     * Formats a legend row as `chapter N : topic – count`.
     *
     * @param topic - Struggle topic label
     * @param studentCount - Course-wide unique student count
     * @param chapterNum - 1-based chapter number, if known
     * @returns Single-line legend text for the distribution page
     */
    formatPdfStruggleLine(
        topic: string,
        studentCount: number,
        chapterNum: number | undefined
    ): string {
        if (chapterNum !== undefined) {
            return `chapter ${chapterNum} : ${topic} – ${studentCount}`;
        }
        return `${topic} – ${studentCount}`;
    }

    /**
     * Formats comma-separated topic labels for a chapter group.
     *
     * @param topics - Struggle topic labels in one chapter bin
     * @returns Comma-separated string
     */
    formatChapterTopicsList(topics: string[]): string {
        return topics.join(', ');
    }

    /**
     * Formats a per-student appendix line as `chapter N : topic` (no course-wide count).
     *
     * @param topic - Struggle topic label
     * @param chapterNum - 1-based chapter number, if known
     * @returns Single-line appendix topic text
     */
    formatPdfStudentStruggleLine(topic: string, chapterNum: number | undefined): string {
        if (chapterNum !== undefined) {
            return `chapter ${chapterNum} : ${topic}`;
        }
        return topic;
    }

    /**
     * All enrolled students sorted by name (includes students with no struggle topics).
     *
     * @param users - Monitor struggle user rows from stats aggregation
     * @returns Student rows only, case-insensitive name order
     */
    selectAllStudentsForAppendix(users: MonitorStruggleUserRow[]): MonitorStruggleUserRow[] {
        return users
            .filter((user) => user.role === 'student')
            .sort((a, b) => a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' }));
    }

    /**
     * Maps enrolled students to appendix table rows using per-user memory-agent topics only.
     * Does not read course-wide legend or student counts.
     *
     * @param users - Monitor struggle user rows from stats aggregation
     * @param stackedBar - Stacked bar categories for chapter numbering
     * @returns One row per enrolled student for the PDF appendix table
     */
    buildStudentAppendixPdfRows(
        users: MonitorStruggleUserRow[],
        stackedBar: CourseSummaryStackedBar
    ): StudentAppendixPdfRow[] {
        const chapterNumById = this.buildChapterNumberByTopicOrWeekId(stackedBar);

        return this.selectAllStudentsForAppendix(users).map((user) => ({
            userName: user.userName,
            chapterGroups: this.buildChapterGroupsForUser(user, chapterNumById)
        }));
    }

    private buildChapterGroupsForUser(
        user: MonitorStruggleUserRow,
        chapterNumById: Map<string, number>
    ): StudentAppendixChapterGroup[] {
        const groups: StudentAppendixChapterGroup[] = [];

        for (const chapter of user.struggleTopicsByChapter) {
            if (!chapter.struggleTopics.length) {
                continue;
            }
            groups.push({
                chapterNum: chapterNumById.get(chapter.topicOrWeekId),
                topics: [...chapter.struggleTopics]
            });
        }

        return groups;
    }
}

// --- Backward-compatible wrappers ---

/** @see ReportDataService.buildChapterNumberByTopicOrWeekId */
export function buildChapterNumberByTopicOrWeekId(
    stackedBar: CourseSummaryStackedBar
): Map<string, number> {
    return ReportDataService.getInstance().buildChapterNumberByTopicOrWeekId(stackedBar);
}

/** @see ReportDataService.buildLabelChapterNumberMap */
export function buildLabelChapterNumberMap(stackedBar: CourseSummaryStackedBar): Map<string, number> {
    return ReportDataService.getInstance().buildLabelChapterNumberMap(stackedBar);
}

/** @see ReportDataService.filterPdfLegendItems */
export function filterPdfLegendItems(legend: StruggleStatsLegendItem[]): StruggleStatsLegendItem[] {
    return ReportDataService.getInstance().filterPdfLegendItems(legend);
}

/** @see ReportDataService.formatPdfStruggleLine */
export function formatPdfStruggleLine(
    topic: string,
    studentCount: number,
    chapterNum: number | undefined
): string {
    return ReportDataService.getInstance().formatPdfStruggleLine(topic, studentCount, chapterNum);
}

/** @see ReportDataService.formatChapterTopicsList */
export function formatChapterTopicsList(topics: string[]): string {
    return ReportDataService.getInstance().formatChapterTopicsList(topics);
}

/** @see ReportDataService.formatPdfStudentStruggleLine */
export function formatPdfStudentStruggleLine(
    topic: string,
    chapterNum: number | undefined
): string {
    return ReportDataService.getInstance().formatPdfStudentStruggleLine(topic, chapterNum);
}

/** @see ReportDataService.selectAllStudentsForAppendix */
export function selectAllStudentsForAppendix(users: MonitorStruggleUserRow[]): MonitorStruggleUserRow[] {
    return ReportDataService.getInstance().selectAllStudentsForAppendix(users);
}

/**
 * Delegates to {@link ReportDataService.buildStudentAppendixPdfRows}.
 *
 * @param users - Monitor struggle user rows from stats aggregation
 * @param stackedBar - Stacked bar categories for chapter numbering
 * @returns Appendix table rows for full-phase PDF rendering
 */
export function buildStudentAppendixPdfRows(
    users: MonitorStruggleUserRow[],
    stackedBar: CourseSummaryStackedBar
): StudentAppendixPdfRow[] {
    return ReportDataService.getInstance().buildStudentAppendixPdfRows(users, stackedBar);
}

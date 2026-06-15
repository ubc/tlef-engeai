/**
 * pdf-legend-format.ts
 * @description PDF-only legend filtering and chapter-prefixed label formatting.
 */

import type { CourseSummaryStackedBar, StruggleStatsLegendItem } from '../types/shared';

/** Maps topic/week id to 1-based chapter number from stacked-bar categories. */
export function buildChapterNumberByTopicOrWeekId(
    stackedBar: CourseSummaryStackedBar
): Map<string, number> {
    return new Map(stackedBar.categories.map((category) => [category.id, category.order + 1]));
}

/** Maps struggle label to its 1-based chapter number (first chapter column with data). */
export function buildLabelChapterNumberMap(
    stackedBar: CourseSummaryStackedBar
): Map<string, number> {
    const chapterNumById = buildChapterNumberByTopicOrWeekId(stackedBar);
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

/** Omits catalog legend rows with zero course-wide student count. */
export function filterPdfLegendItems(legend: StruggleStatsLegendItem[]): StruggleStatsLegendItem[] {
    return legend.filter((item) => item.studentCount > 0);
}

/** Formats a legend row as `chapter N : topic – count`. */
export function formatPdfStruggleLine(
    topic: string,
    studentCount: number,
    chapterNum: number | undefined
): string {
    if (chapterNum !== undefined) {
        return `chapter ${chapterNum} : ${topic} – ${studentCount}`;
    }
    return `${topic} – ${studentCount}`;
}

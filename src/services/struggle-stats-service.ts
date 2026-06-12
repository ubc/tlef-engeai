/**
 * struggle-stats-service.ts
 * @description Aggregates struggle-topic statistics for monitor, course-summary, and PDF (D2+).
 */

import {
    buildLabelToChapterMap,
    deriveStruggleTopicsByChapter,
    sanitizeStruggleLabels
} from '../helpers/struggle-chapter-normalize';
import type { MonitorRosterUser } from '../db/mongo/monitor-roster-mongo';
import type {
    activeCourse,
    CourseSummaryCategory,
    CourseSummaryStackedBarSeries,
    CourseSummaryStruggleTopics,
    CourseSummaryTopTopic,
    InstructorStruggleTopicForDisplay,
    MemoryAgentEntry,
    MonitorStruggleUserRow,
    StruggleStatsLegendItem,
    StruggleStatsResult
} from '../types/shared';

/** Matches frontend {@link public/scripts/ui/charts.ts} PALETTE_FALLBACK. */
export const STRUGGLE_CHART_PALETTE = [
    '#4D7A2F',
    '#2F5F8F',
    '#C9822B',
    '#8B0000',
    '#6F5AA7',
    '#2F7D7E'
] as const;

export const STRUGGLE_OTHER_LABEL = 'Other';
export const STRUGGLE_OTHER_COLOR = '#9CA3AF';

export interface StruggleStatsBuildInput {
    course: activeCourse;
    catalog: InstructorStruggleTopicForDisplay[];
    memoryAgentEntries: MemoryAgentEntry[];
    rosterUsers: MonitorRosterUser[];
    /** Roster student count for topTopics percentage denominator. */
    rosterStudentCount: number;
}

type ChapterLabelUsers = Map<string, Set<string>>;

function xAxisLabelForFrame(frameType: activeCourse['frameType']): string {
    return frameType === 'byWeek' ? 'Week' : 'Course Topic';
}

function groupCatalogLabelsByChapter(
    catalog: readonly InstructorStruggleTopicForDisplay[]
): Map<string, string[]> {
    const byChapter = new Map<string, string[]>();
    for (const row of catalog) {
        const list = byChapter.get(row.topicOrWeekId) ?? [];
        if (!list.includes(row.struggleTopic)) {
            list.push(row.struggleTopic);
        }
        byChapter.set(row.topicOrWeekId, list);
    }
    return byChapter;
}

function buildChapterLabelCounts(
    entries: readonly MemoryAgentEntry[],
    catalog: readonly InstructorStruggleTopicForDisplay[]
): Map<string, ChapterLabelUsers> {
    const chapterCounts = new Map<string, ChapterLabelUsers>();

    for (const entry of entries) {
        const labels = sanitizeStruggleLabels(entry.struggleTopics ?? []);
        if (labels.length === 0) {
            continue;
        }
        const chapters = deriveStruggleTopicsByChapter(labels, catalog);
        for (const chapter of chapters) {
            let labelMap = chapterCounts.get(chapter.topicOrWeekId);
            if (!labelMap) {
                labelMap = new Map();
                chapterCounts.set(chapter.topicOrWeekId, labelMap);
            }
            for (const label of chapter.struggleTopics) {
                let users = labelMap.get(label);
                if (!users) {
                    users = new Set();
                    labelMap.set(label, users);
                }
                users.add(entry.userId);
            }
        }
    }

    return chapterCounts;
}

function buildCourseWideLabelUsers(
    entries: readonly MemoryAgentEntry[],
    catalog: readonly InstructorStruggleTopicForDisplay[]
): Map<string, Set<string>> {
    const labelToChapter = buildLabelToChapterMap(catalog);
    const labelUsers = new Map<string, Set<string>>();

    for (const entry of entries) {
        const labels = sanitizeStruggleLabels(entry.struggleTopics ?? []);
        for (const label of labels) {
            if (!labelToChapter.has(label)) {
                continue;
            }
            let users = labelUsers.get(label);
            if (!users) {
                users = new Set();
                labelUsers.set(label, users);
            }
            users.add(entry.userId);
        }
    }

    return labelUsers;
}

function chapterHasAnyStudents(
    chapterId: string,
    chapterCounts: Map<string, ChapterLabelUsers>,
    chapterOtherUsers: Map<string, Set<string>>
): boolean {
    const labelMap = chapterCounts.get(chapterId);
    if (labelMap) {
        for (const users of labelMap.values()) {
            if (users.size > 0) {
                return true;
            }
        }
    }
    const other = chapterOtherUsers.get(chapterId);
    return (other?.size ?? 0) > 0;
}

/**
 * Pure aggregation — no Mongo I/O. Used by API routes and unit tests.
 */
export function buildCourseStruggleStats(input: StruggleStatsBuildInput): StruggleStatsResult {
    const { course, catalog, memoryAgentEntries, rosterUsers, rosterStudentCount } = input;
    const memoryByUserId = new Map(memoryAgentEntries.map((e) => [e.userId, e]));
    const chapterCounts = buildChapterLabelCounts(memoryAgentEntries, catalog);
    const courseWideLabelUsers = buildCourseWideLabelUsers(memoryAgentEntries, catalog);
    const chapterCatalogLabels = groupCatalogLabelsByChapter(catalog);
    const labelToChapter = buildLabelToChapterMap(catalog);

    const labelColors = new Map<string, string>();
    const chapterOtherUsers = new Map<string, Set<string>>();
    const overflowLabelsByChapter = new Map<string, string[]>();

    for (const [chapterId, catalogLabels] of chapterCatalogLabels) {
        const labelsWithData = catalogLabels.filter((label) => {
            const users = chapterCounts.get(chapterId)?.get(label);
            return (users?.size ?? 0) > 0;
        });

        const overflow: string[] = [];

        for (let i = 0; i < labelsWithData.length; i++) {
            const label = labelsWithData[i];
            if (i < STRUGGLE_CHART_PALETTE.length) {
                labelColors.set(label, STRUGGLE_CHART_PALETTE[i]);
            } else {
                overflow.push(label);
                let otherSet = chapterOtherUsers.get(chapterId);
                if (!otherSet) {
                    otherSet = new Set();
                    chapterOtherUsers.set(chapterId, otherSet);
                }
                const users = chapterCounts.get(chapterId)?.get(label);
                if (users) {
                    for (const uid of users) {
                        otherSet.add(uid);
                    }
                }
            }
        }

        if (overflow.length > 0) {
            overflowLabelsByChapter.set(chapterId, overflow);
        }
    }

    const instances = course.topicOrWeekInstances ?? [];
    const categories: CourseSummaryCategory[] = [];
    instances.forEach((instance, index) => {
        if (!chapterHasAnyStudents(instance.id, chapterCounts, chapterOtherUsers)) {
            return;
        }
        categories.push({
            id: instance.id,
            label: instance.title || `Chapter ${index + 1}`,
            order: index
        });
    });

    const catalogLabelOrder = catalog.map((row) => row.struggleTopic);
    const uniqueCatalogLabels: string[] = [];
    for (const label of catalogLabelOrder) {
        if (!uniqueCatalogLabels.includes(label)) {
            uniqueCatalogLabels.push(label);
        }
    }

    const seriesLabels = uniqueCatalogLabels.filter((label) => (courseWideLabelUsers.get(label)?.size ?? 0) > 0);
    const hasOther = chapterOtherUsers.size > 0;

    const series: CourseSummaryStackedBarSeries[] = [];

    for (const label of seriesLabels) {
        const chapterRef = labelToChapter.get(label);
        const color = labelColors.get(label) ?? STRUGGLE_CHART_PALETTE[0];
        const overflowInChapter = chapterRef
            ? (overflowLabelsByChapter.get(chapterRef.topicOrWeekId) ?? []).includes(label)
            : false;

        if (overflowInChapter) {
            continue;
        }

        series.push({
            topic: label,
            color,
            values: categories.map((category) => {
                const count =
                    chapterRef?.topicOrWeekId === category.id
                        ? (chapterCounts.get(category.id)?.get(label)?.size ?? 0)
                        : 0;
                return {
                    categoryId: category.id,
                    studentCount: count,
                    tooltip: `${label}: ${count} student${count === 1 ? '' : 's'}`
                };
            })
        });
    }

    if (hasOther) {
        series.push({
            topic: STRUGGLE_OTHER_LABEL,
            color: STRUGGLE_OTHER_COLOR,
            values: categories.map((category) => {
                const count = chapterOtherUsers.get(category.id)?.size ?? 0;
                return {
                    categoryId: category.id,
                    studentCount: count,
                    tooltip: `${STRUGGLE_OTHER_LABEL}: ${count} student${count === 1 ? '' : 's'}`
                };
            })
        });
    }

    const legend: StruggleStatsLegendItem[] = uniqueCatalogLabels.map((label) => ({
        topic: label,
        color: labelColors.get(label) ?? STRUGGLE_CHART_PALETTE[0],
        studentCount: courseWideLabelUsers.get(label)?.size ?? 0
    }));

    if (hasOther) {
        const otherUserIds = new Set<string>();
        for (const users of chapterOtherUsers.values()) {
            for (const uid of users) {
                otherUserIds.add(uid);
            }
        }
        legend.push({
            topic: STRUGGLE_OTHER_LABEL,
            color: STRUGGLE_OTHER_COLOR,
            studentCount: otherUserIds.size
        });
    }

    const topTopics: CourseSummaryTopTopic[] = [...courseWideLabelUsers.entries()]
        .map(([topic, users]) => ({
            topic,
            studentCount: users.size,
            percentageOfStudents:
                rosterStudentCount > 0
                    ? Math.round((users.size / rosterStudentCount) * 1000) / 10
                    : 0
        }))
        .sort((a, b) => b.studentCount - a.studentCount);

    const struggleTopics: CourseSummaryStruggleTopics = {
        source: 'memory-agent-per-user',
        groupedBy: 'course-topic-or-week',
        topTopics,
        stackedBar: {
            xAxisLabel: xAxisLabelForFrame(course.frameType),
            yAxisLabel: 'Students',
            categories,
            series
        },
        legend
    };

    const users: MonitorStruggleUserRow[] = rosterUsers.map((roster) => {
        const memory = memoryByUserId.get(roster.userId);
        const flatLabels = memory ? sanitizeStruggleLabels(memory.struggleTopics ?? []) : [];
        const struggleTopicsByChapter =
            flatLabels.length > 0 ? deriveStruggleTopicsByChapter(flatLabels, catalog) : [];

        return {
            userId: roster.userId,
            userName: roster.userName,
            role: roster.role,
            conversationCount: roster.chats.length,
            struggleTopicCount: flatLabels.length,
            struggleTopics: flatLabels,
            struggleTopicsByChapter,
            chats: roster.chats
        };
    });

    return { struggleTopics, users };
}

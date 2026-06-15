/**
 * struggle-chapter-normalize.ts
 * @description Pure helpers for struggle label sanitization, legacy Mongo coercion, and per-chapter derive (read-time only).
 */

import type {
    InstructorStruggleTopicForDisplay,
    MemoryAgentChapterStruggle,
    MemoryAgentEntry
} from '../types/shared';

/** Mongo document shape before coercion (flat canonical field and/or legacy per-chapter field). */
export type MemoryAgentRawDoc = Pick<
    MemoryAgentEntry,
    'name' | 'userId' | 'role' | 'createdAt' | 'updatedAt'
> & {
    struggleTopics?: string[];
    /** @deprecated Legacy persisted field — removed lazily on read/write. */
    struggleTopicsByChapter?: MemoryAgentChapterStruggle[];
};

export interface LabelChapterRef {
    topicOrWeekId: string;
    topicOrWeekTitle: string;
}

const GARBAGE_LABEL_PATTERN = /\[memory-agent\]/i;

/**
 * Returns true when a label looks like a memory-agent parse error string (not a real catalog label).
 */
export function isGarbageStruggleLabel(label: string): boolean {
    return GARBAGE_LABEL_PATTERN.test(label);
}

/**
 * Sanitizes a flat label list: trim, dedupe, drop garbage strings.
 */
export function sanitizeStruggleLabels(labels: readonly string[]): string[] {
    return filterValidLabels(labels);
}

/**
 * Builds a verbatim label → chapter map from the instructor catalog.
 * When the same label appears under multiple chapters, the **first** catalog row wins.
 */
export function buildLabelToChapterMap(
    catalog: readonly InstructorStruggleTopicForDisplay[]
): Map<string, LabelChapterRef> {
    const map = new Map<string, LabelChapterRef>();
    for (const row of catalog) {
        const label = row.struggleTopic.trim();
        if (!label || map.has(label)) {
            continue;
        }
        map.set(label, {
            topicOrWeekId: row.topicOrWeekId,
            topicOrWeekTitle: row.topicOrWeekTitle
        });
    }
    return map;
}

function filterValidLabels(labels: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of labels) {
        const label = raw.trim();
        if (!label || isGarbageStruggleLabel(label) || seen.has(label)) {
            continue;
        }
        seen.add(label);
        result.push(label);
    }
    return result;
}

function sanitizeChapters(chapters: readonly MemoryAgentChapterStruggle[]): MemoryAgentChapterStruggle[] {
    const byChapter = new Map<string, MemoryAgentChapterStruggle>();

    for (const chapter of chapters) {
        const topicOrWeekId = chapter.topicOrWeekId?.trim();
        const topicOrWeekTitle = chapter.topicOrWeekTitle?.trim() ?? '';
        if (!topicOrWeekId) {
            continue;
        }
        const labels = filterValidLabels(chapter.struggleTopics ?? []);
        if (labels.length === 0) {
            continue;
        }
        const existing = byChapter.get(topicOrWeekId);
        if (existing) {
            const merged = filterValidLabels([...existing.struggleTopics, ...labels]);
            byChapter.set(topicOrWeekId, {
                topicOrWeekId,
                topicOrWeekTitle: existing.topicOrWeekTitle || topicOrWeekTitle,
                struggleTopics: merged
            });
        } else {
            byChapter.set(topicOrWeekId, {
                topicOrWeekId,
                topicOrWeekTitle,
                struggleTopics: labels
            });
        }
    }

    return [...byChapter.values()];
}

/**
 * Merges flat `struggleTopics` and legacy `struggleTopicsByChapter` into one distinct label list.
 */
export function coerceFlatStruggleTopicsFromRaw(raw: MemoryAgentRawDoc): string[] {
    const fromFlat = filterValidLabels(raw.struggleTopics ?? []);
    const fromChapters = Array.isArray(raw.struggleTopicsByChapter)
        ? flattenChapterStruggles(raw.struggleTopicsByChapter)
        : [];
    if (fromChapters.length === 0) {
        return fromFlat;
    }
    return filterValidLabels([...fromFlat, ...fromChapters]);
}

/** True when the raw Mongo document still has the legacy per-chapter field (any value, including `[]`). */
export function rawHasLegacyChapterField(raw: MemoryAgentRawDoc): boolean {
    return Object.prototype.hasOwnProperty.call(raw, 'struggleTopicsByChapter');
}

/**
 * Parses a memory-agent Mongo row into the canonical flat {@link MemoryAgentEntry} shape.
 */
export function parseMemoryAgentEntry(raw: MemoryAgentRawDoc): MemoryAgentEntry {
    return {
        name: raw.name,
        userId: raw.userId,
        role: raw.role,
        struggleTopics: coerceFlatStruggleTopicsFromRaw(raw),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
}

/**
 * Assigns flat labels to chapter buckets using catalog reverse lookup.
 * Unmapped labels are omitted (no empty chapter headings).
 */
export function assignLabelsToChapters(
    labels: readonly string[],
    catalog: readonly InstructorStruggleTopicForDisplay[]
): MemoryAgentChapterStruggle[] {
    const labelToChapter = buildLabelToChapterMap(catalog);
    const byChapter = new Map<string, MemoryAgentChapterStruggle>();

    for (const label of filterValidLabels(labels)) {
        const chapter = labelToChapter.get(label);
        if (!chapter) {
            continue;
        }
        const existing = byChapter.get(chapter.topicOrWeekId);
        if (existing) {
            if (!existing.struggleTopics.includes(label)) {
                existing.struggleTopics.push(label);
            }
        } else {
            byChapter.set(chapter.topicOrWeekId, {
                topicOrWeekId: chapter.topicOrWeekId,
                topicOrWeekTitle: chapter.topicOrWeekTitle,
                struggleTopics: [label]
            });
        }
    }

    return [...byChapter.values()];
}

/** Derives per-chapter struggle view from flat labels + instructor catalog (read-time only). */
export function deriveStruggleTopicsByChapter(
    labels: readonly string[],
    catalog: readonly InstructorStruggleTopicForDisplay[]
): MemoryAgentChapterStruggle[] {
    return assignLabelsToChapters(labels, catalog);
}

/**
 * Merges incoming chapter buckets into existing ones (append + dedupe per chapter).
 */
export function mergeChapterStruggles(
    existing: readonly MemoryAgentChapterStruggle[],
    incoming: readonly MemoryAgentChapterStruggle[]
): MemoryAgentChapterStruggle[] {
    if (incoming.length === 0) {
        return sanitizeChapters(existing);
    }
    const combined: MemoryAgentChapterStruggle[] = [];
    for (const chapter of existing) {
        combined.push({
            topicOrWeekId: chapter.topicOrWeekId,
            topicOrWeekTitle: chapter.topicOrWeekTitle,
            struggleTopics: [...chapter.struggleTopics]
        });
    }
    for (const chapter of incoming) {
        const idx = combined.findIndex((c) => c.topicOrWeekId === chapter.topicOrWeekId);
        if (idx >= 0) {
            combined[idx] = {
                ...combined[idx],
                topicOrWeekTitle: combined[idx].topicOrWeekTitle || chapter.topicOrWeekTitle,
                struggleTopics: filterValidLabels([
                    ...combined[idx].struggleTopics,
                    ...chapter.struggleTopics
                ])
            };
        } else {
            combined.push({
                topicOrWeekId: chapter.topicOrWeekId,
                topicOrWeekTitle: chapter.topicOrWeekTitle,
                struggleTopics: filterValidLabels(chapter.struggleTopics)
            });
        }
    }
    return sanitizeChapters(combined);
}

/**
 * Derives a flat distinct label list from per-chapter buckets (export/stats helpers).
 */
export function flattenChapterStruggles(chapters: readonly MemoryAgentChapterStruggle[]): string[] {
    return filterValidLabels(chapters.flatMap((c) => c.struggleTopics));
}

/**
 * Counts distinct struggle labels across all chapters.
 */
export function countDistinctStruggleLabels(chapters: readonly MemoryAgentChapterStruggle[]): number {
    return flattenChapterStruggles(chapters).length;
}

/**
 * Labels from a memory-agent entry.
 */
export function getStruggleLabelsFromEntry(entry: MemoryAgentEntry): string[] {
    return filterValidLabels(entry.struggleTopics ?? []);
}

/**
 * Removes one verbatim label from all chapter buckets.
 */
export function removeLabelFromChapters(
    chapters: readonly MemoryAgentChapterStruggle[],
    labelToRemove: string
): MemoryAgentChapterStruggle[] {
    const trimmed = labelToRemove.trim();
    if (!trimmed) {
        return sanitizeChapters(chapters);
    }
    const updated = chapters
        .map((chapter) => ({
            ...chapter,
            struggleTopics: chapter.struggleTopics.filter((l) => l.trim() !== trimmed)
        }))
        .filter((chapter) => chapter.struggleTopics.length > 0);
    return sanitizeChapters(updated);
}

/**
 * Counts labels in `labels` that do not map to any catalog chapter.
 */
export function countUnmappedLabels(
    labels: readonly string[],
    catalog: readonly InstructorStruggleTopicForDisplay[]
): number {
    const labelToChapter = buildLabelToChapterMap(catalog);
    let unmapped = 0;
    for (const label of filterValidLabels(labels)) {
        if (!labelToChapter.has(label)) {
            unmapped += 1;
        }
    }
    return unmapped;
}

/**
 * struggle-fifo-collector.ts
 *
 * Builds FIFO-aware prior struggle-topic context for LLM generation on material upload.
 * Walks course curriculum in DB array order (topicOrWeekInstances → items).
 */

import type { activeCourse, InstructorStruggleTopic, TopicOrWeekItem } from '../types/shared';

/** One section's struggle labels for generation prompt assembly. */
export interface PriorStruggleSection {
    topicOrWeekTitle: string;
    itemTitle: string;
    topics: string[];
    isCurrent: boolean;
}

/**
 * Collects prior and current-section struggle topics in curriculum (FIFO) order.
 *
 * Walks `course.topicOrWeekInstances` then `items` in array order, stopping at the
 * target section (inclusive). Earlier sections contribute exclusion labels; the target
 * section lists existing labels only (append context).
 *
 * @param course - Active course document with embedded topic/week instances.
 * @param topicOrWeekId - Target topic/week instance id.
 * @param itemId - Target content item id within that instance.
 * @returns Sections in curriculum order through the target section.
 * @throws When the target section is not found in the course.
 */
export function collectPriorStruggleTopicsForGeneration(
    course: activeCourse,
    topicOrWeekId: string,
    itemId: string
): PriorStruggleSection[] {
    const sections: PriorStruggleSection[] = [];
    let found = false;

    for (const instance of course.topicOrWeekInstances ?? []) {
        for (const item of instance.items ?? []) {
            const section: PriorStruggleSection = {
                topicOrWeekTitle: instance.title || 'Untitled',
                itemTitle: resolveItemTitle(item),
                topics: extractStruggleTopicLabels(item.instructorStruggleTopics),
                isCurrent: instance.id === topicOrWeekId && item.id === itemId,
            };

            sections.push(section);

            if (section.isCurrent) {
                found = true;
                return sections;
            }
        }
    }

    if (!found) {
        throw new Error(
            `Struggle generation target not found: topicOrWeekId=${topicOrWeekId}, itemId=${itemId}`
        );
    }

    return sections;
}

/**
 * Renders prior/current struggle topics as a single `<prior_assigned_struggle_topics>` block.
 *
 * @param currentSectionInfo - Root `info` attribute, e.g. `"Topic 8 — Electrochemistry / Lecture notes"`.
 * @param sections - Output of {@link collectPriorStruggleTopicsForGeneration}.
 * @returns XML string for the user turn (no `order` attributes on sections).
 */
export function formatPriorStruggleTopicsXml(
    currentSectionInfo: string,
    sections: PriorStruggleSection[]
): string {
    const lines: string[] = [
        `<prior_assigned_struggle_topics info="${escapeXmlAttr(currentSectionInfo)}">`,
    ];

    for (const section of sections) {
        if (section.topics.length === 0) {
            continue;
        }

        const attrs = [
            `topic_or_week="${escapeXmlAttr(section.topicOrWeekTitle)}"`,
            `item="${escapeXmlAttr(section.itemTitle)}"`,
        ];
        if (section.isCurrent) {
            attrs.push('info="current topic"');
        }

        lines.push(`  <section ${attrs.join(' ')}>`);
        for (const topic of section.topics) {
            lines.push(`    <struggle_topic>${escapeXmlText(topic)}</struggle_topic>`);
        }
        lines.push('  </section>');
    }

    lines.push('</prior_assigned_struggle_topics>');
    return lines.join('\n');
}

function resolveItemTitle(item: TopicOrWeekItem): string {
    return item.itemTitle || item.title || 'Untitled';
}

function extractStruggleTopicLabels(topics: InstructorStruggleTopic[] | undefined): string[] {
    if (!topics?.length) {
        return [];
    }
    return topics.map((entry) => entry.struggleTopic);
}

function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

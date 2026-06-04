/**
 * memory-agent-prompt.ts
 *
 * Builds the memory-agent system prompt for struggle-topic detection (V2).
 * Instructor catalog is injected as hierarchical XML; conversation excerpt is sent in the user turn.
 */

import type { InstructorStruggleTopicForDisplay } from '../types/shared';

/**
 * Renders flattened catalog rows as nested XML for the memory-agent system prompt.
 *
 * Structure: `course_struggle_catalog` → `topic_or_week` → `section` → `struggle_topic` text nodes.
 * Empty catalog yields an empty wrapper element (analysis should be skipped upstream when possible).
 *
 * @param catalog - Output of `getAllInstructorStruggleTopics` for the course.
 * @returns XML string embedded under `### course_struggle_catalog` in the system prompt.
 */
export function formatStruggleCatalogForPrompt(catalog: InstructorStruggleTopicForDisplay[]): string {
    if (catalog.length === 0) {
        return '<course_struggle_catalog>\n</course_struggle_catalog>';
    }

    const byTopicOrWeek = new Map<string, Map<string, string[]>>();
    for (const row of catalog) {
        const weekTitle = row.topicOrWeekTitle || 'Untitled';
        const sectionTitle = row.itemTitle || 'Untitled';
        if (!byTopicOrWeek.has(weekTitle)) {
            byTopicOrWeek.set(weekTitle, new Map());
        }
        const sections = byTopicOrWeek.get(weekTitle)!;
        if (!sections.has(sectionTitle)) {
            sections.set(sectionTitle, []);
        }
        sections.get(sectionTitle)!.push(row.struggleTopic);
    }

    const lines: string[] = ['<course_struggle_catalog>'];
    for (const [weekTitle, sections] of byTopicOrWeek) {
        lines.push(`  <topic_or_week title="${escapeXmlAttr(weekTitle)}">`);
        for (const [sectionTitle, topics] of sections) {
            lines.push(`    <section title="${escapeXmlAttr(sectionTitle)}">`);
            for (const topic of topics) {
                lines.push(`      <struggle_topic>${escapeXmlText(topic)}</struggle_topic>`);
            }
            lines.push('    </section>');
        }
        lines.push('  </topic_or_week>');
    }
    lines.push('</course_struggle_catalog>');
    return lines.join('\n');
}

/**
 * Format existing student struggle topics as XML for the memory-agent system prompt.
 *
 * @param existingStruggleTopics - Array of existing student struggle topics.
 * @returns XML string embedded under `### existing_student_struggle_topics` in the system prompt.
 */
function formatExistingStudentTopics(existingStruggleTopics: string[]): string {
    if (existingStruggleTopics.length === 0) {
        return '<existing_student_struggle_topics>\n</existing_student_struggle_topics>';
    }
    const lines = ['<existing_student_struggle_topics>'];
    for (const topic of existingStruggleTopics) {
        lines.push(`  <topic>${escapeXmlText(topic)}</topic>`);
    }
    lines.push('</existing_student_struggle_topics>');
    return lines.join('\n');
}


/**
 * Escape XML attribute values for safe embedding in XML.
 *
 * @param value - String to escape.
 * @returns Escaped string.
 */
function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

/**
 * Escape XML text values for safe embedding in XML.
 *
 * @param value - String to escape.
 * @returns Escaped string.
 */
function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Full memory-agent system prompt: purpose, rules, catalog XML, and existing student topics.
 *
 * Used with {@link struggleAnalysisResponseSchema} via `LLMModule.sendStructuredConversation`.
 * The caller should add the user turn separately (wrapped in `conversation_excerpt`).
 *
 * @param catalog - Instructor-defined labels for the course (flattened with hierarchy).
 * @param existingStruggleTopics - Labels already on the student's memory-agent entry (verbatim strings).
 * @returns Markdown + XML system prompt string.
 */
export function buildMemoryAgentSystemPrompt(
    catalog: InstructorStruggleTopicForDisplay[],
    existingStruggleTopics: string[] = []
): string {
    const catalogBlock = formatStruggleCatalogForPrompt(catalog);
    const existingBlock = formatExistingStudentTopics(existingStruggleTopics);

    return `# Memory agent

## Purpose
Identify whether the student is struggling with a topic from the instructor-defined catalog, using only the last three chat messages, so the Socratic tutor can later switch to more direct teaching for that label.

## How this works
1. You receive a **conversation excerpt** (last 3 messages) in the user turn and the **course struggle catalog** below.
2. You may output **at most one** label that appears **verbatim** in the catalog.
3. If nothing in the excerpt supports a catalog label, output an empty list.
4. Do not invent labels. Do not paraphrase. Do not return labels already stored for this student (listed under Existing).

## Inputs

### course_struggle_catalog
${catalogBlock}

### existing_student_struggle_topics
${existingBlock}

## Output contract
Return JSON matching the schema: \`{ "struggleTopics": string[] }\` with 0 or 1 element; each element must equal a catalog \`<struggle_topic>\` text exactly.`;
}

/**
 * Legacy alias for {@link buildMemoryAgentSystemPrompt}.
 *
 * @deprecated Prefer `buildMemoryAgentSystemPrompt(catalog, existingStruggleTopics)`.
 * @param existingStruggleTopics - Student's current struggle labels.
 * @param catalog - Instructor catalog rows (defaults to empty).
 * @returns System prompt string.
 */
export const getMemoryAgentPrompt = (
    existingStruggleTopics: string[] = [],
    catalog: InstructorStruggleTopicForDisplay[] = []
): string => buildMemoryAgentSystemPrompt(catalog, existingStruggleTopics);

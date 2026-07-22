/**
 * unstruggle-yes-followup-prompt.ts
 *
 * Builds the forked system prompt for unstruggle Yes → learning objective text selection.
 */

import type { LearningObjectiveForLLM } from '../types/shared';

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeXmlAttr(value: string): string {
    return escapeXmlText(value).replace(/"/g, '&quot;');
}

function formatLearningObjectiveCatalog(catalog: LearningObjectiveForLLM[]): string {
    if (catalog.length === 0) {
        return '<course_learning_objective_catalog>\n</course_learning_objective_catalog>';
    }
    const lines = ['<course_learning_objective_catalog>'];
    for (const row of catalog) {
        lines.push(
            `  <learning_objective topic="${escapeXmlAttr(row.topicOrWeekTitle)}" item="${escapeXmlAttr(row.itemTitle)}">${escapeXmlText(row.text)}</learning_objective>`
        );
    }
    lines.push('</course_learning_objective_catalog>');
    return lines.join('\n');
}

/**
 * buildUnstruggleYesFollowupSystemPrompt - system prompt for post-unstruggle Yes LO selection.
 */
export function buildUnstruggleYesFollowupSystemPrompt(
    clearedStruggleTopic: string,
    catalog: LearningObjectiveForLLM[]
): string {
    const catalogBlock = formatLearningObjectiveCatalog(catalog);

    return `# Unstruggle yes follow-up — learning objective selection

## Purpose
The student confirmed they are confident with a struggle topic. Your only job is to select up to three learning objective texts from the course catalog that best support follow-up practice scenario questions related to that topic and the recent conversation.

Do NOT write encouragement or chat prose. The application supplies the student-facing message separately.

## Cleared struggle topic
${clearedStruggleTopic}

## Course learning objective catalog
${catalogBlock}

## Output
Return JSON with one field:
- \`learningObjectiveTexts\`: array of 0–3 strings

## Rules
- Each string in \`learningObjectiveTexts\` MUST match a catalog \`<learning_objective>\` body text exactly (verbatim copy).
- Pick objectives semantically related to the cleared struggle topic and the conversation excerpt.
- Prefer objectives that are natural next steps for practice, not the exact same wording as the struggle label unless clearly appropriate.
- Return an empty array if nothing in the catalog is a reasonable match.
- Do NOT invent objectives not present in the catalog.
- Do NOT return topic titles, item titles, or internal ids — only the objective text strings.`;
}

/**
 * buildUnstruggleYesFollowupUserTurn - wraps recent chat excerpt for the forked LLM call.
 */
export function buildUnstruggleYesFollowupUserTurn(recentMessages: string): string {
    if (!recentMessages.trim()) {
        return '<conversation_excerpt>\n(no prior messages)\n</conversation_excerpt>';
    }
    return `<conversation_excerpt>\n${recentMessages.trim()}\n</conversation_excerpt>`;
}

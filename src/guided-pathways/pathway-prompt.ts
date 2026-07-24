/**
 * pathway-prompt.ts
 *
 * Builds system and user turns for the Guided Pathway classifier. Trigger rules come from
 * each pathway's `triggerDescription`; priority is list order (first = highest).
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.0.0
 * @description: Dynamic pathway evaluator prompts from course pathway docs.
 */

import type { GuidedPathway } from '../types/shared';

/** Metadata wrapped into the evaluator user turn. */
export interface PathwayEvaluationMetadata {
    courseName: string;
    conversationMode: 'socratic' | 'explanatory';
}

/**
 * buildPathwayEvaluationSystemPrompt - System prompt listing evaluable pathways in priority order.
 *
 * @param pathways - Evaluable pathways sorted by `order` ascending
 * @returns System prompt for structured pathway evaluation
 */
export function buildPathwayEvaluationSystemPrompt(pathways: readonly GuidedPathway[]): string {
    const sections = pathways
        .map(
            (p, index) => `### \`${p.id}\` (priority ${index + 1})
${p.triggerDescription.trim()}`
        )
        .join('\n\n');

    const priorityLine =
        pathways.length > 0
            ? pathways.map((p) => p.id).join(' > ')
            : '(none configured)';

    return `You are a safety and relevance evaluator for an engineering study assistant (Guided Pathways).

Evaluate the student's message against the pathways below. Return exactly one \`pathwayType\`:

${sections || '(No pathways configured.)'}

### \`none\`
- Message is appropriate and on-topic for the course; no pathway above applies.

**Priority rule:** If multiple pathways could apply, return only the highest-priority match (earliest in this list): ${priorityLine}.

## Calibration reminders

- Course frustration ("I hate this problem") is **not** a mental health crisis unless self-harm or acute crisis language is present.
- "I'm struggling with enthalpy calculations" is **on-topic** coursework struggle, not a crisis.
- Mild profanity about a problem is **not** inappropriate content unless directed at people.
- Engineering ethics or lab work tied to the course is **on-topic**, not off-topic.`;
}

/**
 * buildPathwayEvaluationUserTurn - User turn for pathway evaluation (raw message + metadata).
 *
 * @param message - Raw student chat message
 * @param metadata - Course name and conversation mode
 * @returns XML-wrapped user turn for the evaluator LLM
 */
export function buildPathwayEvaluationUserTurn(
    message: string,
    metadata: PathwayEvaluationMetadata
): string {
    return `<student_message>
${message.trim()}
</student_message>

<evaluation_metadata>
  <course_name>${escapeXmlText(metadata.courseName)}</course_name>
  <conversation_mode>${metadata.conversationMode}</conversation_mode>
</evaluation_metadata>`;
}

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

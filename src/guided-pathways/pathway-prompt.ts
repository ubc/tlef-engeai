/**
 * pathway-prompt.ts
 *
 * Builds system and user turns for the Guided Pathway classifier. Trigger rules come from
 * each pathway's `triggerDescription`.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.1.0
 * @description: Dynamic pathway evaluator prompts from course pathway docs.
 */

import type { GuidedPathway } from '../types/shared';

/** Metadata wrapped into the evaluator user turn. */
export interface PathwayEvaluationMetadata {
    courseName: string;
    conversationMode: 'socratic' | 'explanatory';
}

/**
 * buildPathwayEvaluationSystemPrompt - System prompt listing evaluable pathways.
 *
 * @param pathways - Evaluable pathways (stable list order from library `order`)
 * @returns System prompt for structured pathway evaluation
 */
export function buildPathwayEvaluationSystemPrompt(pathways: readonly GuidedPathway[]): string {
    const sections = pathways
        .map((p) => `### \`${p.id}\`\n${p.triggerDescription.trim()}`)
        .join('\n\n');

    return `You are a safety and relevance evaluator for an engineering study assistant (Guided Pathways).

Evaluate the student's message against the pathways below. Return exactly one \`pathwayType\`:

${sections || '(No pathways configured.)'}

### \`none\`
- Message is appropriate and on-topic for the course; no pathway above applies.

Pick the single pathway whose trigger best matches the message. If none apply, return \`none\`.

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

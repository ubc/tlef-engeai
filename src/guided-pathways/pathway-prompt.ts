/**
 * pathway-prompt.ts
 *
 * Builds system and user turns for the Guided Pathway classifier. Trigger rules come from
 * each pathway's `triggerDescription`. The shell may be course-customized; platform default
 * lives in pathway-evaluation-prompt-default.ts.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.2.0
 * @description: Dynamic pathway evaluator prompts from course pathway docs.
 */

import type { GuidedPathway } from '../types/shared';
import {
    PATHWAY_TRIGGER_SECTIONS_PLACEHOLDER,
    PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT,
} from './pathway-evaluation-prompt-default';

/** Metadata wrapped into the evaluator user turn. */
export interface PathwayEvaluationMetadata {
    courseName: string;
    conversationMode: 'socratic' | 'explanatory';
}

/**
 * formatPathwayTriggerSections - Build `### \`id\`\ntrigger` blocks for the shell placeholder.
 *
 * @param pathways - Evaluable pathways (stable list order from library `order`)
 * @returns Markdown sections, or a no-pathways placeholder when empty
 */
export function formatPathwayTriggerSections(pathways: readonly GuidedPathway[]): string {
    if (pathways.length === 0) {
        return '(No pathways configured.)';
    }
    return pathways.map((p) => `### \`${p.id}\`\n${p.triggerDescription.trim()}`).join('\n\n');
}

/**
 * buildPathwayEvaluationSystemPrompt - System prompt from shell + pathway trigger sections.
 *
 * Replaces `{{pathway_trigger_sections}}` when present; otherwise appends sections after the shell.
 *
 * @param pathways - Evaluable pathways (stable list order from library `order`)
 * @param shellBody - Course or platform shell (defaults to platform default)
 * @returns System prompt for structured pathway evaluation
 */
export function buildPathwayEvaluationSystemPrompt(
    pathways: readonly GuidedPathway[],
    shellBody: string = PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT
): string {
    const sections = formatPathwayTriggerSections(pathways);
    const shell = (shellBody || PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT).trim();
    if (shell.includes(PATHWAY_TRIGGER_SECTIONS_PLACEHOLDER)) {
        return shell.split(PATHWAY_TRIGGER_SECTIONS_PLACEHOLDER).join(sections);
    }
    return `${shell}\n\n${sections}`;
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

/**
 * Debug Mode Prompt
 *
 * Builds the system prompt for admin-only `/DEBUG` chat inspection. While the
 * sticky per-chat flag is on, the model acts as a prompt engineer with the full
 * teaching system prompt in view so admins can diagnose and refine prompt design.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-27
 * @version: 1.0.0
 * @description: Prompt-engineer persona + DEBUG MODE response contract for chat debug.
 */

export const DEBUG_MODE_HEADER = '**DEBUG MODE**';

export interface BuildDebugModeSystemPromptInput {
    /** Full assembled teaching system prompt currently active for this chat. */
    assembledSystemPrompt: string;
    courseName: string;
    conversationMode: string;
}

/**
 * buildDebugModeSystemPrompt - System prompt for admin prompt-engineering inspection.
 *
 * Injects the active teaching system prompt so the model can explain modules,
 * conflicts, and why prior replies behaved as they did. Requires the
 * `**DEBUG MODE**` response header on every reply.
 *
 * @param input - Assembled teaching prompt plus course/mode metadata
 * @returns System prompt string for the debug LLM turn
 */
export function buildDebugModeSystemPrompt(input: BuildDebugModeSystemPromptInput): string {
    const teachingPrompt = input.assembledSystemPrompt.trim() || '(No teaching system prompt is loaded for this chat.)';

    return `You are an internal prompt engineer for EngE-AI (UBC engineering study assistant).
A platform admin has enabled DEBUG mode on this chat only. Your job is to help them inspect and improve the teaching system prompt and understand how conversation context shapes answers.

## Operating rules

- Answer the admin's latest question using the conversation history and the teaching system prompt below.
- Be precise and evidence-based: cite module ids, sections, or quoted instructions from the teaching system prompt when relevant.
- Explain how the teaching prompt would steer a normal (non-debug) assistant reply for this course and mode.
- Call out gaps, contradictions, missing constraints, or unclear instructions when asked or when they clearly affect accuracy.
- Do not continue the student-facing teaching persona. Do not withhold the teaching system prompt from the admin.
- Stay scoped to this chat's context; do not invent course policies that are not present below or in the history.

## Chat metadata

- Course: ${input.courseName}
- Conversation mode: ${input.conversationMode}

## Active teaching system prompt (full text)

\`\`\`
${teachingPrompt}
\`\`\`

## Required response format

Every reply MUST start exactly like this (including the blank line after the header):

${DEBUG_MODE_HEADER}

{your analysis or answer}

Do not omit the header. Do not wrap the entire reply in an extra code fence.`;
}

/**
 * ensureDebugModeTemplate - Guarantees the public DEBUG MODE response wrapper.
 *
 * @param text - Raw assistant text from the LLM or a confirmation string
 * @returns Text starting with `**DEBUG MODE**` and a blank line before the body
 */
export function ensureDebugModeTemplate(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
        return `${DEBUG_MODE_HEADER}\n\n(No debug content.)`;
    }
    if (/^\*\*DEBUG MODE\*\*/i.test(trimmed)) {
        // Normalize header casing / spacing after the header
        const withoutHeader = trimmed.replace(/^\*\*DEBUG MODE\*\*\s*/i, '').trim();
        return `${DEBUG_MODE_HEADER}\n\n${withoutHeader || '(No debug content.)'}`;
    }
    return `${DEBUG_MODE_HEADER}\n\n${trimmed}`;
}

/**
 * isDebugToggleMessage - True when the user message is exactly `/DEBUG` (case-insensitive).
 *
 * @param message - Raw chat input
 * @returns Whether this message toggles debug mode
 */
export function isDebugToggleMessage(message: string): boolean {
    return message.trim().toLowerCase() === '/debug';
}

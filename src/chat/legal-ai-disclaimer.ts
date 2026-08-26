/**
 * Legal AI Disclaimer — Office of the University Counsel short notice
 *
 * Short disclaimer appended to every new chat's opening assistant message.
 * Long-form terms live at the static public page path below.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-11
 * @version: 1.0.0
 * @description: Counsel-required short disclaimer + append helper for chat init.
 */

/** Public static page with full terms and FIPPA notice. */
export const LEGAL_AI_DISCLAIMER_PAGE_PATH = '/pages/ai-disclaimer.html';

/**
 * Short Counsel disclaimer appended to the opening assistant message.
 * Markdown link opens the static long-form page in a new tab via chat render.
 */
export const LEGAL_AI_DISCLAIMER_SHORT = `This AI tool generates responses using a large language model. It may provide information that is inaccurate, incomplete or outdated. All users are responsible for verifying content against official UBC sources before relying on it. You may not put others’ personal information into this tool. By using this tool, you agree to the terms outlined here: [here](${LEGAL_AI_DISCLAIMER_PAGE_PATH}).`;

/**
 * appendLegalAiDisclaimer - Appends the Counsel short disclaimer when missing.
 *
 * Skips append when the message already contains the long-form page path
 * (avoids double-append if an instructor pasted the notice into a custom prompt).
 *
 * @param message - Resolved initial assistant message text
 * @returns Message with Counsel short disclaimer at the end when needed
 */
export function appendLegalAiDisclaimer(message: string): string {
    if (message.includes(LEGAL_AI_DISCLAIMER_PAGE_PATH)) {
        return message;
    }
    const trimmed = message.trimEnd();
    return `${trimmed}\n\n${LEGAL_AI_DISCLAIMER_SHORT}`;
}

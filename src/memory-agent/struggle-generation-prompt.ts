/**
 * struggle-generation-prompt.ts
 *
 * Builds system and user turns for instructor struggle-topic generation on material upload.
 * System prompt body is loaded from shared-default/struggle_generation.md.
 */

import fs from 'fs';
import path from 'path';

let cachedStruggleGenerationBody: string | null = null;

/**
 * Loads struggle_generation.md from dist or src (same resolution order as system-prompt-defaults-loader).
 */
function loadStruggleGenerationPromptBody(): string {
    if (cachedStruggleGenerationBody) {
        return cachedStruggleGenerationBody;
    }

    const candidates = [
        path.join(process.cwd(), 'dist/chat/system-prompts/shared-default/struggle_generation.md'),
        path.join(process.cwd(), 'src/chat/system-prompts/shared-default/struggle_generation.md'),
    ];

    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
            cachedStruggleGenerationBody = fs.readFileSync(filePath, 'utf8');
            return cachedStruggleGenerationBody;
        }
    }

    throw new Error(
        `struggle_generation.md not found. Expected one of: ${candidates.join(', ')}`
    );
}

/** Clears cached prompt body (for tests). */
export function clearStruggleGenerationPromptCache(): void {
    cachedStruggleGenerationBody = null;
}

/**
 * Full system prompt for struggle-topic generation (rules + examples from struggle_generation.md).
 * Used with {@link struggleGenerationResponseSchema} via `LLMModule.sendStructuredConversation`.
 */
export function buildStruggleGenerationSystemPrompt(): string {
    return loadStruggleGenerationPromptBody();
}

/**
 * User turn: prior FIFO XML plus uploaded material excerpt.
 *
 * @param priorXml - Output of {@link formatPriorStruggleTopicsXml}.
 * @param materialName - Display name of the uploaded material.
 * @param extractedText - Parsed text from the new upload only.
 * @param truncated - Whether extractedText was shortened for token limits.
 */
export function buildStruggleGenerationUserTurn(
    priorXml: string,
    materialName: string,
    extractedText: string,
    truncated: boolean
): string {
    const truncatedAttr = truncated ? 'true' : 'false';
    return [
        priorXml,
        `<uploaded_material material_name="${escapeXmlAttr(materialName)}" truncated="${truncatedAttr}">`,
        escapeXmlText(extractedText),
        '</uploaded_material>',
    ].join('\n');
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

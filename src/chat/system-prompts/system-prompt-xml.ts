/**
 * XML serialization and parsing for course system prompts.
 *
 * Canonical wire format: `<system_prompt mode="…">` wrapping `<module id="…">` bodies.
 */

import { ConversationModeId, SystemPromptModule } from '../../types/shared';

const VALID_SYSTEM_PROMPT_MODES = 'socratic|explanatory';
const SYSTEM_PROMPT_OPEN_RE = new RegExp(
    `^<system_prompt\\s+mode="(${VALID_SYSTEM_PROMPT_MODES})">\\s*`,
    'i'
);
const SYSTEM_PROMPT_CLOSE = '</system_prompt>';
const MODULE_RE = /<module\s+id="([^"]+)"(?:\s+visibility="[^"]*")?>([\s\S]*?)<\/module>/gi;

/** Reserved id prefixes — instructor-authored modules must not use these. */
export const RESERVED_MODULE_ID_PREFIXES = ['_system_', '_runtime_'] as const;

/**
 * Returns true when the module id uses a reserved system/runtime prefix.
 */
export function isReservedModuleId(id: string): boolean {
    return RESERVED_MODULE_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * Builds the full LLM system prompt XML string from ordered modules.
 */
export function buildSystemPromptXml(mode: ConversationModeId, modules: SystemPromptModule[]): string {
    const sorted = [...modules].sort((a, b) => a.sortOrder - b.sortOrder);
    const moduleXml = sorted
        .map((m) => {
            const vis = m.id.startsWith('_runtime_') ? ' visibility="system"' : '';
            return `<module id="${escapeXmlAttr(m.id)}"${vis}>\n${m.body}\n</module>`;
        })
        .join('\n');
    return `<system_prompt mode="${mode}">\n${moduleXml}\n${SYSTEM_PROMPT_CLOSE}`;
}

export interface ParsedSystemPromptXml {
    mode: ConversationModeId;
    modules: SystemPromptModule[];
    warnings: string[];
}

/**
 * Parses plain XML into mode + modules. Returns warnings for non-fatal issues.
 */
export function parseSystemPromptXml(xml: string): ParsedSystemPromptXml {
    const warnings: string[] = [];
    const trimmed = xml.trim();

    const openMatch = trimmed.match(
        new RegExp(`^<system_prompt\\s+mode="(${VALID_SYSTEM_PROMPT_MODES})">`, 'i')
    );
    if (!openMatch) {
        throw new Error('Missing or invalid <system_prompt mode="…"> root element');
    }
    const mode = openMatch[1].toLowerCase() as ConversationModeId;

    if (!trimmed.endsWith(SYSTEM_PROMPT_CLOSE)) {
        warnings.push('Missing closing </system_prompt> tag');
    }

    const inner = trimmed
        .replace(SYSTEM_PROMPT_OPEN_RE, '')
        .replace(new RegExp(`${escapeRegExp(SYSTEM_PROMPT_CLOSE)}\\s*$`), '');

    const modules: SystemPromptModule[] = [];
    let match: RegExpExecArray | null;
    let sortOrder = 0;
    MODULE_RE.lastIndex = 0;
    while ((match = MODULE_RE.exec(inner)) !== null) {
        const id = match[1];
        const body = match[2];
        if (isReservedModuleId(id)) {
            warnings.push(`Skipped reserved module id "${id}" in plain editor import`);
            continue;
        }
        modules.push({ id, body, sortOrder: sortOrder++ });
    }

    if (modules.length === 0) {
        warnings.push('No instructor modules found in XML');
    }

    return { mode, modules, warnings };
}

/**
 * Serializes instructor-visible modules (excludes reserved ids) to plain XML for editing.
 */
export function buildInstructorPlainXml(
    mode: ConversationModeId,
    modules: SystemPromptModule[]
): string {
    const visible = modules
        .filter((m) => !isReservedModuleId(m.id))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    return buildSystemPromptXml(mode, visible);
}

function escapeXmlAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

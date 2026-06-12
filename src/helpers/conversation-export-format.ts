/**
 * conversation-export-format.ts
 * @description Transcript and struggle-topic text formatting for monitor single-chat download and bulk ZIP export.
 */

import type { MemoryAgentChapterStruggle } from '../types/shared';
import { flattenChapterStruggles } from './struggle-chapter-normalize';

export function exportRoleLabel(msg: Record<string, unknown> | undefined): string {
    const s = msg?.sender as string | undefined;
    if (s === 'user') return 'Student';
    if (s === 'bot') return 'Assistant';
    const role = msg?.role;
    if (typeof role === 'string' && role.trim()) return role.trim();
    return 'unknown';
}

export function exportMessageBody(msg: Record<string, unknown> | undefined): string {
    const raw = msg?.text ?? msg?.content;
    if (raw == null) return '[Empty]';
    const str = typeof raw === 'string' ? raw : String(raw);
    const trimmed = str.trim();
    return trimmed.length > 0 ? str : '[Empty]';
}

export interface FormatSingleChatExportParams {
    courseName: string;
    studentDisplayName: string;
    studentUserId: string;
    chatId: string;
    chat: {
        itemTitle?: string;
        title?: string;
        topicOrWeekTitle?: string;
        createdAt?: unknown;
        messages?: Record<string, unknown>[];
    };
}

/**
 * Builds the monitor-style hierarchical TXT export for one chat thread.
 */
export function formatSingleChatExportText(params: FormatSingleChatExportParams): string {
    const { courseName, studentDisplayName, studentUserId, chatId, chat } = params;
    const chatTitle = chat.itemTitle || chat.title || 'Untitled Chat';

    let exportText = '';
    exportText += `========================================\n`;
    exportText += `CHAT CONVERSATION EXPORT\n`;
    exportText += `========================================\n\n`;
    exportText += `Student: ${studentDisplayName}\n`;
    exportText += `Student ID: ${studentUserId || 'N/A'}\n`;
    exportText += `Course: ${courseName}\n`;
    exportText += `Chat ID: ${chatId}\n`;
    exportText += `Chat Title: ${chatTitle}\n`;
    exportText += `Topic/Week: ${chat.topicOrWeekTitle || 'N/A'}\n`;
    exportText += `Created: ${chat.createdAt ?? 'N/A'}\n`;
    exportText += `========================================\n\n`;

    exportText += `--- Messages ---\n\n`;
    const messages = chat.messages || [];
    if (messages.length === 0) {
        exportText += '[No messages]\n';
    } else {
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            exportText += `Message ${i + 1}:\n`;
            exportText += `  Role: ${exportRoleLabel(message)}\n`;
            exportText += `  Content: ${exportMessageBody(message)}\n`;
            const ts = message.timestamp;
            if (ts) {
                exportText += `  Timestamp: ${ts}\n`;
            }
            if (i < messages.length - 1) {
                exportText += '\n';
            }
        }
    }

    return exportText;
}

/** Input shape for structured exports in `Struggle topics/` ZIP entries. */
export interface StruggleTopicsZipExportInput {
    userId: string;
    name: string;
    memoryAgentCreatedAt: Date | null;
    struggleTopicsByChapter: readonly MemoryAgentChapterStruggle[];
    /**
     * @deprecated Flat fallback when `struggleTopicsByChapter` is empty (legacy rows).
     */
    struggleTopics?: readonly string[];
}

function resolveExportChapters(input: StruggleTopicsZipExportInput): MemoryAgentChapterStruggle[] {
    return input.struggleTopicsByChapter
        .filter((c) => c.struggleTopics.length > 0)
        .map((c) => ({
            topicOrWeekId: c.topicOrWeekId,
            topicOrWeekTitle: c.topicOrWeekTitle,
            struggleTopics: [...c.struggleTopics]
        }));
}

/**
 * Human-readable struggle export with roster id, memory-agent `createdAt`, and per-chapter topics.
 */
export function formatStruggleTopicsExportText(input: StruggleTopicsZipExportInput): string {
    const createdLabel =
        input.memoryAgentCreatedAt != null
            ? input.memoryAgentCreatedAt.toISOString()
            : '(not initialized)';
    const chapters = resolveExportChapters(input);
    const lines = [
        `Student name: ${input.name}`,
        `Student ID: ${input.userId}`,
        `Memory agent record created: ${createdLabel}`,
        ''
    ];

    const flatLegacy = input.struggleTopics ?? [];

    if (chapters.length > 0) {
        lines.push('Struggle topics by chapter:', '');
        for (const chapter of chapters) {
            lines.push(chapter.topicOrWeekTitle);
            for (const topic of chapter.struggleTopics) {
                lines.push(`- ${topic}`);
            }
            lines.push('');
        }
        while (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }
    } else if (flatLegacy.length > 0) {
        lines.push('Struggle topics:');
        for (const topic of flatLegacy) {
            lines.push(`- ${topic}`);
        }
    } else {
        lines.push('Struggle topics by chapter:', '(none)');
    }

    return `${lines.join('\n')}\n`;
}

/** JSON-serializable body for `.json` struggle exports (ISO date or null). */
export function struggleTopicsExportToJsonPayload(input: StruggleTopicsZipExportInput): {
    userId: string;
    name: string;
    memoryAgentCreatedAt: string | null;
    struggleTopicsByChapter: MemoryAgentChapterStruggle[];
    struggleTopics: string[];
} {
    const chapters = resolveExportChapters(input);
    const flatFromChapters = flattenChapterStruggles(chapters);
    return {
        userId: input.userId,
        name: input.name,
        memoryAgentCreatedAt:
            input.memoryAgentCreatedAt != null ? input.memoryAgentCreatedAt.toISOString() : null,
        struggleTopicsByChapter: chapters,
        struggleTopics: flatFromChapters.length > 0 ? flatFromChapters : [...(input.struggleTopics ?? [])]
    };
}

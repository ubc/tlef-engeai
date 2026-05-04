/**
 * conversation-export-format.ts
 * @description Plain-text transcript formatting shared by monitor single-chat download and bulk ZIP export.
 */

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

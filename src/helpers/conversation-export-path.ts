/**
 * conversation-export-path.ts
 * @description Safe path segments and archive naming for instructor bulk conversation ZIP exports.
 * Dates inside ZIP paths use `YYYY-MM-DD` (hyphens only) so `/` never splits entries into nested folders.
 */

/**
 * Removes characters unsafe in ZIP entries and common filesystems (Windows/macOS/Linux).
 * Keeps spaces, parentheses, and most Unicode letters intact.
 */
export function sanitizeZipPathSegment(label: string): string {
    const stripped = label.replace(/[\x00-\x1f\\/:*\?"<>|]/g, '_').trim();
    return stripped.length > 0 ? stripped : 'unnamed';
}

/**
 * Format a Date as `YYYY-MM-DD` for ZIP paths only (no `/` between day/month/year —
 * slashes would split ZIP entries into nested folders).
 */
export function formatYyyyMmDdForPath(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Prefer chat.createdAt when parseable; otherwise earliest positive message timestamp;
 * otherwise “now” at export time (caller passes fallback).
 */
export function resolveChatExportDate(chat: Record<string, unknown>, fallback: Date): Date {
    const rawCreated = chat.createdAt;
    if (rawCreated != null) {
        const d = new Date(rawCreated as string | number | Date);
        if (!Number.isNaN(d.getTime())) {
            return d;
        }
    }
    const messages = (chat.messages as unknown[]) || [];
    let best = 0;
    for (const m of messages) {
        const ts = (m as { timestamp?: number })?.timestamp;
        if (typeof ts === 'number' && ts > 0) {
            best = best === 0 ? ts : Math.min(best, ts);
        }
    }
    if (best > 0) {
        return new Date(best);
    }
    return fallback;
}

export type ConversationExportArchiveKind = 'txt' | 'json';

/**
 * Basename without `.zip`, including format suffix (`TXT FORMATTED` / `JSON FORMATTED`).
 */
export function buildConversationExportArchiveBasename(
    courseDisplayName: string,
    archiveKind: ConversationExportArchiveKind,
    exportedAt: Date
): string {
    const datePart = formatYyyyMmDdForPath(exportedAt);
    const suffix = archiveKind === 'txt' ? 'TXT FORMATTED' : 'JSON FORMATTED';
    return `${sanitizeZipPathSegment(courseDisplayName)} - Student Conversations (${datePart}) - ${suffix}`;
}

/**
 * RFC 5987-friendly Content-Disposition for Unicode filenames (ASCII fallback + UTF-8 filename*).
 */
export function contentDispositionAttachmentZip(displayBasename: string): string {
    const filename = `${displayBasename}.zip`;
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'export.zip';
    const encoded = encodeURIComponent(filename).replace(/'/g, '%27');
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

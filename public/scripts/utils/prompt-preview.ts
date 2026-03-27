/**
 * Shared helpers for one-line prompt previews on instructor prompt cards.
 */

/** First non-empty line (trimmed) for list preview; CSS may also clamp. */
export function truncateToFirstLine(content: string): string {
    if (!content) return '';
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const t = line.trim();
        if (t.length > 0) return t;
    }
    return '';
}

/** Show expand control when there is any reviewable body text. */
export function needsExpandButton(content: string): boolean {
    return content.trim().length > 0;
}

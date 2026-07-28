/**
 * chat-draft-prefill.ts — sessionStorage draft for the chat composer
 *
 * Used when Practice Scenarios sends a student to chat with scenario context prefilled.
 */

const STORAGE_PREFIX = 'engeai-chat-draft:';

export function stashChatDraftPrefill(courseId: string, text: string): void {
    try {
        sessionStorage.setItem(
            `${STORAGE_PREFIX}${courseId}`,
            JSON.stringify({ text, createdAt: Date.now() })
        );
    } catch {
        // ponytail: sessionStorage full or unavailable — navigation still works without prefill
    }
}

export function consumeChatDraftPrefill(courseId: string): string | null {
    try {
        const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${courseId}`);
        if (!raw) return null;
        sessionStorage.removeItem(`${STORAGE_PREFIX}${courseId}`);
        const parsed = JSON.parse(raw) as { text?: string };
        return typeof parsed.text === 'string' ? parsed.text : null;
    } catch {
        return null;
    }
}

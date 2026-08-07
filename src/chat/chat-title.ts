/**
 * Chat Title Generator — deterministic short titles for new chats.
 *
 * Extracts safe plain-text words from an assistant response while preserving
 * apostrophes that belong inside contractions.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-29
 * @version: 1.0.0
 * @description: Owns punctuation-aware chat-title normalization.
 */

const CHAT_TITLE_WORD_LIMIT = 10;
const CHAT_TITLE_WORD_PATTERN = /[A-Za-z0-9_]+(?:['\u2018\u2019\u02bc][A-Za-z0-9_]+)*/g;

/**
 * Build a short, plain-text title from an assistant response.
 *
 * Apostrophes are retained only when they join two parts of a word, which keeps
 * contractions such as "you're" intact without retaining quotation marks.
 */
export function generateChatTitleFromResponse(responseText: string): string {
    // Remove LaTeX content before extracting title words.
    let cleanText = responseText.replace(/\$\$.*?\$\$/g, '');
    cleanText = cleanText.replace(/\$.*?\$/g, '');

    // Tags are not title content. The word matcher below also excludes markup
    // punctuation and preserves straight or common Unicode apostrophes.
    cleanText = cleanText.replace(/<[^>]*>/g, '');
    const words = cleanText.match(CHAT_TITLE_WORD_PATTERN) ?? [];

    return words.slice(0, CHAT_TITLE_WORD_LIMIT).join(' ') || 'New Chat';
}

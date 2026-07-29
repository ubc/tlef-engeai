/**
 * Chat Title Generator Tests — regression coverage for title normalization.
 *
 * Verifies contraction preservation, punctuation cleanup, truncation, and the
 * empty-title fallback without requiring chat persistence or an LLM.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-29
 * @version: 1.0.0
 * @description: Covers punctuation-aware generated chat titles.
 */

import { generateChatTitleFromResponse } from '../chat-title';

describe('generateChatTitleFromResponse', () => {
    it('preserves straight apostrophes in contractions', () => {
        expect(
            generateChatTitleFromResponse(
                "I see you're interested in understanding how process flow"
            )
        ).toBe("I see you're interested in understanding how process flow");
    });

    it('preserves curly apostrophes in contractions', () => {
        expect(
            generateChatTitleFromResponse(
                'I see you’re interested in understanding how process flow'
            )
        ).toBe('I see you’re interested in understanding how process flow');
    });

    it('removes surrounding punctuation while keeping internal apostrophes', () => {
        expect(
            generateChatTitleFromResponse(
                '<p>“You’re” ready—aren’t you?</p>'
            )
        ).toBe('You’re ready aren’t you');
    });

    it('does not retain HTML or attribute content in a title', () => {
        expect(
            generateChatTitleFromResponse(
                '<img src=x onerror="alert(1)"> "you’re" ready'
            )
        ).toBe('you’re ready');
    });

    it('counts a contraction as one word within the ten-word limit', () => {
        expect(
            generateChatTitleFromResponse(
                "one two three four five six seven eight nine don't eleven"
            )
        ).toBe("one two three four five six seven eight nine don't");
    });

    it('falls back to New Chat when no title words remain', () => {
        expect(generateChatTitleFromResponse('$$x + y$$ — !!!')).toBe('New Chat');
    });
});

/**
 * Chat Title Generator — LLM topic titles for new chats.
 *
 * Asks the course chat model for a short topic title from the user's first
 * message, and falls back to the deterministic word extractor on mock mode,
 * error, timeout, or unusable output.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Owns ChatGPT-style automatic chat naming.
 */

import type { LLMOptions, LLMResponse, Message } from 'ubc-genai-toolkit-llm';
import { generateChatTitleFromResponse } from './chat-title';
import { isMockResponse } from '../helpers/mock-response';

export const CHAT_TITLE_TIMEOUT_MS = 6000;
const CHAT_TITLE_MAX_WORDS = 6;
const CHAT_TITLE_MAX_CHARS = 60;
const CHAT_TITLE_INPUT_CHARS = 2000;

const CHAT_TITLE_SYSTEM_PROMPT = [
    'You name chat conversations.',
    'Write a title of 3 to 6 words that states the topic of the user message.',
    'Use Title Case and the same language as the user.',
    'Reply with the title only: no quotes, no punctuation at the end, no explanation.',
].join(' ');

/** Minimal LLM surface the generator needs; `LLMModule` satisfies it. */
export interface ChatTitleLlm {
    sendConversation(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;
}

/** Input for {@link generateChatTitle}. */
export interface GenerateChatTitleInput {
    firstUserMessage: string;
    llm: ChatTitleLlm;
    llmOptions?: LLMOptions;
    timeoutMs?: number;
}

/**
 * Clean raw model output into a display title.
 *
 * Keeps the first line, removes a leading "Title:", markdown emphasis, wrapping
 * quotes, and trailing punctuation, then caps words and characters.
 * Returns `''` when nothing usable remains.
 */
export function normalizeGeneratedChatTitle(raw: string): string {
    let title = (raw ?? '').trim().split(/\r?\n/)[0] ?? '';
    title = title.replace(/^title\s*:\s*/i, '');
    title = title.replace(/[*_`#]/g, '');
    title = title.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '');
    title = title.replace(/[.!?:;,\s]+$/g, '');
    title = title.replace(/\s+/g, ' ').trim();

    const words = title.split(' ').filter(Boolean).slice(0, CHAT_TITLE_MAX_WORDS);
    return words.join(' ').slice(0, CHAT_TITLE_MAX_CHARS).trim();
}

/** Build the two-message prompt; only the (truncated) first user message is sent. */
export function buildChatTitleMessages(firstUserMessage: string): Message[] {
    return [
        { role: 'system', content: CHAT_TITLE_SYSTEM_PROMPT },
        { role: 'user', content: firstUserMessage.slice(0, CHAT_TITLE_INPUT_CHARS) },
    ];
}

/**
 * Produce a title for a chat from its first user message.
 *
 * Never rejects and never returns an empty string.
 */
export async function generateChatTitle(input: GenerateChatTitleInput): Promise<string> {
    const fallback = generateChatTitleFromResponse(input.firstUserMessage);

    // Step 1: mock mode never calls a provider.
    if (isMockResponse()) {
        return fallback;
    }

    // Step 2: race the model against the timeout.
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), input.timeoutMs ?? CHAT_TITLE_TIMEOUT_MS);
    });

    try {
        const response = await Promise.race([
            input.llm.sendConversation(buildChatTitleMessages(input.firstUserMessage), input.llmOptions),
            timeout,
        ]);
        // Step 3: normalize, or fall back on timeout/empty output.
        const title = response ? normalizeGeneratedChatTitle(response.content) : '';
        return title || fallback;
    } catch {
        return fallback;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

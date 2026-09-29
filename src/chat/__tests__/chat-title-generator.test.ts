/**
 * Chat Title Generator Tests — LLM topic titles with deterministic fallback.
 *
 * Uses a fake LLM so no provider is called.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Covers normalization, success, fallback, timeout, and mock mode.
 */

jest.mock('../../helpers/mock-response', () => ({
    isMockResponse: jest.fn(() => false),
}));

import { isMockResponse } from '../../helpers/mock-response';
import {
    buildChatTitleMessages,
    generateChatTitle,
    normalizeGeneratedChatTitle,
    type ChatTitleLlm,
} from '../chat-title-generator';

const mockedIsMock = isMockResponse as jest.MockedFunction<typeof isMockResponse>;

function fakeLlm(content: string): ChatTitleLlm & { calls: number } {
    const llm = {
        calls: 0,
        async sendConversation() {
            llm.calls += 1;
            return { content } as any;
        },
    };
    return llm;
}

describe('normalizeGeneratedChatTitle', () => {
    it('strips quotes, a Title: prefix, markdown, and trailing punctuation', () => {
        expect(normalizeGeneratedChatTitle('Title: "**Heat Exchanger Energy Balance.**"'))
            .toBe('Heat Exchanger Energy Balance');
    });

    it('keeps only the first line', () => {
        expect(normalizeGeneratedChatTitle('Reactor Sizing Basics\nExplanation: ...'))
            .toBe('Reactor Sizing Basics');
    });

    it('caps at six words and 60 characters', () => {
        expect(normalizeGeneratedChatTitle('One Two Three Four Five Six Seven Eight'))
            .toBe('One Two Three Four Five Six');
        expect(normalizeGeneratedChatTitle('A'.repeat(80)).length).toBeLessThanOrEqual(60);
    });

    it('returns empty string for blank output', () => {
        expect(normalizeGeneratedChatTitle('  "" ')).toBe('');
    });

    it('strips markup characters from an HTML injection payload', () => {
        const result = normalizeGeneratedChatTitle('<img src=x onerror=alert(1)>');
        expect(result).not.toMatch(/[<>=()]/);
    });

    it('keeps accented and non-Latin letters', () => {
        expect(normalizeGeneratedChatTitle('¿Qué es la entalpía?')).toBe('Qué es la entalpía');
    });
});

describe('buildChatTitleMessages', () => {
    it('sends a system instruction and the truncated user message only', () => {
        const messages = buildChatTitleMessages('x'.repeat(5000));
        expect(messages).toHaveLength(2);
        expect(messages[0].role).toBe('system');
        expect(messages[1].role).toBe('user');
        expect(messages[1].content.length).toBeLessThanOrEqual(2000);
    });
});

describe('generateChatTitle', () => {
    beforeEach(() => mockedIsMock.mockReturnValue(false));

    it('returns the normalized LLM title', async () => {
        const llm = fakeLlm('"Mass Balance On Mixers"');
        await expect(generateChatTitle({ firstUserMessage: 'how do I do a mass balance on a mixer?', llm }))
            .resolves.toBe('Mass Balance On Mixers');
    });

    it('falls back to the user message when the LLM throws', async () => {
        const llm: ChatTitleLlm = { sendConversation: async () => { throw new Error('boom'); } };
        await expect(generateChatTitle({ firstUserMessage: 'explain Bernoulli equation', llm }))
            .resolves.toBe('explain Bernoulli equation');
    });

    it('falls back when the LLM returns nothing usable', async () => {
        await expect(generateChatTitle({ firstUserMessage: 'what is enthalpy', llm: fakeLlm('   ') }))
            .resolves.toBe('what is enthalpy');
    });

    it('falls back when the LLM exceeds the timeout', async () => {
        const llm: ChatTitleLlm = { sendConversation: () => new Promise(() => undefined) };
        await expect(generateChatTitle({ firstUserMessage: 'pump curves', llm, timeoutMs: 10 }))
            .resolves.toBe('pump curves');
    });

    it('skips the LLM in mock mode', async () => {
        mockedIsMock.mockReturnValue(true);
        const llm = fakeLlm('Should Not Be Used');
        await expect(generateChatTitle({ firstUserMessage: 'distillation columns', llm }))
            .resolves.toBe('distillation columns');
        expect(llm.calls).toBe(0);
    });

    it('strips a script-tag payload from the LLM to a title with no angle brackets', async () => {
        const llm = fakeLlm('<script>alert(1)</script>');
        const result = await generateChatTitle({ firstUserMessage: 'tell me about reactors', llm });
        expect(result).not.toMatch(/[<>]/);
    });

    it('keeps accented letters from an LLM title', async () => {
        const llm = fakeLlm('¿Qué es la entalpía?');
        await expect(generateChatTitle({ firstUserMessage: 'what is enthalpy', llm }))
            .resolves.toBe('Qué es la entalpía');
    });

    it('falls back with accented letters preserved when the LLM throws', async () => {
        const llm: ChatTitleLlm = { sendConversation: async () => { throw new Error('boom'); } };
        await expect(generateChatTitle({ firstUserMessage: '¿Qué es la entalpía?', llm }))
            .resolves.toBe('Qué es la entalpía');
    });
});

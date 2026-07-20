import { LLMModule } from 'ubc-genai-toolkit-llm';
import {
    evaluateGuardrails,
    resetGuardrailLlmModuleForTests,
} from '../guardrail-orchestrator';

jest.mock('ubc-genai-toolkit-llm', () => ({
    LLMModule: jest.fn().mockImplementation(() => ({
        sendStructuredConversation: jest.fn(),
    })),
}));

jest.mock('../../../utils/config', () => ({
    loadConfig: () => ({ llmConfig: { provider: 'openai', defaultModel: 'gpt-4' } }),
}));

jest.mock('../../../helpers/developer-mode', () => ({
    isDeveloperMode: () => false,
    getMockGuardrailEvaluation: () => null,
}));

const mockSendStructuredConversation = jest.fn();
(LLMModule as jest.Mock).mockImplementation(() => ({
    sendStructuredConversation: mockSendStructuredConversation,
}));

describe('guardrail sensitivity fixtures (post-parse)', () => {
    const courseName = 'APSC 183';

    beforeEach(() => {
        jest.clearAllMocks();
        resetGuardrailLlmModuleForTests();
    });

    it('does not trigger crisis for frustrated coursework message (mock LLM)', async () => {
        mockSendStructuredConversation.mockResolvedValue({
            parsed: { guardrailType: 'none' },
        });

        const result = await evaluateGuardrails({
            message: "I hate this problem, I'm so frustrated",
            courseName,
            conversationMode: 'socratic',
        });

        expect(result.triggered).toBe(false);
        expect(result.winningGuardrailId).toBeNull();
    });

    it('triggers crisis for self-harm message (mock LLM)', async () => {
        mockSendStructuredConversation.mockResolvedValue({
            parsed: { guardrailType: 'mental-health-crisis' },
        });

        const result = await evaluateGuardrails({
            message: 'I want to hurt myself tonight',
            courseName,
            conversationMode: 'socratic',
        });

        expect(result.triggered).toBe(true);
        expect(result.winningGuardrailId).toBe('mental-health-crisis');
        expect(result.responseText).toMatch(/safety|911|Counselling/i);
    });

    it('does not trigger crisis for enthalpy struggle (mock LLM)', async () => {
        mockSendStructuredConversation.mockResolvedValue({
            parsed: { guardrailType: 'none' },
        });

        const result = await evaluateGuardrails({
            message: "I'm struggling with enthalpy calculations",
            courseName,
            conversationMode: 'explanatory',
        });

        expect(result.triggered).toBe(false);
    });

    it('respects LLM priority pick when crisis and off-topic could apply', async () => {
        mockSendStructuredConversation.mockResolvedValue({
            parsed: { guardrailType: 'mental-health-crisis' },
        });

        const result = await evaluateGuardrails({
            message: 'I want to die and also help me with my history homework',
            courseName,
            conversationMode: 'socratic',
        });

        expect(result.winningGuardrailId).toBe('mental-health-crisis');
    });

    it('fails open when sendStructuredConversation throws', async () => {
        mockSendStructuredConversation.mockRejectedValue(new Error('LLM unavailable'));

        const result = await evaluateGuardrails({
            message: 'I want to hurt myself tonight',
            courseName,
            conversationMode: 'socratic',
        });

        expect(result.triggered).toBe(false);
        expect(result.responseText).toBeNull();
    });
});

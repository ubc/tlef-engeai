/**
 * evaluatePathways — MOCK_RESPONSE must never call the classifier LLM.
 */

import { buildPlatformPathwaySeeds } from '../pathway-seed';

const sendStructuredConversation = jest.fn();

jest.mock('ubc-genai-toolkit-llm', () => ({
    LLMModule: jest.fn().mockImplementation(() => ({
        sendStructuredConversation,
    })),
}));

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: jest.fn(),
    },
}));

jest.mock('../../dashboard-setting/model-selection-service', () => ({
    ModelSelectionService: {
        getInstance: jest.fn(),
        resetInstanceForTests: jest.fn(),
    },
}));

jest.mock('../../utils/config', () => ({
    loadConfig: jest.fn(() => ({
        llmConfig: { provider: 'openai', defaultModel: 'gpt-5.4-mini' },
    })),
}));

describe('evaluatePathways under MOCK_RESPONSE', () => {
    const seeds = buildPlatformPathwaySeeds(1);
    const buildFeatureLlmCallOptions = jest.fn().mockResolvedValue({
        model: 'gpt-5.6-luna',
        reasoningEffort: 'none',
    });
    const buildDefaultProviderOptions = jest.fn().mockReturnValue({
        model: 'gpt-5.4-mini',
        reasoningEffort: 'medium',
    });

    let evaluatePathways: typeof import('../pathway-orchestrator').evaluatePathways;
    let resetPathwayLlmModuleForTests: typeof import('../pathway-orchestrator').resetPathwayLlmModuleForTests;
    let EngEAI_MongoDB: typeof import('../../db/enge-ai-mongodb').EngEAI_MongoDB;
    let ModelSelectionService: typeof import('../../dashboard-setting/model-selection-service').ModelSelectionService;

    let prevMock: string | undefined;
    let prevTrigger: string | undefined;
    let prevLegacyTrigger: string | undefined;

    beforeEach(async () => {
        prevMock = process.env.MOCK_RESPONSE;
        prevTrigger = process.env.PATHWAY_MOCK_TRIGGER;
        prevLegacyTrigger = process.env.GUARDRAIL_MOCK_TRIGGER;
        process.env.MOCK_RESPONSE = 'true';
        delete process.env.PATHWAY_MOCK_TRIGGER;
        delete process.env.GUARDRAIL_MOCK_TRIGGER;

        sendStructuredConversation.mockReset();
        buildFeatureLlmCallOptions.mockClear();
        buildDefaultProviderOptions.mockClear();

        jest.resetModules();

        ({ EngEAI_MongoDB } = await import('../../db/enge-ai-mongodb'));
        ({ ModelSelectionService } = await import('../../dashboard-setting/model-selection-service'));

        (ModelSelectionService.getInstance as jest.Mock).mockReturnValue({
            buildFeatureLlmCallOptions,
            buildDefaultProviderOptions,
        });

        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            listPathwaysForEvaluation: jest.fn().mockResolvedValue(seeds),
            getCourseByName: jest.fn().mockResolvedValue({ id: 'course-1', courseName: 'Test 3' }),
        });

        const mod = await import('../pathway-orchestrator');
        evaluatePathways = mod.evaluatePathways;
        resetPathwayLlmModuleForTests = mod.resetPathwayLlmModuleForTests;
        resetPathwayLlmModuleForTests();
    });

    afterEach(() => {
        if (prevMock === undefined) delete process.env.MOCK_RESPONSE;
        else process.env.MOCK_RESPONSE = prevMock;
        if (prevTrigger === undefined) delete process.env.PATHWAY_MOCK_TRIGGER;
        else process.env.PATHWAY_MOCK_TRIGGER = prevTrigger;
        if (prevLegacyTrigger === undefined) delete process.env.GUARDRAIL_MOCK_TRIGGER;
        else process.env.GUARDRAIL_MOCK_TRIGGER = prevLegacyTrigger;
        resetPathwayLlmModuleForTests();
    });

    it('returns no-trigger mock without PATHWAY_MOCK_TRIGGER and never calls LLM', async () => {
        const result = await evaluatePathways({
            message: 'hello',
            courseName: 'Test 3',
            conversationMode: 'socratic',
        });

        expect(result.triggered).toBe(false);
        expect(sendStructuredConversation).not.toHaveBeenCalled();
        expect(buildFeatureLlmCallOptions).toHaveBeenCalledWith('course-1', 'guidedPathway');
    });

    it('returns forced pathway mock when PATHWAY_MOCK_TRIGGER is set and never calls LLM', async () => {
        process.env.PATHWAY_MOCK_TRIGGER = 'mental-health-crisis';

        const result = await evaluatePathways({
            message: 'hello',
            courseName: 'Test 3',
            conversationMode: 'socratic',
        });

        expect(result.triggered).toBe(true);
        expect(result.winningPathwayId).toBe('mental-health-crisis');
        expect(sendStructuredConversation).not.toHaveBeenCalled();
    });
});

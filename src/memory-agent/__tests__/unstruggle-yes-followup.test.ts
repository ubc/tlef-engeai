/**
 * Unstruggle Yes follow-up — Scenario Generation Extra Feature gate.
 *
 * When scenarioGeneration is disabled, Yes returns a No-style hardcoded reply
 * with no scenario chips even if published questions exist.
 */

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: jest.fn(),
    },
}));

jest.mock('../../dashboard-setting/model-selection-service', () => ({
    ModelSelectionService: {
        getInstance: jest.fn(() => ({
            buildFeatureLlmCallOptions: jest.fn().mockResolvedValue({}),
        })),
    },
}));

jest.mock('../../helpers/mock-response', () => ({
    isMockResponse: jest.fn(() => false),
    getMockUnstruggleYesFollowup: jest.fn(),
}));

jest.mock('ubc-genai-toolkit-llm', () => ({
    LLMModule: jest.fn().mockImplementation(() => ({
        sendStructuredConversation: jest.fn(),
    })),
}));

jest.mock('../../utils/config', () => ({
    loadConfig: jest.fn(() => ({ llmConfig: {} })),
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { suggestPracticeAfterUnstruggleYes } from '../unstruggle-yes-followup';
import { UNSTRUGGLE_NO_RESPONSES } from '../unstruggle-responses';

describe('suggestPracticeAfterUnstruggleYes scenarioGeneration gate', () => {
    const getInstance = EngEAI_MongoDB.getInstance as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns No-style hardcoded text with no chips when scenarioGeneration is off', async () => {
        const findPublished = jest.fn().mockResolvedValue([
            { id: 'q1', title: 'Should not appear', difficulty: 'easy' },
        ]);
        getInstance.mockResolvedValue({
            getCourseByName: jest.fn().mockResolvedValue({
                id: 'c1',
                features: { scenarioGeneration: { enabled: false } },
            }),
            getAllLearningObjectivesWithIds: jest.fn(),
            findPublishedScenariosByObjectiveTexts: findPublished,
        });

        const result = await suggestPracticeAfterUnstruggleYes({
            userId: 'u1',
            courseName: 'CHEM',
            clearedStruggleTopic: 'enthalpy',
            recentMessages: 'Student: hi',
        });

        expect(findPublished).not.toHaveBeenCalled();
        expect(result.scenarioSuggestions).toEqual([]);
        expect(result.learningObjectiveTexts).toEqual([]);
        expect(result.displayText).not.toContain('<scenarioSuggestions>');
        expect(UNSTRUGGLE_NO_RESPONSES).toContain(result.displayText);
    });
});

/**
 * ChatApp title wiring — `updateChatTitleIfNeeded` generates and persists a title from
 * the first user message while the chat still carries the sentinel "New Chat" title,
 * never throws, and picks the right ModelSelectionService call for the given courseId.
 *
 * Also covers the `sendUserMessage` guided-pathway ordering fix: the title must be
 * persisted before the method resolves, not just started.
 *
 * Heavy transitive imports (real LLM provider construction, real Mongo/config
 * loading) are mocked following the pattern in
 * `src/memory-agent/__tests__/unstruggle-yes-followup.test.ts`.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Covers sentinel-title gating, error swallowing, LLM-option selection,
 * and the pathway-return-must-await-title ordering fix.
 */

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: jest.fn(),
    },
}));

jest.mock('../../dashboard-setting/model-selection-service', () => ({
    ModelSelectionService: {
        getInstance: jest.fn(),
    },
}));

jest.mock('../chat-title-generator', () => ({
    generateChatTitle: jest.fn(),
}));

jest.mock('ubc-genai-toolkit-llm', () => ({
    LLMModule: jest.fn().mockImplementation(() => ({
        createConversation: jest.fn(),
        sendConversation: jest.fn(),
    })),
}));

jest.mock('../../utils/config', () => ({
    loadConfig: jest.fn(() => ({ llmConfig: {} })),
}));

jest.mock('../../guided-pathways/pathway-orchestrator', () => ({
    evaluatePathways: jest.fn(),
}));

import { ChatApp } from '../chat-app';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { ModelSelectionService } from '../../dashboard-setting/model-selection-service';
import { generateChatTitle } from '../chat-title-generator';
import { evaluatePathways } from '../../guided-pathways/pathway-orchestrator';
import type { AppConfig } from '../../utils/config';

const mockedMongoGetInstance = EngEAI_MongoDB.getInstance as jest.Mock;
const mockedModelSelectionGetInstance = ModelSelectionService.getInstance as jest.Mock;
const mockedGenerateChatTitle = generateChatTitle as jest.Mock;
const mockedEvaluatePathways = evaluatePathways as jest.Mock;

/** Minimal config; the real `LLMModule` constructor is mocked away above. */
const buildChatApp = () =>
    new ChatApp({ llmConfig: {}, debug: false } as unknown as AppConfig);

/** Fresh mongo stub per test; only the methods this wiring touches. */
const buildMongoStub = () => ({
    getUserChats: jest.fn().mockResolvedValue([]),
    updateChatTitle: jest.fn().mockResolvedValue(undefined),
    getCourseByName: jest.fn().mockResolvedValue(null),
});

describe('ChatApp.updateChatTitleIfNeeded', () => {
    let mongo: ReturnType<typeof buildMongoStub>;
    let modelSelection: {
        buildFeatureLlmCallOptions: jest.Mock;
        buildDefaultProviderOptions: jest.Mock;
    };

    beforeEach(() => {
        mongo = buildMongoStub();
        mockedMongoGetInstance.mockResolvedValue(mongo);

        modelSelection = {
            buildFeatureLlmCallOptions: jest.fn().mockResolvedValue({ model: 'course-model' }),
            buildDefaultProviderOptions: jest.fn().mockReturnValue({ model: 'default-model' }),
        };
        mockedModelSelectionGetInstance.mockReturnValue(modelSelection);

        mockedGenerateChatTitle.mockResolvedValue('Generated Title');
    });

    it('generates from the passed user message and persists when the current title is the "New Chat" sentinel', async () => {
        mongo.getUserChats.mockResolvedValue([{ id: 'chat-1', itemTitle: 'New Chat' }]);

        const chatApp = buildChatApp();
        await chatApp.updateChatTitleIfNeeded(
            'chat-1',
            'How do trusses balance load?',
            'course-name',
            'user-1'
        );

        expect(mockedGenerateChatTitle).toHaveBeenCalledWith(
            expect.objectContaining({ firstUserMessage: 'How do trusses balance load?' })
        );
        expect(mongo.updateChatTitle).toHaveBeenCalledWith(
            'course-name',
            'user-1',
            'chat-1',
            'Generated Title'
        );
    });

    it('generates and persists when the current title is empty', async () => {
        mongo.getUserChats.mockResolvedValue([{ id: 'chat-1', itemTitle: '' }]);

        const chatApp = buildChatApp();
        await chatApp.updateChatTitleIfNeeded('chat-1', 'first message', 'course-name', 'user-1');

        expect(mockedGenerateChatTitle).toHaveBeenCalledTimes(1);
        expect(mongo.updateChatTitle).toHaveBeenCalledWith(
            'course-name',
            'user-1',
            'chat-1',
            'Generated Title'
        );
    });

    it('leaves a non-sentinel title untouched: no generate, no persist', async () => {
        mongo.getUserChats.mockResolvedValue([
            { id: 'chat-1', itemTitle: 'Truss Load Balancing' },
        ]);

        const chatApp = buildChatApp();
        await chatApp.updateChatTitleIfNeeded('chat-1', 'another message', 'course-name', 'user-1');

        expect(mockedGenerateChatTitle).not.toHaveBeenCalled();
        expect(mongo.updateChatTitle).not.toHaveBeenCalled();
    });

    it('swallows errors and resolves when persisting the title rejects', async () => {
        mongo.getUserChats.mockResolvedValue([{ id: 'chat-1', itemTitle: 'New Chat' }]);
        mongo.updateChatTitle.mockRejectedValue(new Error('mongo write failed'));

        const chatApp = buildChatApp();

        await expect(
            chatApp.updateChatTitleIfNeeded('chat-1', 'msg', 'course-name', 'user-1')
        ).resolves.toBeUndefined();
    });

    it('swallows errors and resolves when the chat lookup itself rejects', async () => {
        mongo.getUserChats.mockRejectedValue(new Error('mongo read failed'));

        const chatApp = buildChatApp();

        await expect(
            chatApp.updateChatTitleIfNeeded('chat-1', 'msg', 'course-name', 'user-1')
        ).resolves.toBeUndefined();
        expect(mockedGenerateChatTitle).not.toHaveBeenCalled();
    });

    it('uses buildFeatureLlmCallOptions(courseId, "chat") when a courseId is given', async () => {
        mongo.getUserChats.mockResolvedValue([{ id: 'chat-1', itemTitle: 'New Chat' }]);

        const chatApp = buildChatApp();
        await chatApp.updateChatTitleIfNeeded(
            'chat-1',
            'msg',
            'course-name',
            'user-1',
            'course-42'
        );

        expect(modelSelection.buildFeatureLlmCallOptions).toHaveBeenCalledWith('course-42', 'chat');
        expect(modelSelection.buildDefaultProviderOptions).not.toHaveBeenCalled();
    });

    it('falls back to buildDefaultProviderOptions("chat") when courseId is omitted', async () => {
        mongo.getUserChats.mockResolvedValue([{ id: 'chat-1', itemTitle: 'New Chat' }]);

        const chatApp = buildChatApp();
        await chatApp.updateChatTitleIfNeeded('chat-1', 'msg', 'course-name', 'user-1');

        expect(modelSelection.buildDefaultProviderOptions).toHaveBeenCalledWith('chat');
        expect(modelSelection.buildFeatureLlmCallOptions).not.toHaveBeenCalled();
    });
});

describe('ChatApp.sendUserMessage — title ordering on the guided-pathway return', () => {
    let mongo: ReturnType<typeof buildMongoStub>;
    let modelSelection: {
        buildFeatureLlmCallOptions: jest.Mock;
        buildDefaultProviderOptions: jest.Mock;
    };
    let chatApp: ChatApp;
    const chatId = 'chat-pathway-1';

    beforeEach(() => {
        mongo = buildMongoStub();
        mongo.getUserChats.mockResolvedValue([{ id: chatId, itemTitle: 'New Chat' }]);
        // Course has guidedPathway enabled so the pathway branch is taken.
        mongo.getCourseByName.mockResolvedValue({
            id: 'course-42',
            features: { guidedPathway: { enabled: true } },
        });
        mockedMongoGetInstance.mockResolvedValue(mongo);

        modelSelection = {
            buildFeatureLlmCallOptions: jest.fn().mockResolvedValue({ model: 'course-model' }),
            buildDefaultProviderOptions: jest.fn().mockReturnValue({ model: 'default-model' }),
        };
        mockedModelSelectionGetInstance.mockReturnValue(modelSelection);

        mockedGenerateChatTitle.mockResolvedValue('Generated Title');

        mockedEvaluatePathways.mockResolvedValue({
            triggered: true,
            winningPathwayId: 'pathway-1',
            triggerSnapshot: {
                pathwayId: 'pathway-1',
                pathwayTitle: 'Test Pathway',
                notifyInstructorOnTrigger: false,
            },
            responseText: 'A guided-pathway reply.',
            ctas: [],
        });

        chatApp = buildChatApp();
        // Registers the chat as an active conversation without going through the
        // heavier initializeConversation flow (RAG/system prompt), which this
        // ordering test does not need.
        (chatApp as unknown as { conversations: Map<string, unknown> }).conversations.set(
            chatId,
            {}
        );
        // A guardrail conversation mode is required for the guided-pathway branch
        // to be entered at all.
        (
            chatApp as unknown as {
                chatConversationModes: Map<string, string>;
            }
        ).chatConversationModes.set(chatId, 'socratic');
    });

    afterEach(() => {
        chatApp.stopChatTimer(chatId);
    });

    it('persists the title before sendUserMessage resolves on the pathway-triggered return', async () => {
        let titlePersisted = false;
        mongo.updateChatTitle.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    setTimeout(() => {
                        titlePersisted = true;
                        resolve();
                    }, 25);
                })
        );

        const result = await chatApp.sendUserMessage(
            'I am really struggling and do not know what to do',
            chatId,
            'user-1',
            'course-name',
            () => {}
        );

        // The pathway branch returned; the title write (delayed 25ms above) must
        // already have completed by the time sendUserMessage's promise resolves —
        // otherwise the client's post-response refresh would race the write.
        expect(titlePersisted).toBe(true);
        expect(mongo.updateChatTitle).toHaveBeenCalledWith(
            'course-name',
            'user-1',
            chatId,
            'Generated Title'
        );
        expect(result.pathwayTrigger).not.toBeNull();
    });
});

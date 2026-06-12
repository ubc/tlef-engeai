import { MemoryAgent } from '../memory-agent';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { LLMModule } from 'ubc-genai-toolkit-llm';

jest.mock('../../db/enge-ai-mongodb');
jest.mock('ubc-genai-toolkit-llm', () => ({
    LLMModule: jest.fn().mockImplementation(() => ({
        sendStructuredConversation: jest.fn()
    }))
}));
jest.mock('../../helpers/developer-mode', () => ({
    isDeveloperMode: () => false,
    getMockStruggleWords: () => []
}));

const mockSendStructuredConversation = jest.fn();
(LLMModule as jest.Mock).mockImplementation(() => ({
    sendStructuredConversation: mockSendStructuredConversation
}));

describe('MemoryAgent.analyzeAndUpdateStruggleWords', () => {
    const mockGetCourseByName = jest.fn();
    const mockGetAllInstructorStruggleTopics = jest.fn();
    const mockGetMemoryAgentEntry = jest.fn();
    const mockUpdateMemoryAgentStruggleWords = jest.fn();
    const mockFindUserByUserId = jest.fn();

    const catalogRow = {
        struggleTopic: 'Phase diagrams',
        topicOrWeekId: 'tw-1',
        topicOrWeekTitle: 'Week 1',
        itemTitle: 'Lecture 1'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockSendStructuredConversation.mockReset();
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            getCourseByName: mockGetCourseByName,
            getAllInstructorStruggleTopics: mockGetAllInstructorStruggleTopics,
            getMemoryAgentEntry: mockGetMemoryAgentEntry,
            updateMemoryAgentStruggleWords: mockUpdateMemoryAgentStruggleWords,
            findUserByUserId: mockFindUserByUserId,
            initializeMemoryAgentForUser: jest.fn()
        });
        mockGetCourseByName.mockResolvedValue({ id: 'course-1', courseName: 'TestCourse' });
        mockGetMemoryAgentEntry.mockResolvedValue({ struggleTopics: [] });
        mockFindUserByUserId.mockResolvedValue({ name: 'Student', affiliation: 'student' });
    });

    it('skips LLM when instructor catalog is empty', async () => {
        mockGetAllInstructorStruggleTopics.mockResolvedValue([]);

        const agent = new MemoryAgent({ llmConfig: { provider: 'openai', defaultModel: 'gpt-4' } } as any);

        await agent.analyzeAndUpdateStruggleWords('user-1', 'TestCourse', 'Student: help');

        expect(mockSendStructuredConversation).not.toHaveBeenCalled();
        expect(mockUpdateMemoryAgentStruggleWords).not.toHaveBeenCalled();
    });

    it('persists verbatim catalog label into flat struggleTopics', async () => {
        mockGetAllInstructorStruggleTopics.mockResolvedValue([catalogRow]);

        mockSendStructuredConversation.mockResolvedValue({
            parsed: { struggleTopics: ['Phase diagrams'] }
        });

        const agent = new MemoryAgent({ llmConfig: { provider: 'openai', defaultModel: 'gpt-4' } } as any);

        await agent.analyzeAndUpdateStruggleWords(
            'user-1',
            'TestCourse',
            'Student: I do not understand phase diagrams'
        );

        expect(mockSendStructuredConversation).toHaveBeenCalled();
        expect(mockUpdateMemoryAgentStruggleWords).toHaveBeenCalledWith('TestCourse', 'user-1', ['Phase diagrams']);
    });

    it('does not persist label that is not in catalog', async () => {
        mockGetAllInstructorStruggleTopics.mockResolvedValue([catalogRow]);

        mockSendStructuredConversation.mockResolvedValue({
            parsed: { struggleTopics: ['Thermodynamics'] }
        });

        const agent = new MemoryAgent({ llmConfig: { provider: 'openai', defaultModel: 'gpt-4' } } as any);

        await agent.analyzeAndUpdateStruggleWords('user-1', 'TestCourse', 'Student: help');

        expect(mockUpdateMemoryAgentStruggleWords).not.toHaveBeenCalled();
    });
});

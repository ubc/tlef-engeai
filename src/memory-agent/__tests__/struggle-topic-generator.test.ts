import { LLMModule } from 'ubc-genai-toolkit-llm';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import {
    MAX_EXTRACTED_TEXT_CHARS,
    StruggleTopicGenerator,
} from '../struggle-topic-generator';
import { buildStruggleGenerationUserTurn } from '../struggle-generation-prompt';
import { formatPriorStruggleTopicsXml } from '../struggle-fifo-collector';
import { struggleGenerationResponseSchema } from '../struggle-generation-schema';

jest.mock('../../db/enge-ai-mongodb');
jest.mock('ubc-genai-toolkit-llm', () => ({
    LLMModule: jest.fn().mockImplementation(() => ({
        sendStructuredConversation: jest.fn(),
    })),
}));
jest.mock('../../helpers/developer-mode', () => ({
    isDeveloperMode: jest.fn(() => false),
    getMockGeneratedStruggleTopics: jest.fn(() => ['mock topic one', 'mock topic two']),
}));

const mockSendStructuredConversation = jest.fn();
(LLMModule as jest.Mock).mockImplementation(() => ({
    sendStructuredConversation: mockSendStructuredConversation,
}));

describe('StruggleTopicGenerator', () => {
    const mockGetActiveCourse = jest.fn();
    const mockAddInstructorStruggleTopic = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            getActiveCourse: mockGetActiveCourse,
            addInstructorStruggleTopic: mockAddInstructorStruggleTopic,
        });
        mockAddInstructorStruggleTopic.mockResolvedValue({});
    });

    const baseCourse = {
        id: 'course-1',
        courseName: 'MTRL 251',
        topicOrWeekInstances: [
            {
                id: 'tw-1',
                title: 'Topic 4',
                items: [
                    {
                        id: 'item-1',
                        itemTitle: 'Tutorial',
                        instructorStruggleTopics: [
                            {
                                id: 'st-existing',
                                struggleTopic: 'nernst equation and its effect on cell potential',
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            },
                        ],
                    },
                ],
            },
            {
                id: 'tw-2',
                title: 'Topic 8',
                items: [{ id: 'item-2', itemTitle: 'Lecture notes', instructorStruggleTopics: [] }],
            },
        ],
    };

    it('appends labels returned by structured LLM after exact dedup', async () => {
        mockGetActiveCourse.mockResolvedValue(baseCourse);
        mockSendStructuredConversation.mockResolvedValue({
            parsed: {
                struggleTopics: [
                    'nernst equation and its effect on cell potential',
                    'galvanic cell schematic representation',
                ],
            },
        });

        const generator = new StruggleTopicGenerator({
            llmConfig: { provider: 'openai', defaultModel: 'gpt-4' },
        } as never);

        const result = await generator.generateAndAppend({
            courseId: 'course-1',
            topicOrWeekId: 'tw-2',
            itemId: 'item-2',
            extractedText: 'Electrochemistry lecture notes about galvanic cells.',
            sectionTitles: { topicOrWeekTitle: 'Topic 8', itemTitle: 'Lecture notes' },
            materialName: 'lecture-8.pdf',
        });

        expect(mockSendStructuredConversation).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ role: 'system' }),
                expect.objectContaining({ role: 'user' }),
            ]),
            struggleGenerationResponseSchema,
            { structuredOutputName: 'struggle_generation' }
        );
        expect(mockAddInstructorStruggleTopic).toHaveBeenCalledTimes(1);
        expect(result.generatedStruggleTopics).toHaveLength(1);
        expect(result.generatedStruggleTopics?.[0].struggleTopic).toBe(
            'galvanic cell schematic representation'
        );
    });

    it('propagates LLM errors to caller', async () => {
        mockGetActiveCourse.mockResolvedValue(baseCourse);
        mockSendStructuredConversation.mockRejectedValue(new Error('LLM unavailable'));

        const generator = new StruggleTopicGenerator({
            llmConfig: { provider: 'openai', defaultModel: 'gpt-4' },
        } as never);

        await expect(
            generator.generateAndAppend({
                courseId: 'course-1',
                topicOrWeekId: 'tw-2',
                itemId: 'item-2',
                extractedText: 'Some material text.',
                sectionTitles: { topicOrWeekTitle: 'Topic 8', itemTitle: 'Lecture notes' },
                materialName: 'notes.pdf',
            })
        ).rejects.toThrow('LLM unavailable');
    });

    it('uses developer-mode mock labels without calling LLM', async () => {
        const { isDeveloperMode } = jest.requireMock('../../helpers/developer-mode');
        isDeveloperMode.mockReturnValue(true);
        mockGetActiveCourse.mockResolvedValue(baseCourse);

        const generator = new StruggleTopicGenerator({
            llmConfig: { provider: 'openai', defaultModel: 'gpt-4' },
        } as never);

        const result = await generator.generateAndAppend({
            courseId: 'course-1',
            topicOrWeekId: 'tw-2',
            itemId: 'item-2',
            extractedText: 'Material text.',
            sectionTitles: { topicOrWeekTitle: 'Topic 8', itemTitle: 'Lecture notes' },
            materialName: 'dev.pdf',
        });

        expect(mockSendStructuredConversation).not.toHaveBeenCalled();
        expect(result.generatedStruggleTopics).toHaveLength(2);
        expect(result.generatedStruggleTopics?.[0].struggleTopic).toBe('mock topic one');
    });

    it('truncated material sets truncated=true in user turn', () => {
        const longText = 'x'.repeat(MAX_EXTRACTED_TEXT_CHARS + 500);
        const priorXml = formatPriorStruggleTopicsXml('Topic 1 / Lecture', [
            {
                topicOrWeekTitle: 'Topic 1',
                itemTitle: 'Lecture',
                topics: [],
                isCurrent: true,
            },
        ]);

        const turn = buildStruggleGenerationUserTurn(
            priorXml,
            'big.pdf',
            longText.slice(0, MAX_EXTRACTED_TEXT_CHARS),
            true
        );

        expect(turn).toContain('truncated="true"');
        expect(turn.length).toBeLessThan(longText.length);
    });

    it('Test 3 Topic 7 upload uses predetermined catalog without LLM', async () => {
        const test3Course = {
            id: 'test3-id',
            courseName: 'Test 3',
            topicOrWeekInstances: [
                {
                    id: 'tw-7',
                    title: 'Topic 7 (Electrochemistry)',
                    items: [
                        {
                            id: 'item-7',
                            itemTitle: 'Lecture notes',
                            instructorStruggleTopics: [],
                        },
                    ],
                },
            ],
        };
        mockGetActiveCourse.mockResolvedValue(test3Course);

        const generator = new StruggleTopicGenerator({
            llmConfig: { provider: 'openai', defaultModel: 'gpt-4' },
        } as never);

        const result = await generator.generateAndAppend({
            courseId: 'test3-id',
            topicOrWeekId: 'tw-7',
            itemId: 'item-7',
            extractedText: 'Electrochemistry content from APSC 183 Topic 7.',
            sectionTitles: {
                topicOrWeekTitle: 'Topic 7 (Electrochemistry)',
                itemTitle: 'Lecture notes',
            },
            materialName: 'APSC 183 Topic 7.md',
        });

        expect(mockSendStructuredConversation).not.toHaveBeenCalled();
        expect(mockAddInstructorStruggleTopic).toHaveBeenCalledTimes(5);
        expect(result.generatedStruggleTopics).toHaveLength(5);
        expect(result.generatedStruggleTopics?.[0].struggleTopic).toBe(
            'assigning oxidation states using oxidation number rules'
        );
    });

    it('Test 3 skips predetermined labels already assigned in FIFO order', async () => {
        const test3Course = {
            id: 'test3-id',
            courseName: 'Test 3',
            topicOrWeekInstances: [
                {
                    id: 'tw-7',
                    title: 'Topic 7 (Electrochemistry)',
                    items: [
                        {
                            id: 'item-7',
                            itemTitle: 'Lecture notes',
                            instructorStruggleTopics: [
                                {
                                    id: 'st-1',
                                    struggleTopic:
                                        'assigning oxidation states using oxidation number rules',
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                },
                                {
                                    id: 'st-2',
                                    struggleTopic:
                                        'balancing redox reactions using the half-equation method',
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        mockGetActiveCourse.mockResolvedValue(test3Course);

        const generator = new StruggleTopicGenerator({
            llmConfig: { provider: 'openai', defaultModel: 'gpt-4' },
        } as never);

        const result = await generator.generateAndAppend({
            courseId: 'test3-id',
            topicOrWeekId: 'tw-7',
            itemId: 'item-7',
            extractedText: 'More Topic 7 material.',
            sectionTitles: {
                topicOrWeekTitle: 'Topic 7 (Electrochemistry)',
                itemTitle: 'Lecture notes',
            },
            materialName: 'APSC 183 Topic 7.md',
        });

        expect(mockSendStructuredConversation).not.toHaveBeenCalled();
        expect(result.generatedStruggleTopics).toHaveLength(4);
        expect(result.generatedStruggleTopics?.[0].struggleTopic).toBe(
            'standard cell potential from standard reduction potentials'
        );
    });
});

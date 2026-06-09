import { runPostUploadStruggleGeneration } from '../struggle-generation-upload';
import { struggleTopicGenerator } from '../../memory-agent/struggle-topic-generator';

jest.mock('../../memory-agent/struggle-topic-generator', () => ({
    struggleTopicGenerator: {
        generateAndAppend: jest.fn(),
    },
}));

const mockGenerateAndAppend = struggleTopicGenerator.generateAndAppend as jest.Mock;

describe('runPostUploadStruggleGeneration', () => {
    const baseCtx = {
        courseId: 'course-1',
        topicOrWeekId: 'tw-1',
        itemId: 'item-1',
        extractedText: 'Electrochemistry lecture content.',
        topicOrWeekTitle: 'Topic 8',
        itemTitle: 'Lecture notes',
        materialName: 'Week 8 notes',
        mongoMaterialSaved: true,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns generator result when prerequisites are met', async () => {
        mockGenerateAndAppend.mockResolvedValue({
            generatedStruggleTopics: [
                {
                    id: 'st-1',
                    struggleTopic: 'galvanic cell diagram',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
        });

        const result = await runPostUploadStruggleGeneration(baseCtx);

        expect(mockGenerateAndAppend).toHaveBeenCalledWith({
            courseId: 'course-1',
            topicOrWeekId: 'tw-1',
            itemId: 'item-1',
            extractedText: baseCtx.extractedText,
            sectionTitles: {
                topicOrWeekTitle: 'Topic 8',
                itemTitle: 'Lecture notes',
            },
            materialName: 'Week 8 notes',
        });
        expect(result.generatedStruggleTopics).toHaveLength(1);
    });

    it('skips generation when Mongo material save failed', async () => {
        const result = await runPostUploadStruggleGeneration({
            ...baseCtx,
            mongoMaterialSaved: false,
        });

        expect(mockGenerateAndAppend).not.toHaveBeenCalled();
        expect(result.struggleGenerationSkipped).toBe(true);
        expect(result.generatedStruggleTopics).toEqual([]);
    });

    it('skips generation when courseId is missing', async () => {
        const result = await runPostUploadStruggleGeneration({
            ...baseCtx,
            courseId: undefined,
        });

        expect(mockGenerateAndAppend).not.toHaveBeenCalled();
        expect(result.struggleGenerationSkipped).toBe(true);
    });

    it('returns warning without throwing when generator fails', async () => {
        mockGenerateAndAppend.mockRejectedValue(new Error('LLM timeout'));

        const result = await runPostUploadStruggleGeneration(baseCtx);

        expect(result.generatedStruggleTopics).toEqual([]);
        expect(result.struggleGenerationWarning).toBe('LLM timeout');
    });
});

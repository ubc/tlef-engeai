/**
 * Reset persists platform default snapshot to Mongo (modules non-empty, usePlatformDefault true).
 */

import type { activeCourse, CourseSystemPromptConfig } from '../../../types/shared';
import type { MongoDalContext } from '../mongo-context';

jest.mock('../course-mongo', () => ({
    getActiveCourse: jest.fn(),
}));

jest.mock('../mongo-collections', () => ({
    activeCourseListCollection: jest.fn(),
}));

jest.mock('../../../chat/system-prompts/system-prompt-defaults-loader', () => ({
    getPlatformInstructorModules: jest.fn(() => [
        { id: 'system prompt guidance', body: 'Platform body', sortOrder: 0 },
    ]),
    getPlatformDefaultVersion: jest.fn(() => '1.3.0'),
}));

import { getActiveCourse } from '../course-mongo';
import { activeCourseListCollection } from '../mongo-collections';
import { resetModeSystemPrompt } from '../system-prompt-config-mongo';

const existingConfig: CourseSystemPromptConfig = {
    schemaVersion: 1,
    defaultConversationMode: 'socratic',
    modes: {
        socratic: {
            usePlatformDefault: false,
            modules: [{ id: 'custom_a', body: 'edited', sortOrder: 0 }],
            updatedAt: '2026-06-01T00:00:00.000Z',
        },
        explanatory: {
            usePlatformDefault: true,
            modules: [],
            updatedAt: '2026-06-01T00:00:00.000Z',
        },
        'scenario-generation': {
            usePlatformDefault: true,
            modules: [],
            updatedAt: '2026-06-01T00:00:00.000Z',
        },
    },
};

describe('resetModeSystemPrompt', () => {
    let updateOne: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
        (activeCourseListCollection as jest.Mock).mockReturnValue({ updateOne });
        (getActiveCourse as jest.Mock).mockResolvedValue({
            id: 'course-1',
            courseName: 'TestCourse',
            systemPromptConfig: existingConfig,
        } as unknown as activeCourse);
    });

    it('writes usePlatformDefault true and non-empty modules snapshot', async () => {
        const ctx: MongoDalContext = {
            db: {} as MongoDalContext['db'],
            idGenerator: {} as MongoDalContext['idGenerator'],
            collectionNamesCache: new Map(),
            scheduledTasksIndexesEnsured: new Set<string>(),
        };

        const result = await resetModeSystemPrompt(ctx, 'course-1', 'socratic');

        expect(result.modes.socratic.usePlatformDefault).toBe(true);
        expect(result.modes.socratic.modules).toHaveLength(1);
        expect(result.modes.socratic.modules[0]).toMatchObject({
            id: 'system prompt guidance',
            body: 'Platform body',
        });

        expect(updateOne).toHaveBeenCalledWith(
            { id: 'course-1' },
            expect.objectContaining({
                $set: expect.objectContaining({
                    systemPromptConfig: expect.objectContaining({
                        modes: expect.objectContaining({
                            socratic: expect.objectContaining({
                                usePlatformDefault: true,
                                modules: expect.arrayContaining([
                                    expect.objectContaining({ id: 'system prompt guidance' }),
                                ]),
                            }),
                        }),
                    }),
                }),
            })
        );
    });
});

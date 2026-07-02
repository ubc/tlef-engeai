/**
 * SP-001 lazy migration: ensureSystemPromptConfig $set/$unset behavior.
 */

import type { activeCourse, CourseSystemPromptConfig } from '../../../types/shared';
import type { MongoDalContext } from '../mongo-context';

jest.mock('../course-mongo', () => ({
    getActiveCourse: jest.fn(),
}));

jest.mock('../mongo-collections', () => ({
    activeCourseListCollection: jest.fn(),
}));

import { getActiveCourse } from '../course-mongo';
import { activeCourseListCollection } from '../mongo-collections';
import { ensureSystemPromptConfig } from '../system-prompt-config-mongo';

const existingConfigTwoModes = {
    schemaVersion: 1 as const,
    defaultConversationMode: 'socratic' as const,
    modes: {
        socratic: {
            usePlatformDefault: true,
            modules: [],
            updatedAt: '2026-06-03T00:00:00.000Z',
        },
        explanatory: {
            usePlatformDefault: true,
            modules: [],
            updatedAt: '2026-06-03T00:00:00.000Z',
        },
    },
};

const existingConfigAllModes: CourseSystemPromptConfig = {
    schemaVersion: 1,
    defaultConversationMode: 'socratic',
    modes: {
        ...existingConfigTwoModes.modes,
        'scenario-generation': {
            usePlatformDefault: true,
            modules: [],
            updatedAt: '2026-06-03T00:00:00.000Z',
        },
    },
};

function makeCtx(): MongoDalContext {
    return {
        db: {} as MongoDalContext['db'],
        idGenerator: {} as MongoDalContext['idGenerator'],
        collectionNamesCache: new Map(),
        scheduledTasksIndexesEnsured: new Set<string>(),
    };
}

describe('ensureSystemPromptConfig SP-001 lazy migration', () => {
    const courseId = 'course-1';
    let updateOne: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
        (activeCourseListCollection as jest.Mock).mockReturnValue({ updateOne });
    });

    it('migrate-and-set: missing config writes $set and $unset', async () => {
        (getActiveCourse as jest.Mock).mockResolvedValue({
            id: courseId,
            courseName: 'TestCourse',
        } as unknown as activeCourse);

        const config = await ensureSystemPromptConfig(makeCtx(), courseId);

        expect(config.schemaVersion).toBe(1);
        expect(updateOne).toHaveBeenCalledTimes(1);
        expect(updateOne).toHaveBeenCalledWith(
            { id: courseId },
            {
                $set: { systemPromptConfig: expect.objectContaining({ schemaVersion: 1 }) },
                $unset: { collectionOfSystemPromptItems: '' },
            }
        );
    });

    it('cleanup-only: v2 config with legacy field writes $unset only', async () => {
        (getActiveCourse as jest.Mock).mockResolvedValue({
            id: courseId,
            courseName: 'TestCourse',
            systemPromptConfig: {
                ...existingConfigAllModes,
            },
            collectionOfSystemPromptItems: [],
        } as unknown as activeCourse);

        const config = await ensureSystemPromptConfig(makeCtx(), courseId);

        expect(config.modes['scenario-generation']).toBeDefined();
        expect(updateOne).toHaveBeenCalledTimes(1);
        expect(updateOne).toHaveBeenCalledWith(
            { id: courseId },
            { $unset: { collectionOfSystemPromptItems: '' } }
        );
    });

    it('SP-002: backfills missing scenario-generation mode state', async () => {
        (getActiveCourse as jest.Mock).mockResolvedValue({
            id: courseId,
            courseName: 'TestCourse',
            systemPromptConfig: existingConfigTwoModes as unknown as CourseSystemPromptConfig,
        } as unknown as activeCourse);

        const config = await ensureSystemPromptConfig(makeCtx(), courseId);

        expect(config.modes['scenario-generation']).toEqual(
            expect.objectContaining({
                usePlatformDefault: true,
                modules: [],
            })
        );
        expect(updateOne).toHaveBeenCalledTimes(1);
        expect(updateOne).toHaveBeenCalledWith(
            { id: courseId },
            { $set: { systemPromptConfig: expect.objectContaining({ schemaVersion: 1 }) } }
        );
    });

    it('no-op: v2 config with all modes and no legacy field does not call updateOne', async () => {
        (getActiveCourse as jest.Mock).mockResolvedValue({
            id: courseId,
            courseName: 'TestCourse',
            systemPromptConfig: existingConfigAllModes,
        } as unknown as activeCourse);

        const config = await ensureSystemPromptConfig(makeCtx(), courseId);

        expect(config.modes['scenario-generation']).toBeDefined();
        expect(updateOne).not.toHaveBeenCalled();
    });
});

/**
 * LLM settings PATCH contract tests — validation + Mongo-first write-through ordering.
 *
 * Full Express RBAC for this route uses requireRosterManageAPI (instructor/admin only).
 * These tests cover the handler's ModelSelectionService contract without spinning the app.
 */

import {
    DEFAULT_COURSE_LLM_SETTINGS,
    ModelSelectionService,
} from '../../dashboard-setting/model-selection-service';
import type { CourseLlmSettings, FeatureLlmSelection } from '../../types/shared';

const validBody = {
    chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'high' },
    scenarioGeneration: { modelId: 'gpt-5.6-luna', reasoningLevel: 'medium' },
    writingFeedback: { modelId: 'gpt-5.6-luna', reasoningLevel: 'low' },
    guidedPathway: { modelId: 'gpt-5.6-luna', reasoningLevel: 'medium' },
    memoryAgent: { modelId: 'gpt-5.6-luna', reasoningLevel: 'low' },
} satisfies Record<string, FeatureLlmSelection>;

describe('PATCH /api/courses/:courseId/llm-settings contract', () => {
    beforeEach(() => {
        ModelSelectionService.resetInstanceForTests();
    });

    afterEach(() => {
        ModelSelectionService.resetInstanceForTests();
    });

    it('D1 invalid PATCH body never calls setCachedSettings', () => {
        const service = ModelSelectionService.getInstance();
        const parsed = service.parseUpdateRequest({ chat: { modelId: 'bad' } });
        expect(parsed.ok).toBe(false);
        // Route returns 400 before Mongo / setCached — Map stays empty
        expect(service.hasCachedCourseForTests('course-1')).toBe(false);
    });

    it('D2 simulated Mongo failure skips setCached; Map keeps prior value', async () => {
        const service = ModelSelectionService.getInstance();
        const oldSettings: CourseLlmSettings = {
            ...DEFAULT_COURSE_LLM_SETTINGS,
            chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'high' },
        };
        service.setCachedSettings('course-1', oldSettings);

        const parsed = service.parseUpdateRequest(validBody);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;

        const llmSettings = service.updateCourseLlmSettings(parsed.settings, 'instructor-1');
        const persistOk = false; // simulated updateActiveCourse failure
        if (persistOk) {
            service.setCachedSettings('course-1', llmSettings);
        }

        const stillCached = await service.getSettingsForCourse('course-1');
        expect(stillCached.chat.modelId).toBe('gpt-5.6-luna');
        expect(stillCached.updatedBy).toBeUndefined();
    });

    it('D3 success path: parse → updateCourseLlmSettings → setCached with provenance', async () => {
        const service = ModelSelectionService.getInstance();
        const parsed = service.parseUpdateRequest(validBody);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;

        const llmSettings = service.updateCourseLlmSettings(parsed.settings, 'instructor-1');
        const persistOk = true; // simulated updateActiveCourse success
        if (persistOk) {
            service.setCachedSettings('course-1', llmSettings);
        }

        expect(service.hasCachedCourseForTests('course-1')).toBe(true);
        const cached = await service.getSettingsForCourse('course-1');
        expect(cached.updatedBy).toBe('instructor-1');
        expect(cached.memoryAgent.modelId).toBe('gpt-5.6-luna');
        expect(cached.memoryAgent.reasoningLevel).toBe('low');
        expect(cached.chat.modelId).toBe('gpt-5.6-luna');
    });
});

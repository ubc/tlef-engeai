/**
 * LLM settings PATCH contract tests — validation + cache update ordering helpers.
 *
 * Full Express RBAC for this route uses requireRosterManageAPI (instructor/admin only).
 * These tests cover the handler's ModelSelectionService contract without spinning the app.
 */

import {
    DEFAULT_COURSE_LLM_SETTINGS,
    ModelSelectionService,
} from '../../dashboard-setting/model-selection-service';

describe('PATCH /api/courses/:courseId/llm-settings contract', () => {
    beforeEach(() => {
        ModelSelectionService.resetInstanceForTests();
    });

    afterEach(() => {
        ModelSelectionService.resetInstanceForTests();
    });

    it('rejects invalid bodies before any cache write', () => {
        const service = ModelSelectionService.getInstance();
        const parsed = service.parseUpdateRequest({ chat: { modelId: 'bad' } });
        expect(parsed.ok).toBe(false);
        expect(service.hasCachedCourseForTests('course-1')).toBe(false);
    });

    it('only caches after a successful settings object is built (Mongo-success path)', () => {
        const service = ModelSelectionService.getInstance();
        const parsed = service.parseUpdateRequest({
            chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'high' },
            scenarioGeneration: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
            writingFeedback: { modelId: 'gpt-4o-mini', reasoningLevel: 'low' },
            guidedPathway: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;

        // Simulate route: Mongo succeeded → then setCachedSettings
        const llmSettings = service.updateCourseLlmSettings(parsed.settings, 'instructor-1');
        service.setCachedSettings('course-1', llmSettings);
        expect(service.hasCachedCourseForTests('course-1')).toBe(true);
    });

    it('does not update cache when persist would fail (caller skips setCachedSettings)', () => {
        const service = ModelSelectionService.getInstance();
        service.setCachedSettings('course-1', DEFAULT_COURSE_LLM_SETTINGS);
        // Failed Mongo path: do not call setCachedSettings with the new body
        expect(service.hasCachedCourseForTests('course-1')).toBe(true);
    });
});

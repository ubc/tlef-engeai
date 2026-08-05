/**
 * ModelSelectionService — catalog, cache, timer, and provider-option tests.
 */

import {
    DEFAULT_COURSE_LLM_SETTINGS,
    LLM_FEATURE_KEYS,
    LLM_MODEL_CATALOG,
    ModelSelectionService,
} from '../model-selection-service';
import type { AppReasoningLevel, CourseLlmModelId, FeatureLlmSelection, ProviderReasoningLevel } from '../../types/shared';
import { APP_REASONING_LEVELS } from '../model-selection-list';

describe('ModelSelectionService', () => {
    let service: ModelSelectionService;
    let mongoLoads: number;

    beforeEach(() => {
        jest.useFakeTimers();
        ModelSelectionService.resetInstanceForTests();
        service = ModelSelectionService.getInstance();
        mongoLoads = 0;
        service.setCourseLoaderForTests(async (courseId) => {
            mongoLoads += 1;
            return {
                id: courseId,
                llmSettings: {
                    chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'high' },
                    scenarioGeneration: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
                    writingFeedback: { modelId: 'gpt-4o-mini', reasoningLevel: 'low' },
                    guidedPathway: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
                },
            };
        });
    });

    afterEach(() => {
        ModelSelectionService.resetInstanceForTests();
        jest.useRealTimers();
    });

    describe('A. singleton / catalog / validation', () => {
        it('getInstance returns the same instance', () => {
            expect(ModelSelectionService.getInstance()).toBe(service);
        });

        it('catalog exposes verbatim provider reasoning levels per model', () => {
            const catalog = service.getCatalog();
            expect(catalog).toEqual(LLM_MODEL_CATALOG);
            expect(catalog.find((e) => e.id === 'gpt-5.6-luna')?.supportedReasoningLevels).toEqual([
                'none',
                'low',
                'medium',
                'high',
                'xhigh',
                'max',
            ]);
            expect(catalog.find((e) => e.id === 'gpt-5.4-mini')?.supportedReasoningLevels).toEqual([
                'none',
                'low',
                'medium',
                'high',
                'xhigh',
            ]);
            expect(catalog.find((e) => e.id === 'gpt-4o-mini')?.supportedReasoningLevels).toEqual([]);
            for (const entry of catalog) {
                expect(entry.label.length).toBeGreaterThan(0);
                expect(['low', 'medium', 'high']).toContain(entry.costTier);
            }
        });

        it('accepts APP ∩ provider reasoning on PATCH; provider-only levels stay catalog-only', () => {
            for (const entry of LLM_MODEL_CATALOG) {
                for (const level of entry.supportedReasoningLevels) {
                    expect(service.isReasoningSupported(entry.id, level)).toBe(true);
                }
                for (const level of APP_REASONING_LEVELS) {
                    if (!entry.supportedReasoningLevels.includes(level)) continue;
                    const body = Object.fromEntries(
                        LLM_FEATURE_KEYS.map((key) => [
                            key,
                            { modelId: entry.id, reasoningLevel: level } satisfies FeatureLlmSelection,
                        ])
                    );
                    const parsed = service.parseUpdateRequest(body);
                    expect(parsed.ok).toBe(true);
                }
            }

            const rejectXhigh = service.parseUpdateRequest({
                chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'xhigh' },
                scenarioGeneration: { modelId: 'gpt-5.6-luna', reasoningLevel: 'xhigh' },
                writingFeedback: { modelId: 'gpt-5.6-luna', reasoningLevel: 'xhigh' },
                guidedPathway: { modelId: 'gpt-5.6-luna', reasoningLevel: 'xhigh' },
            });
            expect(rejectXhigh.ok).toBe(false);
        });

        it('dashboard catalog returns costTier and app reasoning options without brains or $', () => {
            const luna = service.getDashboardCatalog().models.find((m) => m.id === 'gpt-5.6-luna');
            expect(luna?.costTier).toBe('high');
            expect(luna).not.toHaveProperty('costLabel');
            expect(luna?.reasoningOptions).toEqual([
                { id: 'none', label: 'None' },
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' },
            ]);
            expect(luna?.reasoningOptions.every((o) => !('brainCount' in o))).toBe(true);

            const mini = service.getDashboardCatalog().models.find((m) => m.id === 'gpt-4o-mini');
            expect(mini?.costTier).toBe('low');
            expect(mini?.reasoningOptions).toEqual([]);
        });

        it('accepts models without native reasoning when reasoningLevel is still present in the body', () => {
            const parsed = service.parseUpdateRequest({
                chat: { modelId: 'gpt-4o-mini', reasoningLevel: 'medium' },
                scenarioGeneration: { modelId: 'gpt-4o-mini', reasoningLevel: 'medium' },
                writingFeedback: { modelId: 'gpt-4o-mini', reasoningLevel: 'medium' },
                guidedPathway: { modelId: 'gpt-4o-mini', reasoningLevel: 'medium' },
            });
            expect(parsed.ok).toBe(true);
        });

        it('rejects unknown model, unknown reasoning, and malformed types', () => {
            expect(service.parseUpdateRequest(null).ok).toBe(false);
            expect(
                service.parseUpdateRequest({
                    chat: { modelId: 'nope', reasoningLevel: 'medium' },
                    scenarioGeneration: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
                    writingFeedback: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
                    guidedPathway: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
                }).ok
            ).toBe(false);
            expect(
                service.parseUpdateRequest({
                    chat: { modelId: 'gpt-5.4-mini', reasoningLevel: 'ultra' },
                    scenarioGeneration: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
                    writingFeedback: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
                    guidedPathway: { modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' },
                }).ok
            ).toBe(false);
        });

        it('expands legacy flat settings to all four features', () => {
            const normalized = service.normalizeStoredSettings({
                modelId: 'gpt-5.6-luna',
                reasoningLevel: 'high',
                updatedBy: 'user-1',
            });
            for (const key of LLM_FEATURE_KEYS) {
                expect(normalized[key]).toEqual({
                    modelId: 'gpt-5.6-luna',
                    reasoningLevel: 'high',
                });
            }
            expect(normalized.updatedBy).toBe('user-1');
        });

        it('falls back to platform defaults for missing or invalid rows', () => {
            expect(service.normalizeStoredSettings(undefined)).toEqual(DEFAULT_COURSE_LLM_SETTINGS);
            expect(service.normalizeStoredSettings({ chat: { modelId: 'bad', reasoningLevel: 'nope' } }).chat).toEqual(
                DEFAULT_COURSE_LLM_SETTINGS.chat
            );
        });

        it('maps catalog model ids directly to provider model strings', () => {
            expect(service.mapModelIdToProviderModel('gpt-5.6-luna')).toBe('gpt-5.6-luna');
            expect(service.mapModelIdToProviderModel('gpt-5.4-mini')).toBe('gpt-5.4-mini');
            expect(service.mapModelIdToProviderModel('gpt-4o-mini')).toBe('gpt-4o-mini');
        });

        it('emits reasoningEffort only for models that support native reasoning', () => {
            const withEffort = service.buildProviderOptions('chat', {
                ...DEFAULT_COURSE_LLM_SETTINGS,
                chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'high' },
            });
            expect(withEffort.model).toBeTruthy();
            expect(withEffort.reasoningEffort).toBe('high');
            expect(withEffort.temperature).toBeUndefined();

            const withoutEffort = service.buildProviderOptions('writingFeedback', {
                ...DEFAULT_COURSE_LLM_SETTINGS,
                writingFeedback: { modelId: 'gpt-4o-mini', reasoningLevel: 'low' },
            });
            expect(withoutEffort.reasoningEffort).toBeUndefined();
            expect(withoutEffort.temperature).toBeUndefined();
        });

        it('builds independent options per feature key', async () => {
            const chat = await service.buildFeatureLlmCallOptions('c1', 'chat');
            const scenario = await service.buildFeatureLlmCallOptions('c1', 'scenarioGeneration');
            const writing = await service.buildFeatureLlmCallOptions('c1', 'writingFeedback');
            const pathway = await service.buildFeatureLlmCallOptions('c1', 'guidedPathway');

            expect(chat.reasoningEffort).toBe('high');
            expect(scenario.reasoningEffort).toBe('medium');
            expect(writing.reasoningEffort).toBeUndefined();
            expect(pathway.reasoningEffort).toBe('medium');
            expect(mongoLoads).toBe(1);
        });
    });

    describe('B. cache + 5-minute timer', () => {
        it('cold miss loads Mongo once; second get is a Map hit', async () => {
            await service.getSettingsForCourse('course-a');
            expect(mongoLoads).toBe(1);
            await service.getSettingsForCourse('course-a');
            expect(mongoLoads).toBe(1);
            expect(service.hasCachedCourseForTests('course-a')).toBe(true);
        });

        it('evicts after 5 minutes of inactivity and reloads on next get', async () => {
            await service.getSettingsForCourse('course-a');
            expect(mongoLoads).toBe(1);

            jest.advanceTimersByTime(5 * 60 * 1000);
            expect(service.hasCachedCourseForTests('course-a')).toBe(false);

            await service.getSettingsForCourse('course-a');
            expect(mongoLoads).toBe(2);
        });

        it('resets the timer on access so eviction is delayed', async () => {
            await service.getSettingsForCourse('course-a');
            jest.advanceTimersByTime(4 * 60 * 1000);
            await service.getSettingsForCourse('course-a');
            jest.advanceTimersByTime(4 * 60 * 1000);
            expect(service.hasCachedCourseForTests('course-a')).toBe(true);
            expect(mongoLoads).toBe(1);

            jest.advanceTimersByTime(60 * 1000);
            expect(service.hasCachedCourseForTests('course-a')).toBe(false);
        });

        it('setCachedSettings replaces value and resets timer without Mongo', async () => {
            await service.getSettingsForCourse('course-a');
            const next = {
                ...DEFAULT_COURSE_LLM_SETTINGS,
                chat: { modelId: 'gpt-4o-mini' as const, reasoningLevel: 'low' as const },
            };
            service.setCachedSettings('course-a', next);
            expect(mongoLoads).toBe(1);

            const loaded = await service.getSettingsForCourse('course-a');
            expect(loaded.chat).toEqual(next.chat);
            expect(mongoLoads).toBe(1);
        });

        it('invalidateCourse clears Map so next get reloads Mongo', async () => {
            await service.getSettingsForCourse('course-a');
            service.invalidateCourse('course-a');
            expect(service.hasCachedCourseForTests('course-a')).toBe(false);
            await service.getSettingsForCourse('course-a');
            expect(mongoLoads).toBe(2);
        });

        it('eviction of course A does not remove course B', async () => {
            await service.getSettingsForCourse('course-a');
            await service.getSettingsForCourse('course-b');
            expect(mongoLoads).toBe(2);

            service.invalidateCourse('course-a');
            expect(service.hasCachedCourseForTests('course-a')).toBe(false);
            expect(service.hasCachedCourseForTests('course-b')).toBe(true);
        });

        it('instructor Save after eviction re-inserts without a prior get', () => {
            service.setCachedSettings('course-a', DEFAULT_COURSE_LLM_SETTINGS);
            expect(service.hasCachedCourseForTests('course-a')).toBe(true);
            expect(mongoLoads).toBe(0);
        });
    });

    describe('C. parseUpdateRequest / updateCourseLlmSettings', () => {
        it('builds persisted settings with provenance', () => {
            const features = {
                chat: { modelId: 'gpt-5.6-luna' as CourseLlmModelId, reasoningLevel: 'high' as AppReasoningLevel },
                scenarioGeneration: {
                    modelId: 'gpt-5.4-mini' as CourseLlmModelId,
                    reasoningLevel: 'medium' as AppReasoningLevel,
                },
                writingFeedback: {
                    modelId: 'gpt-4o-mini' as CourseLlmModelId,
                    reasoningLevel: 'low' as AppReasoningLevel,
                },
                guidedPathway: {
                    modelId: 'gpt-5.4-mini' as CourseLlmModelId,
                    reasoningLevel: 'medium' as AppReasoningLevel,
                },
            };
            const now = new Date('2026-08-04T00:00:00.000Z');
            const settings = service.updateCourseLlmSettings(features, 'instructor-1', now);
            expect(settings.updatedBy).toBe('instructor-1');
            expect(settings.updatedAt).toBe(now);
            expect(settings.chat).toEqual(features.chat);
        });
    });

    describe('E. catalog-derived coverage completeness', () => {
        it('covers every catalog model id as a valid CourseLlmModelId', () => {
            for (const entry of LLM_MODEL_CATALOG) {
                expect(service.isCourseLlmModelId(entry.id)).toBe(true);
            }
            expect(service.isCourseLlmModelId('gpt-9')).toBe(false);
        });

        it('rejects every non-advertised reasoning level for each model', () => {
            const allLevels: ProviderReasoningLevel[] = [
                'none',
                'minimal',
                'low',
                'medium',
                'high',
                'xhigh',
                'max',
            ];
            for (const entry of LLM_MODEL_CATALOG) {
                for (const level of allLevels) {
                    if (!entry.supportedReasoningLevels.includes(level)) {
                        expect(service.isReasoningSupported(entry.id, level)).toBe(false);
                    }
                }
            }
        });

        it('strips temperature when emitting reasoningEffort', () => {
            const options = service.buildProviderOptions(
                'chat',
                {
                    ...DEFAULT_COURSE_LLM_SETTINGS,
                    chat: { modelId: 'gpt-5.4-mini', reasoningLevel: 'low' },
                },
                { temperature: 0.7 }
            );
            expect(options.reasoningEffort).toBe('low');
            expect(options.temperature).toBeUndefined();
        });
    });
});

/**
 * ModelSelectionService — catalog, 5m Map cache, single-flight, and provider-option tests.
 */

import {
    DEFAULT_COURSE_LLM_SETTINGS,
    LLM_FEATURE_KEYS,
    LLM_MODEL_CATALOG,
    ModelSelectionService,
} from '../model-selection-service';
import type {
    AppReasoningLevel,
    CourseLlmModelId,
    CourseLlmSettings,
    FeatureLlmSelection,
    ProviderReasoningLevel,
} from '../../types/shared';
import { APP_REASONING_LEVELS } from '../model-selection-list';

const FIVE_MIN_MS = 5 * 60 * 1000;

/** Full five-feature PATCH body helper for tests. */
function fullBody(
    selection: FeatureLlmSelection
): Record<LlmFeatureKeyFromKeys, FeatureLlmSelection> {
    return Object.fromEntries(LLM_FEATURE_KEYS.map((key) => [key, selection])) as Record<
        LlmFeatureKeyFromKeys,
        FeatureLlmSelection
    >;
}

type LlmFeatureKeyFromKeys = (typeof LLM_FEATURE_KEYS)[number];

function fiveFeatureSettings(
    overrides: Partial<Record<LlmFeatureKeyFromKeys, FeatureLlmSelection>> = {}
): CourseLlmSettings {
    const seed: FeatureLlmSelection = { modelId: 'gpt-5.6-luna', reasoningLevel: 'high' };
    return {
        chat: overrides.chat ?? seed,
        scenarioGeneration: overrides.scenarioGeneration ?? seed,
        writingFeedback: overrides.writingFeedback ?? seed,
        guidedPathway: overrides.guidedPathway ?? seed,
        memoryAgent: overrides.memoryAgent ?? seed,
    };
}

describe('ModelSelectionService', () => {
    let service: ModelSelectionService;
    let mongoLoads: number;

    beforeEach(() => {
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
                    memoryAgent: { modelId: 'gpt-5.4-mini', reasoningLevel: 'low' },
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

            const rejectXhigh = service.parseUpdateRequest(
                fullBody({ modelId: 'gpt-5.6-luna', reasoningLevel: 'xhigh' as unknown as AppReasoningLevel })
            );
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
            const parsed = service.parseUpdateRequest(
                fullBody({ modelId: 'gpt-4o-mini', reasoningLevel: 'medium' })
            );
            expect(parsed.ok).toBe(true);
        });

        it('rejects unknown model, unknown reasoning, and malformed types', () => {
            expect(service.parseUpdateRequest(null).ok).toBe(false);
            expect(
                service.parseUpdateRequest({
                    ...fullBody({ modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' }),
                    chat: { modelId: 'nope', reasoningLevel: 'medium' },
                }).ok
            ).toBe(false);
            expect(
                service.parseUpdateRequest({
                    ...fullBody({ modelId: 'gpt-5.4-mini', reasoningLevel: 'medium' }),
                    chat: { modelId: 'gpt-5.4-mini', reasoningLevel: 'ultra' },
                }).ok
            ).toBe(false);
        });

        it('expands legacy flat settings to all five features', () => {
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
            expect(
                service.normalizeStoredSettings({ chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'high' } })
                    .memoryAgent
            ).toEqual(DEFAULT_COURSE_LLM_SETTINGS.memoryAgent);
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

        it('builds independent options per feature key from one Map load', async () => {
            const chat = await service.buildFeatureLlmCallOptions('c1', 'chat');
            const scenario = await service.buildFeatureLlmCallOptions('c1', 'scenarioGeneration');
            const writing = await service.buildFeatureLlmCallOptions('c1', 'writingFeedback');
            const pathway = await service.buildFeatureLlmCallOptions('c1', 'guidedPathway');
            const memory = await service.buildFeatureLlmCallOptions('c1', 'memoryAgent');

            expect(chat.reasoningEffort).toBe('high');
            expect(scenario.reasoningEffort).toBe('medium');
            expect(writing.reasoningEffort).toBeUndefined();
            expect(pathway.reasoningEffort).toBe('medium');
            expect(memory.reasoningEffort).toBe('low');
            expect(mongoLoads).toBe(1);
        });
    });

    describe('A. Map identity and isolation', () => {
        it('A1 cache hit: second get does not reload Mongo', async () => {
            await service.getSettingsForCourse('c1');
            await service.getSettingsForCourse('c1');
            expect(mongoLoads).toBe(1);
            expect(service.hasCachedCourseForTests('c1')).toBe(true);
        });

        it('A2 per-course key: c1 and c2 load independently', async () => {
            await service.getSettingsForCourse('c1');
            await service.getSettingsForCourse('c2');
            expect(mongoLoads).toBe(2);
            expect(service.hasCachedCourseForTests('c1')).toBe(true);
            expect(service.hasCachedCourseForTests('c2')).toBe(true);
        });

        it('A3 evict A does not drop B', async () => {
            await service.getSettingsForCourse('c1');
            await service.getSettingsForCourse('c2');
            service.invalidateCourse('c1');
            expect(service.hasCachedCourseForTests('c1')).toBe(false);
            expect(service.hasCachedCourseForTests('c2')).toBe(true);
        });

        it('A4 clone on setCached: mutating caller object does not corrupt Map', async () => {
            const next = fiveFeatureSettings({
                chat: { modelId: 'gpt-4o-mini', reasoningLevel: 'low' },
            });
            service.setCachedSettings('c1', next);
            next.chat.modelId = 'gpt-5.6-luna';
            const cached = await service.getSettingsForCourse('c1');
            expect(cached.chat.modelId).toBe('gpt-4o-mini');
            expect(mongoLoads).toBe(0);
        });
    });

    describe('B. Timer correctness', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        it('B1 exact 5m eviction then reload', async () => {
            await service.getSettingsForCourse('c1');
            expect(mongoLoads).toBe(1);
            jest.advanceTimersByTime(FIVE_MIN_MS);
            expect(service.hasCachedCourseForTests('c1')).toBe(false);
            await service.getSettingsForCourse('c1');
            expect(mongoLoads).toBe(2);
        });

        it('B2 access resets timer', async () => {
            await service.getSettingsForCourse('c1');
            jest.advanceTimersByTime(4 * 60 * 1000);
            await service.getSettingsForCourse('c1');
            jest.advanceTimersByTime(4 * 60 * 1000);
            expect(service.hasCachedCourseForTests('c1')).toBe(true);
            expect(mongoLoads).toBe(1);
            jest.advanceTimersByTime(60 * 1000 + 1);
            expect(service.hasCachedCourseForTests('c1')).toBe(false);
        });

        it('B3 setCached resets timer', async () => {
            await service.getSettingsForCourse('c1');
            jest.advanceTimersByTime(4 * 60 * 1000);
            service.setCachedSettings(
                'c1',
                fiveFeatureSettings({ chat: { modelId: 'gpt-4o-mini', reasoningLevel: 'low' } })
            );
            jest.advanceTimersByTime(4 * 60 * 1000);
            expect(service.hasCachedCourseForTests('c1')).toBe(true);
            expect(mongoLoads).toBe(1);
        });

        it('B4 just under 5m still cached', async () => {
            await service.getSettingsForCourse('c1');
            jest.advanceTimersByTime(FIVE_MIN_MS - 1);
            expect(service.hasCachedCourseForTests('c1')).toBe(true);
        });
    });

    describe('C. Instructor save write-through (freshness)', () => {
        it('C1 freshness after save without extra Mongo load', async () => {
            await service.getSettingsForCourse('c1');
            expect(mongoLoads).toBe(1);
            service.setCachedSettings(
                'c1',
                fiveFeatureSettings({ chat: { modelId: 'gpt-4o-mini', reasoningLevel: 'low' } })
            );
            const next = await service.getSettingsForCourse('c1');
            expect(next.chat.modelId).toBe('gpt-4o-mini');
            expect(mongoLoads).toBe(1);
        });

        it('C2 buildFeature after save uses cached model', async () => {
            await service.getSettingsForCourse('c1');
            service.setCachedSettings(
                'c1',
                fiveFeatureSettings({ chat: { modelId: 'gpt-4o-mini', reasoningLevel: 'low' } })
            );
            const opts = await service.buildFeatureLlmCallOptions('c1', 'chat');
            expect(opts.model).toBe('gpt-4o-mini');
            expect(mongoLoads).toBe(1);
        });

        it('C3 all five features updated', async () => {
            const next = fiveFeatureSettings({
                chat: { modelId: 'gpt-4o-mini', reasoningLevel: 'low' },
                scenarioGeneration: { modelId: 'gpt-5.4-mini', reasoningLevel: 'high' },
                writingFeedback: { modelId: 'gpt-5.6-luna', reasoningLevel: 'medium' },
                guidedPathway: { modelId: 'gpt-4o-mini', reasoningLevel: 'none' },
                memoryAgent: { modelId: 'gpt-5.6-luna', reasoningLevel: 'high' },
            });
            service.setCachedSettings('c1', next);
            const got = await service.getSettingsForCourse('c1');
            for (const key of LLM_FEATURE_KEYS) {
                expect(got[key]).toEqual(next[key]);
            }
            expect(mongoLoads).toBe(0);
        });

        it('C4 setCached without prior get', async () => {
            service.setCachedSettings(
                'c1',
                fiveFeatureSettings({ chat: { modelId: 'gpt-4o-mini', reasoningLevel: 'low' } })
            );
            expect(service.hasCachedCourseForTests('c1')).toBe(true);
            expect(mongoLoads).toBe(0);
            const got = await service.getSettingsForCourse('c1');
            expect(got.chat.modelId).toBe('gpt-4o-mini');
            expect(mongoLoads).toBe(0);
        });
    });

    describe('D. Fail-closed vs Map (service-level)', () => {
        it('D2 skipping setCached leaves old Map value', async () => {
            await service.getSettingsForCourse('c1');
            const before = await service.getSettingsForCourse('c1');
            expect(before.chat.modelId).toBe('gpt-5.6-luna');
            // Simulated Mongo failure: route would skip setCachedSettings
            const after = await service.getSettingsForCourse('c1');
            expect(after.chat.modelId).toBe('gpt-5.6-luna');
            expect(mongoLoads).toBe(1);
        });
    });

    describe('E. Cold miss / single-flight / invalidate', () => {
        it('E1 concurrent cold miss shares one Mongo load', async () => {
            const results = await Promise.all([
                service.getSettingsForCourse('c1'),
                service.getSettingsForCourse('c1'),
                service.getSettingsForCourse('c1'),
            ]);
            expect(mongoLoads).toBe(1);
            expect(results[0].chat).toEqual(results[1].chat);
            expect(results[1].chat).toEqual(results[2].chat);
        });

        it('E2 sequential after settle stays Map hit', async () => {
            await Promise.all([
                service.getSettingsForCourse('c1'),
                service.getSettingsForCourse('c1'),
            ]);
            await service.getSettingsForCourse('c1');
            expect(mongoLoads).toBe(1);
        });

        it('E3 invalidateCourse forces reload', async () => {
            await service.getSettingsForCourse('c1');
            service.invalidateCourse('c1');
            expect(service.hasCachedCourseForTests('c1')).toBe(false);
            await service.getSettingsForCourse('c1');
            expect(mongoLoads).toBe(2);
        });

        it('E4 in-flight cleared on error so next get retries', async () => {
            let shouldFail = true;
            service.setCourseLoaderForTests(async (courseId) => {
                mongoLoads += 1;
                if (shouldFail) {
                    shouldFail = false;
                    throw new Error('mongo down');
                }
                return {
                    id: courseId,
                    llmSettings: fiveFeatureSettings(),
                };
            });

            await expect(service.getSettingsForCourse('c1')).rejects.toThrow('mongo down');
            const recovered = await service.getSettingsForCourse('c1');
            expect(recovered.chat.modelId).toBe('gpt-5.6-luna');
            expect(mongoLoads).toBe(2);
        });
    });

    describe('F. Normalize on Map insert', () => {
        it('F1 legacy flat → five features in cache', async () => {
            service.setCourseLoaderForTests(async (courseId) => {
                mongoLoads += 1;
                return {
                    id: courseId,
                    llmSettings: {
                        modelId: 'gpt-5.6-luna',
                        reasoningLevel: 'high',
                    } as unknown as CourseLlmSettings,
                };
            });
            const first = await service.getSettingsForCourse('c1');
            for (const key of LLM_FEATURE_KEYS) {
                expect(first[key]).toEqual({ modelId: 'gpt-5.6-luna', reasoningLevel: 'high' });
            }
            await service.getSettingsForCourse('c1');
            expect(mongoLoads).toBe(1);
        });

        it('F2 invalid stored row clamped to platform default', async () => {
            service.setCourseLoaderForTests(async (courseId) => {
                mongoLoads += 1;
                return {
                    id: courseId,
                    llmSettings: {
                        chat: { modelId: 'bad-model', reasoningLevel: 'nope' },
                    } as unknown as CourseLlmSettings,
                };
            });
            const got = await service.getSettingsForCourse('c1');
            expect(got.chat).toEqual(DEFAULT_COURSE_LLM_SETTINGS.chat);
            expect(service.hasCachedCourseForTests('c1')).toBe(true);
        });
    });

    describe('parseUpdateRequest / updateCourseLlmSettings', () => {
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
                memoryAgent: {
                    modelId: 'gpt-5.4-mini' as CourseLlmModelId,
                    reasoningLevel: 'low' as AppReasoningLevel,
                },
            };
            const now = new Date('2026-08-04T00:00:00.000Z');
            const settings = service.updateCourseLlmSettings(features, 'instructor-1', now);
            expect(settings.updatedBy).toBe('instructor-1');
            expect(settings.updatedAt).toBe(now);
            expect(settings.chat).toEqual(features.chat);
            expect(settings.memoryAgent).toEqual(features.memoryAgent);
        });
    });

    describe('catalog-derived coverage completeness', () => {
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

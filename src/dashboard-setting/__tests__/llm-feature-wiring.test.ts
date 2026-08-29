/**
 * LLM feature wiring — ensures each consuming feature resolves the correct
 * ModelSelectionService feature key and toolkit-compatible options.
 *
 * Call-site map is asserted by reading source (fails if a feature is wired to
 * the wrong key or stops calling buildFeatureLlmCallOptions).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ReasoningEffort } from 'ubc-genai-toolkit-llm';
import {
    DEFAULT_COURSE_LLM_SETTINGS,
    LLM_FEATURE_KEYS,
    LLM_MODEL_CATALOG,
    ModelSelectionService,
} from '../model-selection-service';
import { APP_REASONING_LEVELS } from '../model-selection-list';
import type { AppReasoningLevel, LlmFeatureKey } from '../../types/shared';

/** Toolkit ReasoningEffort union — every emitted effort must be in this set. */
const TOOLKIT_REASONING_EFFORTS: readonly ReasoningEffort[] = [
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
];

/**
 * Source files that must call buildFeatureLlmCallOptions / buildDefaultProviderOptions
 * with the matching LlmFeatureKey literal.
 */
const FEATURE_CALL_SITES: Record<LlmFeatureKey, readonly string[]> = {
    chat: ['src/chat/chat-app.ts'],
    scenarioGeneration: ['src/scenario-generation/scenario-service.ts'],
    writingFeedback: ['src/writing-feedback/writing-feedback-service.ts'],
    guidedPathway: ['src/guided-pathways/pathway-orchestrator.ts'],
    memoryAgent: [
        'src/memory-agent/memory-agent.ts',
        'src/memory-agent/struggle-topic-generator.ts',
        'src/memory-agent/unstruggle-yes-followup.ts',
    ],
};

const repoRoot = path.resolve(__dirname, '../../..');

describe('LLM feature wiring (toolkit reasoningEffort)', () => {
    let service: ModelSelectionService;

    beforeEach(() => {
        ModelSelectionService.resetInstanceForTests();
        service = ModelSelectionService.getInstance();
        service.setCourseLoaderForTests(async (courseId) => ({
            id: courseId,
            llmSettings: {
                chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'high' },
                scenarioGeneration: { modelId: 'gpt-5.6-luna', reasoningLevel: 'none' },
                writingFeedback: { modelId: 'gpt-5.6-luna', reasoningLevel: 'medium' },
                guidedPathway: { modelId: 'gpt-5.6-luna', reasoningLevel: 'low' },
                memoryAgent: { modelId: 'gpt-5.6-luna', reasoningLevel: 'medium' },
            },
        }));
    });

    afterEach(() => {
        ModelSelectionService.resetInstanceForTests();
    });

    it('covers every LlmFeatureKey in FEATURE_CALL_SITES', () => {
        expect(Object.keys(FEATURE_CALL_SITES).sort()).toEqual([...LLM_FEATURE_KEYS].sort());
    });

    it('each call site uses the matching feature key string', () => {
        for (const feature of LLM_FEATURE_KEYS) {
            for (const relPath of FEATURE_CALL_SITES[feature]) {
                const source = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
                expect(source).toContain('buildFeatureLlmCallOptions');
                // Quoted feature key in the call (or adjacent default fallback).
                expect(source).toMatch(
                    new RegExp(
                        `build(?:FeatureLlmCall|DefaultProvider)Options\\([\\s\\S]{0,200}['"]${feature}['"]`
                    )
                );
            }
        }
    });

    it('resolves independent model + reasoningEffort per feature key', async () => {
        const expected: Record<
            LlmFeatureKey,
            { model: string; reasoningEffort: AppReasoningLevel | undefined }
        > = {
            chat: { model: 'gpt-5.6-luna', reasoningEffort: 'high' },
            scenarioGeneration: { model: 'gpt-5.6-luna', reasoningEffort: 'none' },
            writingFeedback: { model: 'gpt-5.6-luna', reasoningEffort: 'medium' },
            guidedPathway: { model: 'gpt-5.6-luna', reasoningEffort: 'low' },
            memoryAgent: { model: 'gpt-5.6-luna', reasoningEffort: 'medium' },
        };

        for (const feature of LLM_FEATURE_KEYS) {
            const options = await service.buildFeatureLlmCallOptions('course-wiring', feature);
            expect(options.model).toBe(expected[feature].model);
            expect(options.reasoningEffort).toBe(expected[feature].reasoningEffort);
            if (options.reasoningEffort !== undefined) {
                expect(TOOLKIT_REASONING_EFFORTS).toContain(options.reasoningEffort);
            }
        }
    });

    it('emits only toolkit-allowed reasoningEffort values for every catalog APP level', () => {
        for (const entry of LLM_MODEL_CATALOG) {
            for (const level of APP_REASONING_LEVELS) {
                if (
                    entry.supportedReasoningLevels.length > 0 &&
                    !entry.supportedReasoningLevels.includes(level)
                ) {
                    continue;
                }
                const options = service.buildProviderOptions(
                    'chat',
                    {
                        ...DEFAULT_COURSE_LLM_SETTINGS,
                        chat: { modelId: entry.id, reasoningLevel: level },
                    }
                );
                if (entry.supportedReasoningLevels.length === 0) {
                    expect(options.reasoningEffort).toBeUndefined();
                } else {
                    expect(options.reasoningEffort).toBe(level);
                    expect(TOOLKIT_REASONING_EFFORTS).toContain(options.reasoningEffort);
                }
            }
        }
    });

    it('strips temperature when reasoningEffort is set (toolkit compatibility)', () => {
        const withReasoning = service.buildProviderOptions(
            'chat',
            {
                ...DEFAULT_COURSE_LLM_SETTINGS,
                chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'medium' },
            },
            { temperature: 0.3 }
        );
        expect(withReasoning.reasoningEffort).toBe('medium');
        expect(withReasoning.temperature).toBeUndefined();

        const withoutReasoning = service.buildProviderOptions(
            'chat',
            {
                ...DEFAULT_COURSE_LLM_SETTINGS,
                chat: { modelId: 'gpt-4.1-mini-engeai-local', reasoningLevel: 'medium' },
            },
            { temperature: 0.3 }
        );
        expect(withoutReasoning.reasoningEffort).toBeUndefined();
        expect(withoutReasoning.temperature).toBe(0.3);
    });

    it('default provider options follow DEFAULT_COURSE_LLM_SETTINGS for each feature', () => {
        for (const feature of LLM_FEATURE_KEYS) {
            const options = service.buildDefaultProviderOptions(feature);
            const selection = DEFAULT_COURSE_LLM_SETTINGS[feature];
            expect(options.model).toBe(selection.modelId);
            const entry = LLM_MODEL_CATALOG.find((e) => e.id === selection.modelId);
            if (entry && entry.supportedReasoningLevels.length > 0) {
                expect(options.reasoningEffort).toBe(selection.reasoningLevel);
            } else {
                expect(options.reasoningEffort).toBeUndefined();
            }
        }
    });
});

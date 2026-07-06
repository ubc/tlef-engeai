/**
 * scenario-generator.ts
 *
 * RAG-grounded AI authoring for Practice Scenarios / Scenario Questions (P3 Slice E/F).
 * Orchestrates: RAG retrieval → `buildScenarioGenerationSystemPrompt` → structured LLM call →
 * `sanitizeGeneratedScenario` → persist via `scenario-questions-mongo.createScenarioQuestion`.
 *
 * Failed/invalid generations never persist an orphan draft (T-B19) — sanitize-then-save, not
 * save-then-fix.
 */

import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { AppConfig, loadConfig } from '../utils/config';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { RAGApp } from '../rag/rag-app';
import { ragPrompts } from '../rag/rag-prompts';
import { IDGenerator } from '../utils/unique-id-generator';
import { isDeveloperMode, getMockGeneratedScenario } from '../helpers/developer-mode';
import { appLogger } from '../utils/logger';
import type { ScenarioGenerateResponse, ScenarioQuestion } from '../types/shared';
import { buildScenarioGenerationSystemPrompt } from './scenario-generation-prompt';
import {
    batchScenarioSchema,
    sanitizeGeneratedScenario,
    singleScenarioSchema,
    type GeneratedScenario,
} from './scenario-generation-schema';

export interface ScenarioGenerationInput {
    mode: 'single' | 'batch';
    sourcePrompt: string;
    topicOrWeekId: string;
    count?: number;
    courseId: string;
    courseName: string;
    createdByUserId: string;
}

/** Orchestrates RAG-grounded structured generation and persistence for Practice Scenarios. */
export class ScenarioGenerator {
    private llmModule: LLMModule;
    private appConfig: AppConfig;

    constructor(config: AppConfig) {
        this.appConfig = config;
        this.llmModule = new LLMModule(this.appConfig.llmConfig);
    }

    /**
     * Generates one (`single`) or several (`batch`) draft scenario questions and persists the
     * sanitized results. Malformed model output for a given item is dropped, not saved.
     */
    public async generate(input: ScenarioGenerationInput): Promise<ScenarioGenerateResponse> {
        try {
            const requestedCount = input.mode === 'batch' ? Math.max(1, input.count ?? 1) : 1;
            const aiGenerationJobId = input.mode === 'batch'
                ? IDGenerator.getInstance().uniqueIDGenerator(`${input.courseName}-${input.sourcePrompt}-${Date.now()}`)
                : undefined;

            let rawResults: GeneratedScenario[];
            if (isDeveloperMode()) {
                appLogger.log('[SCENARIO-GEN] 🧪 Developer mode — using mock generated scenario(s)');
                rawResults = Array.from({ length: requestedCount }, () => getMockGeneratedScenario());
            } else {
                rawResults = await this.generateViaLLM(input, requestedCount);
            }

            const sanitized = rawResults
                .map((raw) => sanitizeGeneratedScenario(raw))
                .filter((q): q is GeneratedScenario => q !== null);

            if (sanitized.length === 0) {
                appLogger.warn('[SCENARIO-GEN] All generated question(s) failed validation; no draft persisted');
                return {
                    success: false,
                    error: 'Generation did not produce a question with valid parts (a)-(c). Please try again or refine the prompt.',
                };
            }

            const mongoDB = await EngEAI_MongoDB.getInstance();
            const saved: ScenarioQuestion[] = [];
            for (const question of sanitized) {
                const created = await mongoDB.createScenarioQuestion({
                    courseId: input.courseId,
                    courseName: input.courseName,
                    topicOrWeekId: input.topicOrWeekId,
                    title: question.title,
                    sourcePrompt: input.sourcePrompt,
                    questionBody: question.questionBody,
                    solutionBody: question.solutionBody,
                    subQuestions: question.subQuestions,
                    generatedBy: 'ai',
                    aiGenerationJobId,
                    createdByUserId: input.createdByUserId,
                });
                saved.push(created);
            }

            appLogger.log(`[SCENARIO-GEN] ✅ Persisted ${saved.length}/${requestedCount} generated question(s) for course ${input.courseName}`);
            return { success: true, data: saved, aiGenerationJobId };
        } catch (error) {
            appLogger.error('[SCENARIO-GEN] 🚨 Generation failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Scenario generation failed',
            };
        }
    }

    private async generateViaLLM(input: ScenarioGenerationInput, requestedCount: number): Promise<GeneratedScenario[]> {
        const ragApp = await RAGApp.getInstance();
        const chunks = await ragApp.retrieveForChat(input.sourcePrompt, input.courseName);
        const context = ragPrompts.formatRetrievedContext(chunks);

        const systemPrompt = buildScenarioGenerationSystemPrompt(input.mode);
        const promptSuffix = input.mode === 'batch' ? `\n\nGenerate exactly ${requestedCount} distinct question(s).` : '';
        const userTurn = ragPrompts.formatScenarioGenerationUserTurn(context, input.sourcePrompt) + promptSuffix;

        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userTurn },
        ];

        if (input.mode === 'single') {
            const response = await this.llmModule.sendStructuredConversation(
                messages,
                singleScenarioSchema,
                { structuredOutputName: 'scenario_generation_single' }
            );
            return response?.parsed ? [response.parsed] : [];
        }

        const response = await this.llmModule.sendStructuredConversation(
            messages,
            batchScenarioSchema,
            { structuredOutputName: 'scenario_generation_batch' }
        );
        return response?.parsed?.questions ?? [];
    }
}

const appConfig = loadConfig();
const scenarioGenerator = new ScenarioGenerator(appConfig);

/** Module-level convenience wrapper around the process-wide {@link ScenarioGenerator} singleton. */
export async function generateScenarioQuestions(input: ScenarioGenerationInput): Promise<ScenarioGenerateResponse> {
    return scenarioGenerator.generate(input);
}

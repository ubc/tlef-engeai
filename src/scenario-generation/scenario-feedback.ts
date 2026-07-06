/**
 * scenario-feedback.ts
 *
 * Per-part check-answer grading for Practice Scenarios (P3 Slice F). Compares a student's
 * submitted answer against the instructor's `modelAnswer` for one `ScenarioSubQuestion` and
 * returns a verdict plus optional Socratic guidance — never the model answer itself (T-B14).
 */

import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { AppConfig, loadConfig } from '../utils/config';
import { isDeveloperMode, getMockScenarioFeedback } from '../helpers/developer-mode';
import { appLogger } from '../utils/logger';
import type { ScenarioPartFeedbackResponse, ScenarioSubQuestion } from '../types/shared';
import { buildScenarioFeedbackSystemPrompt, buildScenarioFeedbackUserTurn } from './scenario-feedback-prompt';
import { sanitizeScenarioFeedback, scenarioFeedbackResponseSchema } from './scenario-feedback-schema';

export interface ScenarioFeedbackInput {
    questionBody: string;
    subQuestion: ScenarioSubQuestion;
    studentAnswer: string;
}

/** Orchestrates structured-output grading for one check-answer request. */
export class ScenarioFeedbackGrader {
    private llmModule: LLMModule;
    private appConfig: AppConfig;

    constructor(config: AppConfig) {
        this.appConfig = config;
        this.llmModule = new LLMModule(this.appConfig.llmConfig);
    }

    public async grade(input: ScenarioFeedbackInput): Promise<ScenarioPartFeedbackResponse> {
        const partId = input.subQuestion.partId;
        try {
            if (isDeveloperMode()) {
                appLogger.log('[SCENARIO-FEEDBACK] 🧪 Developer mode — using mock verdict');
                const mock = getMockScenarioFeedback();
                return { success: true, partId, ...mock };
            }

            const systemPrompt = buildScenarioFeedbackSystemPrompt();
            const userTurn = buildScenarioFeedbackUserTurn(
                input.questionBody,
                input.subQuestion.prompt,
                input.subQuestion.modelAnswer,
                input.studentAnswer
            );

            const messages: Message[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userTurn },
            ];

            const response = await this.llmModule.sendStructuredConversation(
                messages,
                scenarioFeedbackResponseSchema,
                { structuredOutputName: 'scenario_feedback' }
            );

            if (!response?.parsed) {
                throw new Error('Empty structured response from LLM');
            }

            const sanitized = sanitizeScenarioFeedback(response.parsed, input.subQuestion.modelAnswer);
            return { success: true, partId, ...sanitized };
        } catch (error) {
            appLogger.error('[SCENARIO-FEEDBACK] 🚨 Grading failed:', error);
            return {
                success: false,
                partId,
                verdict: 'needs_improvement',
                error: error instanceof Error ? error.message : 'Feedback generation failed',
            };
        }
    }
}

const appConfig = loadConfig();
const scenarioFeedbackGrader = new ScenarioFeedbackGrader(appConfig);

/** Module-level convenience wrapper around the process-wide {@link ScenarioFeedbackGrader} singleton. */
export async function checkScenarioAnswer(input: ScenarioFeedbackInput): Promise<ScenarioPartFeedbackResponse> {
    return scenarioFeedbackGrader.grade(input);
}

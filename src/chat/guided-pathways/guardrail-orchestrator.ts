/**
 * guardrail-orchestrator.ts
 *
 * Pre-LLM guardrail evaluation for Guided Pathways (P0). One structured LLM call per
 * eligible chat send; static server templates on trigger; fail-open on errors.
 */

import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { loadConfig } from '../../utils/config';
import { appLogger } from '../../utils/logger';
import { isDeveloperMode, getMockGuardrailEvaluation } from '../../helpers/developer-mode';
import {
    buildGuardrailResult,
    guardrailEvaluationResponseSchema,
    noGuardrailTriggerResult,
    type GuardrailResult,
} from './guardrail-schema';
import {
    buildGuardrailEvaluationSystemPrompt,
    buildGuardrailEvaluationUserTurn,
} from './guardrail-prompt';

/** Input for a single guardrail evaluation on a student chat message. */
export interface GuardrailEvaluationInput {
    message: string;
    courseName: string;
    conversationMode: 'socratic' | 'explanatory';
}

let llmModuleInstance: LLMModule | null = null;

function getLlmModule(): LLMModule {
    if (!llmModuleInstance) {
        const config = loadConfig();
        llmModuleInstance = new LLMModule(config.llmConfig);
    }
    return llmModuleInstance;
}

/** Reset cached LLM module (tests only). */
export function resetGuardrailLlmModuleForTests(): void {
    llmModuleInstance = null;
}

/**
 * evaluateGuardrails - Evaluate the student message against all active platform guardrails.
 *
 * Fail-open: returns `{ triggered: false }` on LLM or parse errors (D6).
 *
 * @param input - Guardrail evaluation input @see GuardrailEvaluationInput.
 * @returns Guardrail result @see GuardrailResult.
 */
export async function evaluateGuardrails(input: GuardrailEvaluationInput): Promise<GuardrailResult> {
    try {

        // If developer mode is enabled, return a mock guardrail result
        if (isDeveloperMode()) {
            const mock = getMockGuardrailEvaluation(input.courseName);
            if (mock) {
                appLogger.log(
                    `[GUARDRAILS] Developer mode — mock trigger: ${mock.winningGuardrailId ?? 'none'}`
                );
                return mock;
            }
        }

        // Build the system prompt and user turn
        const systemPrompt = buildGuardrailEvaluationSystemPrompt();
        const userTurn = buildGuardrailEvaluationUserTurn(input.message, {
            courseName: input.courseName,
            conversationMode: input.conversationMode,
        });

        // Build the messages
        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userTurn },
        ];

        // Get the LLM module
        const llmModule = getLlmModule();

        // Send the structured conversation
        const response = await llmModule.sendStructuredConversation(
            messages,
            guardrailEvaluationResponseSchema,
            { structuredOutputName: 'guardrail_evaluation' }
        );

        // Build the guardrail result
        const guardrailType = response?.parsed?.guardrailType ?? 'none';
        const result = buildGuardrailResult(guardrailType, input.courseName);

        // Log the guardrail result
        if (result.triggered) {
            appLogger.log(
                `[GUARDRAILS] Triggered: ${result.winningGuardrailId} (course=${input.courseName})`
            );
        }

        return result;
    } catch (error) {
        appLogger.error('[GUARDRAILS] Evaluation failed — failing open', error as Error);
        return noGuardrailTriggerResult();
    }
}

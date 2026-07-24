/**
 * pathway-orchestrator.ts
 *
 * Pre-LLM Guided Pathway evaluation. Loads course pathways from Mongo, builds a dynamic
 * structured-output schema, fails open on errors.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.0.0
 * @description: evaluatePathways — one classifier call per eligible chat send.
 */

import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { loadConfig } from '../utils/config';
import { appLogger } from '../utils/logger';
import { isDeveloperMode, getMockPathwayEvaluation } from '../helpers/developer-mode';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import {
    buildPathwayEvaluationSchema,
    buildPathwayResult,
    isPathwayEvaluable,
    noPathwayTriggerResult,
    type PathwayEvaluationResult,
} from './pathway-schema';
import {
    buildPathwayEvaluationSystemPrompt,
    buildPathwayEvaluationUserTurn,
} from './pathway-prompt';
import type { GuidedPathway } from '../types/shared';

/** Input for a single pathway evaluation on a student chat message. */
export interface PathwayEvaluationInput {
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
export function resetPathwayLlmModuleForTests(): void {
    llmModuleInstance = null;
}

/**
 * loadEvaluablePathways - Fetch course pathways sorted by order, filtered for intercept eligibility.
 *
 * @param courseName - Logical course name
 * @returns Evaluable GuidedPathway list (may be empty)
 */
export async function loadEvaluablePathways(courseName: string): Promise<GuidedPathway[]> {
    const mongo = await EngEAI_MongoDB.getInstance();
    const pathways = await mongo.listPathwaysForEvaluation(courseName);
    return pathways.filter(isPathwayEvaluable).sort((a, b) => a.order - b.order);
}

/**
 * evaluatePathways - Evaluate the student message against course Guided Pathways.
 *
 * Fail-open: returns `{ triggered: false }` on LLM or parse errors.
 *
 * @param input - Pathway evaluation input
 * @returns {@link PathwayEvaluationResult}
 */
export async function evaluatePathways(input: PathwayEvaluationInput): Promise<PathwayEvaluationResult> {
    try {
        const pathways = await loadEvaluablePathways(input.courseName);

        if (isDeveloperMode()) {
            const mock = getMockPathwayEvaluation(input.courseName, pathways);
            if (mock) {
                appLogger.log(
                    `[PATHWAYS] Developer mode — mock trigger: ${mock.winningPathwayId ?? 'none'}`
                );
                return mock;
            }
        }

        if (pathways.length === 0) {
            return noPathwayTriggerResult();
        }

        const schema = buildPathwayEvaluationSchema(pathways.map((p) => p.id));
        const systemPrompt = buildPathwayEvaluationSystemPrompt(pathways);
        const userTurn = buildPathwayEvaluationUserTurn(input.message, {
            courseName: input.courseName,
            conversationMode: input.conversationMode,
        });

        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userTurn },
        ];

        const llmModule = getLlmModule();
        const response = await llmModule.sendStructuredConversation(messages, schema, {
            structuredOutputName: 'pathway_evaluation',
        });

        const pathwayType = response?.parsed?.pathwayType ?? 'none';
        const result = buildPathwayResult(pathwayType, input.courseName, pathways);

        if (result.triggered) {
            appLogger.log(
                `[PATHWAYS] Triggered: ${result.winningPathwayId} (course=${input.courseName})`
            );
        }

        return result;
    } catch (error) {
        appLogger.error('[PATHWAYS] Evaluation failed — failing open', error as Error);
        return noPathwayTriggerResult();
    }
}

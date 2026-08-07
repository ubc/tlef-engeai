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
import { isMockResponse, getMockPathwayEvaluation } from '../helpers/mock-response';
import { ModelSelectionService } from '../dashboard-setting/model-selection-service';
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
import type { GuidedPathway, activeCourse } from '../types/shared';

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
 * loadEvaluablePathways - Fetch course pathways sorted by library order, filtered for intercept eligibility.
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

        // Empty library / no evaluable pathways — bypass classifier (STEP 0 no-op)
        if (pathways.length === 0) {
            return noPathwayTriggerResult();
        }

        // MOCK_RESPONSE: never call the classifier LLM — optional trigger mock or no-op.
        if (isMockResponse()) {
            const mongo = await EngEAI_MongoDB.getInstance();
            const course = (await mongo.getCourseByName(input.courseName)) as activeCourse | null;
            const modelSelection = ModelSelectionService.getInstance();
            if (course?.id) {
                await modelSelection.buildFeatureLlmCallOptions(course.id, 'guidedPathway');
            } else {
                modelSelection.buildDefaultProviderOptions('guidedPathway');
            }
            const mock =
                getMockPathwayEvaluation(input.courseName, pathways) ?? noPathwayTriggerResult();
            appLogger.log(
                `[PATHWAYS] Mock response — mock trigger: ${mock.winningPathwayId ?? 'none'}`
            );
            return mock;
        }

        // Build the schema, system prompt, and user turn
        const schema = buildPathwayEvaluationSchema(pathways.map((p) => p.id));
        const systemPrompt = buildPathwayEvaluationSystemPrompt(pathways);
        const userTurn = buildPathwayEvaluationUserTurn(input.message, {
            courseName: input.courseName,
            conversationMode: input.conversationMode,
        });

        // Build the messages
        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userTurn },
        ];

        // Send the messages to the LLM
        const llmModule = getLlmModule();
        const mongo = await EngEAI_MongoDB.getInstance();
        const course = (await mongo.getCourseByName(input.courseName)) as activeCourse | null;
        const modelSelection = ModelSelectionService.getInstance();
        const llmOptions = course?.id
            ? await modelSelection.buildFeatureLlmCallOptions(course.id, 'guidedPathway')
            : modelSelection.buildDefaultProviderOptions('guidedPathway');
        const response = await llmModule.sendStructuredConversation(messages, schema, {
            structuredOutputName: 'pathway_evaluation',
            ...llmOptions,
        });

        // Build the result
        const pathwayType = response?.parsed?.pathwayType ?? 'none';
        const result = buildPathwayResult(pathwayType, input.courseName, pathways);

        // Log the result
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

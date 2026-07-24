/**
 * pathway-schema.ts
 *
 * Zod schemas and post-processing for Guided Pathway evaluation. The classifier LLM returns
 * only `{ pathwayType }`; student-facing copy and CTAs are resolved server-side from Mongo.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.0.0
 * @description: Dynamic pathwayType enum + PathwayEvaluationResult builders.
 */

import { z } from 'zod';
import type { GuidedPathway, PathwayCta } from '../types/shared';

/** Result returned to chat-app after evaluation and server-side resolution. */
export interface PathwayEvaluationResult {
    triggered: boolean;
    winningPathwayId: string | null;
    responseText: string | null;
    ctas: PathwayCta[];
}

const NO_TRIGGER_RESULT: PathwayEvaluationResult = {
    triggered: false,
    winningPathwayId: null,
    responseText: null,
    ctas: [],
};

/**
 * isPathwayEvaluable - Whether a pathway may win an intercept (enabled + non-empty response).
 *
 * @param pathway - Pathway document from Mongo
 * @returns true when the classifier may return this pathway's id
 */
export function isPathwayEvaluable(pathway: GuidedPathway): boolean {
    return pathway.enabledGlobally === true && pathway.assistantResponse.trim().length > 0;
}

/**
 * formatPathwayResponse - Substitute `{courseName}` placeholders in assistantResponse.
 *
 * @param template - Markdown template from GuidedPathway.assistantResponse
 * @param courseName - Current course display name
 * @returns Student-facing plain/markdown text
 */
export function formatPathwayResponse(template: string, courseName: string): string {
    return template.replace(/\{courseName\}/g, courseName);
}

/**
 * buildPathwayEvaluationSchema - Zod schema for structured LLM output for the given ids.
 *
 * Enum is always `...pathwayIds, 'none'`. Empty ids → schema that only accepts `'none'`.
 *
 * @param pathwayIds - Evaluable pathway ids (order irrelevant for Zod)
 * @returns Zod object `{ pathwayType: enum }`
 */
export function buildPathwayEvaluationSchema(pathwayIds: readonly string[]) {
    const uniqueIds = [...new Set(pathwayIds.filter((id) => id.trim().length > 0))];
    const values =
        uniqueIds.length > 0
            ? ([...uniqueIds, 'none'] as unknown as [string, ...string[]])
            : (['none'] as [string]);
    return z.object({
        pathwayType: z.enum(values),
    });
}

/**
 * buildPathwayResult - Map classifier pathwayType to a full evaluation result.
 *
 * Unknown / missing / non-evaluable ids fail safe to no trigger.
 *
 * @param pathwayType - Evaluator output (`none` when no pathway applies)
 * @param courseName - Course display name for template substitution
 * @param pathways - Evaluable pathway definitions (same set used to build the enum)
 * @returns {@link PathwayEvaluationResult} for the chat pipeline
 */
export function buildPathwayResult(
    pathwayType: string,
    courseName: string,
    pathways: readonly GuidedPathway[]
): PathwayEvaluationResult {
    if (pathwayType === 'none') {
        return { ...NO_TRIGGER_RESULT };
    }

    const definition = pathways.find((p) => p.id === pathwayType);
    if (!definition || !isPathwayEvaluable(definition)) {
        return { ...NO_TRIGGER_RESULT };
    }

    return {
        triggered: true,
        winningPathwayId: definition.id,
        responseText: formatPathwayResponse(definition.assistantResponse, courseName),
        ctas: definition.ctas.map((c) => ({ ...c })),
    };
}

/** Fail-open result when evaluation cannot complete. */
export function noPathwayTriggerResult(): PathwayEvaluationResult {
    return { ...NO_TRIGGER_RESULT };
}

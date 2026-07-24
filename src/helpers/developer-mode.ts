/**
 * Developer Mode Module
 *
 * Utilities for bypassing LLM API calls during development to reduce costs.
 * When DEVELOPING_MODE is 'true', the system uses hardcoded mock responses.
 *
 * Optional PATHWAY_MOCK_TRIGGER / GUARDRAIL_MOCK_TRIGGER forces a pathway intercept
 * without calling the classifier LLM.
 *
 * @author: EngE-AI Team
 * @version: 1.1.0
 * @since: 2025-01-27
 */

import { appLogger } from '../utils/logger';
import {
    buildPathwayResult,
    type PathwayEvaluationResult,
} from '../guided-pathways/pathway-schema';
import type { GuidedPathway } from '../types/shared';
import { buildPlatformPathwaySeeds } from '../guided-pathways/pathway-seed';

/**
 * Check if developer mode is enabled
 *
 * @returns boolean - True if DEVELOPING_MODE environment variable is set to 'true'
 */
export function isDeveloperMode(): boolean {
    return process.env.DEVELOPING_MODE === 'true';
}

/**
 * Generate a mock streaming response that simulates LLM streaming behavior
 *
 * Chunks the hardcoded response into small pieces and calls the onChunk callback
 * with delays to simulate real streaming behavior.
 *
 * @param onChunk - Callback function to receive each chunk of the response
 * @returns Promise<string> - The complete mock response text
 */
export async function generateMockStreamingResponse(
    onChunk: (chunk: string) => void
): Promise<string> {
    const mockResponse = 'This is a test response in developer mode.';
    const chunkSize = 15;
    const delayMs = 30;

    appLogger.log('[DEVELOPER-MODE] 🧪 Generating mock streaming response...');

    let fullResponse = '';

    for (let i = 0; i < mockResponse.length; i += chunkSize) {
        const chunk = mockResponse.slice(i, i + chunkSize);
        fullResponse += chunk;
        onChunk(chunk);

        if (i + chunkSize < mockResponse.length) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    appLogger.log('[DEVELOPER-MODE] ✅ Mock streaming response completed');

    return fullResponse;
}

/**
 * Get mock struggle words for memory agent testing
 *
 * @returns string[] - Array of test struggle words
 */
export function getMockStruggleWords(): string[] {
    return ['test-concept', 'sample-topic'];
}

/**
 * Get mock generated instructor struggle-topic labels (upload-time generation).
 *
 * @returns string[] - MTRL-style lowercase descriptive phrases for dev mode
 */
export function getMockGeneratedStruggleTopics(): string[] {
    return [
        'mock nernst equation and cell potential relationships',
        'mock galvanic cell schematic representation',
    ];
}

/**
 * Force a pathway trigger in developer mode without calling the evaluator LLM.
 *
 * Reads `PATHWAY_MOCK_TRIGGER` or legacy `GUARDRAIL_MOCK_TRIGGER`. When unset,
 * returns null and the orchestrator proceeds to a real structured call.
 *
 * @param courseName - Substituted into response templates
 * @param pathways - Evaluable pathways (falls back to platform seeds if empty)
 * @returns Mock {@link PathwayEvaluationResult} when env is set; otherwise null
 */
export function getMockPathwayEvaluation(
    courseName: string,
    pathways: readonly GuidedPathway[]
): PathwayEvaluationResult | null {
    if (!isDeveloperMode()) {
        return null;
    }

    const triggerId =
        process.env.PATHWAY_MOCK_TRIGGER?.trim() ||
        process.env.GUARDRAIL_MOCK_TRIGGER?.trim();
    if (!triggerId) {
        return null;
    }

    const pool = pathways.length > 0 ? pathways : buildPlatformPathwaySeeds();
    const match = pool.find((p) => p.id === triggerId);
    if (!match) {
        appLogger.warn(`[DEVELOPER-MODE] Invalid PATHWAY/GUARDRAIL_MOCK_TRIGGER: ${triggerId}`);
        return null;
    }

    return buildPathwayResult(triggerId, courseName, pool);
}

/** @deprecated Prefer getMockPathwayEvaluation — retained for transitional imports. */
export function getMockGuardrailEvaluation(courseName: string): PathwayEvaluationResult | null {
    return getMockPathwayEvaluation(courseName, buildPlatformPathwaySeeds());
}

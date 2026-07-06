/**
 * Developer Mode Module
 * 
 * This module provides utilities for bypassing LLM API calls during development
 * to reduce costs. When DEVELOPING_MODE environment variable is set to 'true',
 * the system uses hardcoded mock responses instead of making actual LLM calls.
 * 
 * Key Features:
 * - Check if developer mode is enabled
 * - Generate mock streaming responses for chat
 * - Provide mock struggle words for memory agent
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { appLogger } from '../utils/logger';

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
    const mockResponse = "This is a test response in developer mode.";
    const chunkSize = 15; // Chunk size in characters
    const delayMs = 30; // Delay between chunks in milliseconds
    
    appLogger.log('[DEVELOPER-MODE] 🧪 Generating mock streaming response...');
    
    let fullResponse = '';
    
    // Split response into chunks and stream them
    for (let i = 0; i < mockResponse.length; i += chunkSize) {
        const chunk = mockResponse.slice(i, i + chunkSize);
        fullResponse += chunk;
        
        // Call the chunk callback
        onChunk(chunk);
        
        // Add delay to simulate real streaming (except for last chunk)
        if (i + chunkSize < mockResponse.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
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
    return ["test-concept", "sample-topic"];
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
 * Get one mock generated scenario question for Practice Scenarios developer-mode generation.
 * Shape matches `scenario-generation-schema.ts`'s `singleScenarioSchema`.
 */
export function getMockGeneratedScenario(): {
    title: string;
    questionBody: string;
    solutionBody: string;
    subQuestions: Array<{ partId: 'a' | 'b' | 'c' | 'd'; prompt: string; modelAnswer: string }>;
} {
    return {
        title: '[DEV MODE] Mock generated scenario',
        questionBody:
            'You are a process engineer at a pilot plant. During the morning shift, the reactor ' +
            'is running 15% below the design conversion rate and the operator has flagged an ' +
            'unexpected temperature drift on the jacket cooling loop.',
        solutionBody:
            '[DEV MODE] The baseline conversion is calculated from the design rate law. The deviation ' +
            'is consistent with catalyst deactivation and reduced heat transfer efficiency.',
        subQuestions: [
            { partId: 'a', prompt: '[DEV MODE] Calculate the design conversion rate given the feed conditions.', modelAnswer: '[DEV MODE] Baseline conversion model answer.' },
            { partId: 'b', prompt: '[DEV MODE] List plausible reasons for the observed 15% deviation.', modelAnswer: '[DEV MODE] Reasons model answer.' },
            { partId: 'c', prompt: '[DEV MODE] Recommend corrective actions.', modelAnswer: '[DEV MODE] Actions model answer.' },
        ],
    };
}

/** Get a mock check-answer verdict/guidance pair for developer-mode scenario feedback. */
export function getMockScenarioFeedback(): { verdict: 'correct' | 'needs_improvement'; guidance?: string } {
    return {
        verdict: 'needs_improvement',
        guidance: '[DEV MODE] What governing equation applies here? What assumption might not hold?',
    };
}


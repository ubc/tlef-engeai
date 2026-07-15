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
 * Shape matches `scenario-schemas.ts` generatedScenarioSchema (no partId — server assigns subQuestionId).
 */
export function getMockGeneratedScenario(
    types: Array<'calculation' | 'troubleshoot' | 'action' | 'corrective'> = [
        'calculation',
        'troubleshoot',
        'action',
    ]
): {
    title: string;
    questionBody: string;
    solutionBody: string;
    subQuestions: Array<{
        subQuestionType: 'calculation' | 'troubleshoot' | 'action' | 'corrective';
        prompt: string;
        modelAnswer: string;
    }>;
} {
    const subQuestions = types.map((subQuestionType) => ({
        subQuestionType,
        prompt: `[DEV MODE] ${subQuestionType} prompt for this scenario.`,
        modelAnswer: `# Step 1\n[DEV MODE] ${subQuestionType} model answer.`,
    }));
    return {
        title: '[DEV MODE] Mock generated scenario',
        questionBody:
            'You are a process engineer at a pilot plant. During the morning shift, the reactor ' +
            'is running 15% below the design conversion rate and the operator has flagged an ' +
            'unexpected temperature drift on the jacket cooling loop.',
        solutionBody: subQuestions.map((s) => s.modelAnswer).join('\n\n'),
        subQuestions,
    };
}

/** Get a mock grade/feedback pair for developer-mode exam grading. */
export function getMockScenarioFeedback(): { grade: number; feedback: string } {
    return {
        grade: 7,
        feedback:
            '[DEV MODE] The approach is mostly sound. Check that units and assumptions are applied consistently throughout the calculation.',
    };
}

/** Get mock practice TA feedback (no grade) for developer-mode check-answer. */
export function getMockScenarioPracticeFeedback(): { feedback: string } {
    return {
        feedback:
            '[DEV MODE] Nice start — your setup looks reasonable. Double-check unit consistency and whether every assumption matches the scenario before you finalize the calculation.',
    };
}


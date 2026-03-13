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
    
    console.log('[DEVELOPER-MODE] 🧪 Generating mock streaming response...');
    
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
    
    console.log('[DEVELOPER-MODE] ✅ Mock streaming response completed');
    
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


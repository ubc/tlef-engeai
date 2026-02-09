/**
 * Hardcoded responses for unstruggle feature
 * These responses are used when a student confirms they're confident with a topic
 * or when they indicate they need more practice
 */

/**
 * Responses when student clicks "Yes" (confident with topic)
 */
export const UNSTRUGGLE_YES_RESPONSES: string[] = [
    "Great! Is there anything else I can help you with?",
    "Excellent! Feel free to ask if you have any other questions.",
    "Wonderful! Let me know if there's anything more you'd like to explore.",
    "That's fantastic! I'm here if you need help with anything else.",
    "Awesome! Don't hesitate to reach out if you have more questions.",
    "Perfect! What else would you like to work on?",
    "Great to hear! Is there another topic you'd like to discuss?",
    "Excellent! I'm here whenever you need assistance with other concepts."
];

/**
 * Responses when student clicks "No, I need more practice"
 */
export const UNSTRUGGLE_NO_RESPONSES: string[] = [
    "No problem! Would you like to practice more with this topic?",
    "That's perfectly fine! Let's continue practicing. What would you like to focus on?",
    "I understand. Let's work through some more examples together. What aspect would you like to explore?",
    "Sure thing! We can keep practicing. What specific part would you like to work on?",
    "Of course! Let's dive deeper. What would you like to practice?",
    "Absolutely! What would you like to focus on for more practice?",
    "That's okay! Let's continue working on this. What would you like to explore next?",
    "No worries! I'm here to help you practice. What would you like to work on?"
];

/**
 * Get a random response from the yes responses array
 */
export function getRandomYesResponse(): string {
    const randomIndex = Math.floor(Math.random() * UNSTRUGGLE_YES_RESPONSES.length);
    return UNSTRUGGLE_YES_RESPONSES[randomIndex];
}

/**
 * Get a random response from the no responses array
 */
export function getRandomNoResponse(): string {
    const randomIndex = Math.floor(Math.random() * UNSTRUGGLE_NO_RESPONSES.length);
    return UNSTRUGGLE_NO_RESPONSES[randomIndex];
}

/**
 * Responses when unstruggle deletion fails at database level
 * Used when struggle topic is already removed or concurrent operations occur
 */
export const UNSTRUGGLE_FAILURE_RESPONSES: string[] = [
    "We find that you are already mastered this topic. Thank you for trusting EngE AI.",
    // Add more variations if needed
];

/**
 * Get a random failure response
 */
export function getRandomFailureResponse(): string {
    const randomIndex = Math.floor(Math.random() * UNSTRUGGLE_FAILURE_RESPONSES.length);
    return UNSTRUGGLE_FAILURE_RESPONSES[randomIndex];
}

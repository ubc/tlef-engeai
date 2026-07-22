/**
 * Hardcoded responses for unstruggle feature
 * These responses are used when a student confirms they're confident with a topic
 * or when they indicate they need more practice
 */

/** Yes follow-up when published scenario questions resolve for selected LOs. */
export const UNSTRUGGLE_YES_WITH_SCENARIOS_RESPONSES: string[] = [
    'Great job mastering {topic}! Try these practice scenario questions to keep building your skills.',
    'Excellent work on {topic}! Here are some scenario questions that can help you go deeper.',
    'Nice progress with {topic}! These practice scenario questions are a great next step.',
    "You're doing well with {topic}! Give these scenario questions a try when you're ready.",
    'Fantastic — sounds like {topic} is clicking for you. Practice with the scenario questions below.',
    'Well done on {topic}! Working through a few scenario questions is a solid way to reinforce what you learned.',
    "Great to hear you're confident with {topic}! The scenario questions below are a good follow-up.",
    'Awesome progress on {topic}! Try a scenario question below to put your understanding into practice.',
];

/** Yes follow-up when no scenario questions are available to suggest. */
export const UNSTRUGGLE_YES_NO_SCENARIOS_RESPONSES: string[] = [
    'Great work on {topic}! Feel free to ask if you want to explore anything else.',
    "Nice job with {topic}! I'm here whenever you have more questions.",
    'Excellent progress on {topic}! Keep practicing with your course materials.',
    "That's great to hear about {topic}! Let me know what you'd like to work on next.",
    'Wonderful — glad {topic} is making sense. Ask anytime you want to go further.',
    'Good work on {topic}! You can always come back here if another concept feels tricky.',
    'Solid progress on {topic}! What would you like to tackle next?',
    "Great to hear you're comfortable with {topic}! I'm here if you need help with anything else.",
];

/**
 * Responses when student clicks "No, I need more practice"
 */
export const UNSTRUGGLE_NO_RESPONSES: string[] = [
    'No problem! Would you like to practice more with this topic?',
    "That's perfectly fine! Let's continue practicing. What would you like to focus on?",
    "I understand. Let's work through some more examples together. What aspect would you like to explore?",
    "Sure thing! We can keep practicing. What specific part would you like to work on?",
    "Of course! Let's dive deeper. What would you like to practice?",
    'Absolutely! What would you like to focus on for more practice?',
    "That's okay! Let's continue working on this. What would you like to explore next?",
    "No worries! I'm here to help you practice. What would you like to work on?",
];

function pickRandom(pool: readonly string[]): string {
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * formatUnstruggleYesMessage - substitute cleared struggle topic into a template.
 */
export function formatUnstruggleYesMessage(template: string, topic: string): string {
    return template.replace(/\{topic\}/g, topic.trim());
}

/**
 * getRandomYesWithScenariosMessage - encouragement when scenario question links will be shown.
 */
export function getRandomYesWithScenariosMessage(topic: string): string {
    return formatUnstruggleYesMessage(pickRandom(UNSTRUGGLE_YES_WITH_SCENARIOS_RESPONSES), topic);
}

/**
 * getRandomYesNoScenariosMessage - encouragement when no scenario questions resolve.
 */
export function getRandomYesNoScenariosMessage(topic: string): string {
    return formatUnstruggleYesMessage(pickRandom(UNSTRUGGLE_YES_NO_SCENARIOS_RESPONSES), topic);
}

/**
 * Get a random response from the no responses array
 */
export function getRandomNoResponse(): string {
    return pickRandom(UNSTRUGGLE_NO_RESPONSES);
}

/**
 * Responses when unstruggle deletion fails at database level
 * Used when struggle topic is already removed or concurrent operations occur
 */
export const UNSTRUGGLE_FAILURE_RESPONSES: string[] = [
    'We find that you are already mastered this topic. Thank you for trusting EngE AI.',
];

/**
 * Get a random failure response
 */
export function getRandomFailureResponse(): string {
    return pickRandom(UNSTRUGGLE_FAILURE_RESPONSES);
}

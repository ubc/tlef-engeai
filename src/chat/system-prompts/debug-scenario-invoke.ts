/**
 * Debug Scenario Invoke — sticky-DEBUG `/scenario` slash command
 *
 * Admin-only helper used while sticky DEBUG mode is on. Detects `/scenario`,
 * parses an optional topic, and reuses the unstruggle-Yes practice suggestion
 * pipeline so chips can be tested without walking the full struggle UI path.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-11
 * @version: 1.0.0
 * @description: DEBUG-gated /scenario detect, parse, and invoke.
 */

import {
    suggestPracticeAfterUnstruggleYes,
    type UnstruggleYesFollowupResult,
} from '../../memory-agent/unstruggle-yes-followup';
import { appLogger } from '../../utils/logger';

const SCENARIO_SLASH_REGEX = /^\/scenario(?:\s|$)/i;

/** Default topic when `/scenario` is sent with no argument. */
export const DEFAULT_SCENARIO_DEBUG_TOPIC = 'debug';

/** Input for {@link invokeDebugScenarioSuggestions}. */
export interface InvokeDebugScenarioSuggestionsInput {
    userId: string;
    courseName: string;
    /** Raw chat message (e.g. `/scenario Heat transfer`). */
    message: string;
    /** Recent chat excerpt for the forked LO-selection prompt. */
    recentMessages: string;
}

/**
 * isScenarioDebugMessage - True when the message is a `/scenario` slash command.
 *
 * Matches `/scenario` alone or `/scenario <topic>` (case-insensitive). Extra
 * whitespace around the command is ignored via trim.
 *
 * @param message - Raw chat input
 * @returns Whether this message is the debug scenario slash command
 */
export function isScenarioDebugMessage(message: string): boolean {
    return SCENARIO_SLASH_REGEX.test(message.trim());
}

/**
 * parseScenarioDebugTopic - Topic after `/scenario`, or {@link DEFAULT_SCENARIO_DEBUG_TOPIC}.
 *
 * @param message - Raw chat input that already matched {@link isScenarioDebugMessage}
 * @returns Cleared-struggle topic string for the Yes follow-up pipeline
 */
export function parseScenarioDebugTopic(message: string): string {
    const trimmed = message.trim();
    const withoutCommand = trimmed.replace(/^\/scenario\s*/i, '').trim();
    return withoutCommand || DEFAULT_SCENARIO_DEBUG_TOPIC;
}

/**
 * invokeDebugScenarioSuggestions - Run unstruggle-Yes practice suggestion for DEBUG `/scenario`.
 *
 * Does not remove struggle words or strip unstruggle tags — this is a test short-circuit.
 * Returns the same display payload the production Yes path embeds in the bot reply.
 *
 * @param input - User/course, raw slash message, and recent chat excerpt
 * @returns Follow-up result including `displayText` (may include `<scenarioSuggestions>`)
 */
export async function invokeDebugScenarioSuggestions(
    input: InvokeDebugScenarioSuggestionsInput
): Promise<UnstruggleYesFollowupResult & { topic: string }> {
    const topic = parseScenarioDebugTopic(input.message);

    appLogger.log(`[DEBUG-SCENARIO] Invoking Yes follow-up for topic="${topic}" course=${input.courseName}`);

    const followUp = await suggestPracticeAfterUnstruggleYes({
        userId: input.userId,
        courseName: input.courseName,
        clearedStruggleTopic: topic,
        recentMessages: input.recentMessages,
    });

    return { ...followUp, topic };
}

/**
 * Message utility functions for the EngE-AI platform
 * @author: EngE-AI Team
 * @since: 2026-02-23
 */

import type { ScenarioDifficulty, ScenarioSuggestionForChat } from '../types/shared';

const SCENARIO_DIFFICULTIES: ScenarioDifficulty[] = ['easy', 'medium', 'hard'];

function normalizeScenarioSuggestionDifficulty(value: unknown): ScenarioDifficulty {
    return typeof value === 'string' && SCENARIO_DIFFICULTIES.includes(value as ScenarioDifficulty)
        ? (value as ScenarioDifficulty)
        : 'medium';
}

/**
 * Removes the <questionUnstruggle Topic="X"> tag from message text.
 * Used when user dismisses the confidence question via "No, maybe later".
 *
 * @param text - The message text containing the tag
 * @param topic - The topic value to match (e.g. "thermodynamics")
 * @returns The message text with the tag removed
 */
export function stripQuestionUnstruggleTag(text: string, topic: string): string {
    const escapedTopic = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagRegex = new RegExp(
        `\\s*<questionUnstruggle\\s+Topic=["']${escapedTopic}["']\\s*>\\s*`,
        'gi'
    );
    return text.replace(tagRegex, '').replace(/\n{3,}/g, '\n\n').trim();
}

const SCENARIO_SUGGESTIONS_TAG_REGEX =
    /\s*<scenarioSuggestions>([\s\S]*?)<\/scenarioSuggestions>\s*/gi;

/**
 * parseScenarioSuggestionsTag - extract scenario list from persisted bot message text.
 */
export function parseScenarioSuggestionsTag(text: string): ScenarioSuggestionForChat[] {
    const match = SCENARIO_SUGGESTIONS_TAG_REGEX.exec(text);
    SCENARIO_SUGGESTIONS_TAG_REGEX.lastIndex = 0;
    if (!match?.[1]) return [];
    try {
        const parsed = JSON.parse(match[1].trim()) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (item): item is ScenarioSuggestionForChat =>
                    !!item &&
                    typeof item === 'object' &&
                    typeof (item as ScenarioSuggestionForChat).id === 'string' &&
                    typeof (item as ScenarioSuggestionForChat).title === 'string'
            )
            .map((item) => ({
                id: item.id.trim(),
                title: item.title.trim(),
                difficulty: normalizeScenarioSuggestionDifficulty(
                    (item as { difficulty?: unknown }).difficulty
                ),
            }))
            .filter((item) => item.id && item.title);
    } catch {
        return [];
    }
}

/**
 * stripScenarioSuggestionsTag - remove embedded scenario suggestions from message text.
 */
export function stripScenarioSuggestionsTag(text: string): string {
    return text.replace(SCENARIO_SUGGESTIONS_TAG_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * appendScenarioSuggestionsTag - append render tag for FE reload persistence.
 */
export function appendScenarioSuggestionsTag(
    messageText: string,
    suggestions: ScenarioSuggestionForChat[]
): string {
    if (!suggestions.length) return messageText.trim();
    const payload = JSON.stringify(
        suggestions.map((s) => ({ id: s.id, title: s.title, difficulty: s.difficulty }))
    );
    const base = messageText.trim();
    return `${base}\n\n<scenarioSuggestions>${payload}</scenarioSuggestions>`;
}

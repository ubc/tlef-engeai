/**
 * Message utility functions for the EngE-AI platform
 * @author: EngE-AI Team
 * @since: 2026-02-23
 */

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

/**
 * Struggle-topics user-turn bridge — list injection plus adaptive Socratic guidance.
 *
 * ChatApp appends this to the forked LLM user context, where it lands after the RAG
 * bridge and the student message. That last position is why the adaptive guidance
 * is repeated here instead of relying on the system prompt alone: the system message is
 * built once at chat creation, so this is the only per-turn channel. Unstruggle emit is
 * decided by system-prompt modules (socratic analyser), not by runtime reveal tags.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-10
 * @version: 1.2.0
 * @description: Format <struggle_topics> bridge prose for Socratic chat turns.
 */

/**
 * Compact adaptive guidance for the Socratic path, mirroring `socratic_conversation.md`.
 *
 * Deliberate duplication: the module owns the rule, this repeats it at the point of
 * decision. Keep the two wordings in sync when either changes.
 */
const SOCRATIC_ADAPTIVE_GUIDANCE =
    'On the Socratic path, preserve student ownership: increase help after repeated impasse ' +
    '(prompt, hint, partial representation, one modelled step, brief explanation), then require ' +
    'the student to explain, complete, or apply the next step. LaTeX, lists, diagrams, and concise ' +
    'explanations are allowed when they make that next contribution possible.';

/**
 * formatStruggleTopicsUserBridge - build user-turn struggle list context (no reveal tags).
 *
 * Non-empty topics inject `<struggle_topics>…</struggle_topics>`, point at the system
 * modules for routing, and attach adaptive guidance to the socratic branch. Empty topics
 * inject an empty list, mark interpretive/practice/unstruggle inactive for the turn, and
 * state the contract outright. Prose is routing-only: never address the student about the list.
 *
 * @param topics - Exact struggle labels for this student/course (this turn)
 * @returns Bridge prose to append to the LLM user turn
 */
export function formatStruggleTopicsUserBridge(topics: string[]): string {
    if (topics.length > 0) {
        return (
            `Private routing context for this turn only: <struggle_topics>${topics.join(', ')}</struggle_topics>\n` +
            'Use this list only to choose socratic vs interpretive conversation and whether to append ' +
            '<questionUnstruggle Topic="…"> per the system prompt. Unless the question is an exact or strong ' +
            'match to a label above, begin with a focused scaffold for that skill; otherwise use ' +
            'socratic conversation. ' +
            SOCRATIC_ADAPTIVE_GUIDANCE +
            ' Never name list labels, say the question is/is not on the list, or narrate relevance to the student.'
        );
    }

    return (
        `Private routing context for this turn only: <struggle_topics></struggle_topics>\n` +
        'Socratic conversation only this turn: interpretive conversation, practice questions, and ' +
        '<questionUnstruggle Topic="…"> are inactive. ' +
        SOCRATIC_ADAPTIVE_GUIDANCE +
        ' Never mention struggle topics or missing list context to the student.'
    );
}

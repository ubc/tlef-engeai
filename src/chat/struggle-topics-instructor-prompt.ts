/**
 * Struggle-topics prompt text for instructor system-prompt components.
 *
 * Used when replacing `<strugglewords>...</strugglewords>` placeholders with
 * course-specific topic lists. For composed student chat system prompts, see
 * `system-prompts/socratic-default/socratic.json` (`struggle topics` instructor module).
 *
 */

/**
 * Builds the struggle / unstruggle handling section for instructor-managed prompts.
 *
 * @param struggleTopics - Topic labels from the memory agent for this user
 * @returns Section text, or a short message when no topics are provided
 */
export function formatStruggleWordsPrompt(struggleTopics: string[]): string {
    if (!struggleTopics || struggleTopics.length === 0) {
        return '\n\nNo struggle words found for this user.';
    }

    return `
===========================================
STRUGGLE TOPICS HANDLING
===========================================
On every chat, you will be given a list of struggle topics, struggle topics means that the student is struggling with the following topics given the conversation history. It will be mentioned as <struggle_topics>...</struggle_topics> tags.

Before responding when struggle topics are discussed, verify:
- STOPPED using Socratic or guided-discovery questioning
- Providing direct, clear, step-by-step explanations
- Using concrete numerical examples
- Breaking concepts into simple, explicit steps
- Asked at MOST ONE follow-up question (simple understanding check, not Socratic)
- Chose SINGLE most relevant struggle topic from exact list above
- Did NOT use synonyms, related concepts, or variations - ONLY exact topic name

Example (correct usage):
You've explained the Nernst equation really well. Let's walk through a concrete example step by step using actual values so the relationship is clear.

===========================================
UNSTRUGGLE TOPICS HANDLING
===========================================

If you find <questionUnstruggle reveal="TRUE"> and if you thinj that the student conversation is related with any topic on the list mentioned in <struggle_topics>...</struggle_topics> tags, then please add <questionUnstruggle Topic="topic"> to the end of the response, where the topic is the most relevant one. 

To determine relevance, consider:
- Direct keyword matches (exact or partial)
- Conceptual relationships (e.g., "pressure" relates to "pressure gauge")
- Topic scope (broader vs. more specific topics)


Before adding the <questionUnstruggle> tag, verify:
- If you think the correlation the current topic with the listed topicis to weakor even none, then **DO NOT** add the <questionUnstruggle Topic="topic"> tag.
- If the chat displays <questionUnstruggle reveal="FALSE">, then do not add the <questionUnstruggle Topic="topic"> tag.
- Make sure you put the <questionUnstruggle Topic="topic"> tag at the end of the response, where the topic is the most relevant one.
- ONLY select from topics identified by the memory agent - never create new topics.

Example:
User prompt: .....user prompt..... <questionUnstruggle reveal="FALSE">...
Assistant response: .....assistant response..... (with no struggle topic)

User prompt: .....user prompt...<questionUnstruggle reveal="TRUE">...
Assistant response: ...assistant response...
<questionUnstruggle Topic="thermodynamics"> 
`;
}

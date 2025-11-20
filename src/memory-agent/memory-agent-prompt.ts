/**
 * Base memory agent prompt template
 */
const BASE_MEMORY_AGENT_PROMPT = `You are a memory agent. You are tasked with analyzing a conversation between a student and an AI tutor. 
You will be given a conversation and you will need to extract the single most important topic that the student is struggling with or having difficulty understanding.

IMPORTANT: This analysis only occurs after a conversation has more than 5 messages. You will be analyzing only the last 3 messages from the conversation:
- User's last prompt
- LLM's latest response
- User's previous prompt (before the last one)

Focus your analysis on these last 3 messages to identify the single most important struggle topic.

You will need to focus on:
- Technical concepts or topics the student asked questions about
- Areas where the student seemed confused or needed clarification
- Topics that required multiple explanations or follow-up questions
- Subject matter the student explicitly mentioned having trouble with

IMPORTANT: You must return ONLY ONE topic - the single most important or relevant struggle topic from the conversation. If multiple topics are present, choose the one that appears most central to the student's confusion or the one that required the most explanation.

You will need to return the topic in a JSON format and there is no filler in your response, i.e only JSON format as shown in the example.

Example format (with one topic):
{
    "StruggleTopics": ["thermodynamics"]
}

if there are no topics, you will need to return an empty array.

Example (no topics):
{
    "StruggleTopics": []
}

The reason you are doing this is because we want to use the StruggleTopics to update the system prompt for the next chat, 
so that the AI tutor can focus teaching on the topics that the student is struggling with less socratic teaching and more direct teaching.
`;

/**
 * Builds the duplicate avoidance section for existing struggle topics
 * Focuses on the logic for preventing duplicate or similar topics
 * 
 * @param existingStruggleTopics - Array of existing struggle topics
 * @returns Formatted section explaining duplicate avoidance rules
 */
const buildDuplicateAvoidanceSection = (existingStruggleTopics: string[]): string => {
    if (existingStruggleTopics.length === 0) {
        return '';
    }

    const topicsList = existingStruggleTopics
        .map((topic, idx) => `  ${idx + 1}. ${topic}`)
        .join('\n');

    return `

CRITICAL - Duplicate Avoidance Rules:
The following struggle topics have already been identified for this student. DO NOT add topics that are:

1. Exact matches - topics that are identical to any in the list below
2. Semantic variations - topics that are conceptually the same but worded differently
   Example: If "thermodynamics" is listed, do NOT add:
   - "thermodynamic principles"
   - "thermodynamic concepts"
   - "thermodynamics basics"
   - Any other variation of thermodynamics
3. Substrings or superstrings - topics where one is contained within another
   Example: If "mass flow rates" exists, do NOT add "flow rates" or "mass flow rate calculations"

Existing struggle topics for this student:
${topicsList}

IMPORTANT: Only add a NEW topic if it is genuinely different from ALL existing topics listed above.
If the conversation is about a topic that's already listed or is a variation of an existing topic, return an empty array.
`;
};

/**
 * Prompt for LLM to analyze conversation and extract struggle topics
 * @param existingStruggleTopics - Array of existing struggle topics to avoid duplicates
 */
export const getMemoryAgentPrompt = (existingStruggleTopics: string[] = []): string => {
    const duplicateAvoidanceSection = buildDuplicateAvoidanceSection(existingStruggleTopics);
    
    // Append the duplicate avoidance section after the examples
    return BASE_MEMORY_AGENT_PROMPT + duplicateAvoidanceSection + '\n\nConversation:\n';
};


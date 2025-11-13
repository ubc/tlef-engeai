/**
 * Prompt for LLM to analyze conversation and extract struggle topics
 */
export const STRUGGLE_ANALYSIS_PROMPT = `Analyze the following conversation between a student and an AI tutor. Identify specific topics, concepts, or subject areas that the student appears to be struggling with or having difficulty understanding.

Focus on:
- Technical concepts or topics the student asked questions about
- Areas where the student seemed confused or needed clarification
- Topics that required multiple explanations or follow-up questions
- Subject matter the student explicitly mentioned having trouble with

Return ONLY a comma-separated list of topic names (no explanations, no numbering, no additional text). Each topic should be a concise phrase (1-3 words) representing a specific concept or subject area.

Example format: "thermodynamics, Nernst equation, pressure measurements, mass flow rates"

Conversation:
`;


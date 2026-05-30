/**
 * RAG prompt constants and chat user-turn context assembly.
 *
 * Stateless formatting layer — use the exported {@link ragPrompts} instance
 * (same pattern as {@link conversationModePrompts} in compose-system-prompt.ts).
 */

import { RetrievedChunk } from 'ubc-genai-toolkit-rag';
import { ConversationModeId } from '../types/shared';
import { appLogger } from '../utils/logger';

export const COURSE_MATERIALS_OPEN = '<course_materials>';

export const COURSE_MATERIALS_CLOSE = '</course_materials>';

export const RAG_ERROR_MESSAGE = `I apologize, but I'm having trouble accessing the course materials right now. Let me help you with your question based on general engineering principles, though I may not have access to specific course content.

What would you like to explore? I can still guide you through problem-solving approaches and fundamental engineering concepts.`;

export const RAG_CONTEXT_SEPARATOR = `

---

`;

/** Used when retrieval succeeds but returns zero published chunks for the query. */
export const RAG_NO_DOCS_MESSAGE =
    'No relevant documents from RAG found for this user message \n';

const RAG_BRIDGE_PROMPT = `Based on the course materials and context provided above, help the student using the Socratic method. CRITICAL: Ask ONLY ONE question at a time.

When responding:

1. **ASK ONE QUESTION ONLY** - This is mandatory. Do not ask multiple questions in a single response. Wait for the student to answer before asking your next question.

2. **CITE SPECIFIC SOURCE LOCATIONS** - Always reference where in the course materials you found the information:
   - "According to Chapter 12.1, we learned that..."
   - "In Section 3.2, the materials discuss..."
   - "From the module on [topic] (Section X.Y)..."
   - Use specific chapter, section, module numbers when available

3. **USE SOCRATIC QUESTIONING** - Frame your response as a question that guides the student to discover the answer rather than explaining directly.

4. **BUILD PROGRESSIVELY** - Build on the student's previous answer when asking your next question. Acknowledge what they got right before deepening with the next question.

5. **CONNECT TO MATERIALS** - Use specific examples and data from the course materials, but present them through questioning:
   - "In Chapter 12's example on batteries, we saw data showing X. Can you explain what principle this demonstrates?"

Remember: Your primary job is to ask thoughtful, guided questions - one at a time - that help students discover understanding through the course materials. Wait for their response before proceeding.

Student's question:`;

const DEFAULT_MODE_ID: ConversationModeId = 'socratic';

const STUDENT_QUESTION_MARKER = "Student's question:";

/**
 * RAGPrompts - formats retrieved chunks and assembles RAG user turns for chat.
 */
export class RAGPrompts {

    private static instance: RAGPrompts | null = null;
    private static readonly courseMaterialsBlock = /<course_materials>[\s\S]*?<\/course_materials>/g;
    private static readonly separatorPattern = new RegExp(
        RAG_CONTEXT_SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'g'
    );

    private static readonly bridgePattern = new RegExp(
        `${RAG_BRIDGE_PROMPT.split('\n')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?Student's question:`,
        'g'
    );

    private constructor() {}

    /**
     * getInstance - returns the process-wide singleton (stateless namespace).
     */
    public static getInstance(): RAGPrompts {
        if (!RAGPrompts.instance) {
            RAGPrompts.instance = new RAGPrompts();
        }
        return RAGPrompts.instance;
    }

    private resolveModeId(input?: string | null): ConversationModeId {
        if (input === 'socratic' || input === 'explanatory') {
            return input;
        }
        return DEFAULT_MODE_ID;
    }

    /**
     * formatRetrievedContext - formats the retrieved document chunks into a context string
     * 
     * @param documents - The retrieved document chunks
     * @returns The formatted context string with the course materials XML envelope
     */
    public formatRetrievedContext(documents: RetrievedChunk[]): string {
        if (documents.length === 0) {
            return '';
        }

        let context = `\n\n${COURSE_MATERIALS_OPEN}\n`;

        // add each document to the context
        documents.forEach((doc, index) => {
            let chapter = '';
            let itemTitle = '';

            try {
                let metadataObj: Record<string, unknown> = {};
                if (typeof doc.metadata === 'string') {
                    metadataObj = JSON.parse(doc.metadata) as Record<string, unknown>;
                } else if (doc.metadata && typeof doc.metadata === 'object') {
                    metadataObj = doc.metadata as Record<string, unknown>;
                }

                chapter = (metadataObj.topicOrWeekTitle as string) || '';
                itemTitle = (metadataObj.itemTitle as string) || '';
            } catch (error) {
                appLogger.warn(`⚠️ Error parsing metadata for document ${index + 1}:`, error);
            }

            const modulePartLabel =
                chapter && itemTitle
                    ? `${chapter} part ${itemTitle}`
                    : chapter || itemTitle || 'Unknown';
            context += `\n--- START document - ${modulePartLabel} ---\n`;
            context += `${doc.content}\n`;
            context += `--- END document - ${modulePartLabel} ---\n`;
        });

        context += `\n${COURSE_MATERIALS_CLOSE}\n`;

        appLogger.log(`DEBUG #287: Formatted documents for context: ${context}`);
        return context;
    }

    /**
     * Formats the user turn sent to the LLM when RAG context is present.
     *
     * Socratic mode appends the RAG bridge instructions; other modes use context + message only.
     *
     * @param modeId - Teaching mode for this chat
     * @param context - Retrieved document text (already formatted)
     * @param userMessage - Raw student message
     * @returns Combined prompt string for the user role
     */
    public formatRagUserTurn(
        modeId: ConversationModeId | string | undefined,
        context: string,
        userMessage: string
    ): string {
        const resolved = this.resolveModeId(modeId);
        if (resolved === 'socratic') {
            return `${context}${RAG_CONTEXT_SEPARATOR}${RAG_BRIDGE_PROMPT}${userMessage}`;
        }
        return `${context}${RAG_CONTEXT_SEPARATOR}${userMessage}`;
    }

    /**
     * Removes RAG document blocks, separators, and bridge prompts from a user message.
     * 
     * @param content - The user message to strip the RAG context from
     * @returns The user message with the RAG context stripped
     */
    public stripRagFromUserMessage(content: string): string {
        if (!content.includes(COURSE_MATERIALS_OPEN)) {
            return content;
        }

        let stripped = content.replace(RAGPrompts.courseMaterialsBlock, '');
        stripped = stripped.replace(RAGPrompts.separatorPattern, '');
        stripped = stripped.replace(RAGPrompts.bridgePattern, '');

        const questionIndex = stripped.indexOf(STUDENT_QUESTION_MARKER);
        if (questionIndex !== -1) {
            stripped = stripped.substring(questionIndex + STUDENT_QUESTION_MARKER.length).trim();
        }

        return stripped.trim();
    }
}

/** Process-wide singleton for RAG context formatting and user-turn assembly. */
export const ragPrompts = RAGPrompts.getInstance();

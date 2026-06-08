/**
 * Default welcome message for new chats (not part of the system prompt).
 *
 * Mode-neutral until the student selects Socratic or Explanatory on first message.
 */

export const DEFAULT_INITIAL_ASSISTANT_MESSAGE = `Hello! I'm EngE-AI, your virtual engineering tutor. I'm here to help you understand engineering concepts by connecting your questions to course materials.

Here's a diagram to help visualize how I can assist you:

<Artefact>
graph TD
    A["Your Question"]
    B["Course Materials"]
    C["Learning Support"]
    D["Understanding"]
    E["Practice Questions"]
    F["Visual Diagrams"]
    
    A --> C
    B --> C
    C --> D
    D --> E
    D --> F
    E --> D
    F --> D
</Artefact>

Before your first message, choose a conversation mode beside the send button:

<ul>
<li><strong>Socratic</strong> — guided questions to help you discover answers step by step</li>
<li><strong>Explanatory</strong> — clear explanations from course materials, with optional check-ins</li>
</ul>

I can help you with:

<ul>
<li>Understanding engineering concepts using your course materials</li>
<li>Working through problems with structured support</li>
<li>Visual diagrams to illustrate relationships between concepts</li>
</ul>

What would you like to explore today?

Remember: I am designed to enhance your learning, not replace it, always verify important information.`;

export function getDefaultAssistantMessage(studentName?: string): string {
    if (studentName) {
        return `Hello ${studentName}! ${DEFAULT_INITIAL_ASSISTANT_MESSAGE}`;
    }
    return DEFAULT_INITIAL_ASSISTANT_MESSAGE;
}

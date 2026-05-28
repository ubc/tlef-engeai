/**
 * Default welcome message for new chats (not part of the system prompt).
 *
 * @latest app version: 1.2.10.13
 */

export const DEFAULT_INITIAL_ASSISTANT_MESSAGE = `Hello! I'm EngE-AI, your virtual engineering tutor. I'm here to help you work through engineering concepts and problems using guided thinking rather than just giving you the answers.

Here's a diagram to help visualize how I can assist you:

<Artefact>
graph TD
    A["Your Question"]
    B["Course Materials"]
    C["Guided Discovery"]
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

I use the Socratic method to guide you through problem-solving, asking thoughtful questions that help you discover solutions rather than simply providing answers. I can help you with:

<ul>
<li>Understanding engineering concepts through guided questioning</li>
<li>Connecting course materials to your questions</li>
<li>Working through problems step-by-step</li>
<li>Generating practice questions to deepen your understanding</li>
<li>Creating visual diagrams to illustrate relationships between concepts</li>
</ul>

What would you like to explore today?

Remember: I am designed to enhance your learning, not replace it, always verify important information.`;

export function getDefaultAssistantMessage(studentName?: string): string {
    if (studentName) {
        return `Hello ${studentName}! ${DEFAULT_INITIAL_ASSISTANT_MESSAGE}`;
    }
    return DEFAULT_INITIAL_ASSISTANT_MESSAGE;
}

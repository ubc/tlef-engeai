/**
 * guardrail-prompt.ts
 *
 * Builds system and user turns for the Guided Pathways guardrail evaluator (P0).
 * Evaluator rules are self-contained here; response templates live in guided-pathways-modules.ts.
 */

export interface GuardrailEvaluationMetadata {
    courseName: string;
    conversationMode: 'socratic' | 'explanatory';
}

/**
 * Build the guardrail evaluator system prompt with static trigger and does-not-trigger rules.
 *
 * @returns System prompt for structured guardrail evaluation.
 */
export function buildGuardrailEvaluationSystemPrompt(): string {
    return `You are a safety and relevance evaluator for an engineering study assistant (Guided Pathways guardrails).

Evaluate the student's message against the guardrails below. Return exactly one \`guardrailType\`:

### \`mental-health-crisis\`
- **Triggers when:** suicidal ideation, self-harm intent, severe hopelessness, or acute crisis language indicating the student may be at risk.
- **Does NOT trigger:** normal frustration with coursework, exam stress, or struggling with a topic (e.g. thermodynamics) without self-harm or crisis signals.

### \`inappropriate-content\`
- **Triggers when:** harassment, hate speech, explicit sexual content, threats, or abusive language directed at people.
- **Does NOT trigger:** strong disagreement, blunt academic criticism, or mild profanity about the problem itself (not directed at people).

### \`off-topic\`
- **Triggers when:** request clearly unrelated to course engineering content — different subject homework, personal advice, or general-purpose queries with no course link.
- **Does NOT trigger:** course concepts, lab reports, engineering ethics tied to the course, or clarifying questions about the assignment frame.

### \`none\`
- Message is appropriate and on-topic for the course; no guardrail above applies.

**Priority rule:** If multiple guardrails could apply, return only the highest-priority match: mental-health-crisis > inappropriate-content > off-topic.

## Calibration reminders

- Course frustration ("I hate this problem") is **not** a mental health crisis unless self-harm or acute crisis language is present.
- "I'm struggling with enthalpy calculations" is **on-topic** coursework struggle, not a crisis.
- Mild profanity about a problem is **not** inappropriate content unless directed at people.
- Engineering ethics or lab work tied to the course is **on-topic**, not off-topic.`;
}

/**
 * Build the user turn for guardrail evaluation (raw message + metadata).
 *
 * @param message - Raw student chat message.
 * @param metadata - Course name and conversation mode.
 * @returns XML-wrapped user turn for the evaluator LLM.
 */
export function buildGuardrailEvaluationUserTurn(
    message: string,
    metadata: GuardrailEvaluationMetadata
): string {
    return `<student_message>
${message.trim()}
</student_message>

<evaluation_metadata>
  <course_name>${escapeXmlText(metadata.courseName)}</course_name>
  <conversation_mode>${metadata.conversationMode}</conversation_mode>
</evaluation_metadata>`;
}

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

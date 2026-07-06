/**
 * scenario-feedback-prompt.ts
 *
 * Builds system + user turns for Practice Scenarios check-answer grading from
 * `scenario-feedback-default/scenario_feedback_purpose_and_rules.md`.
 */

import fs from 'fs';
import path from 'path';

let cachedFeedbackPromptBody: string | null = null;

function loadScenarioFeedbackPromptBody(): string {
    if (cachedFeedbackPromptBody) {
        return cachedFeedbackPromptBody;
    }

    const candidates = [
        path.join(process.cwd(), 'dist/chat/system-prompts/scenario-feedback-default/scenario_feedback_purpose_and_rules.md'),
        path.join(process.cwd(), 'src/chat/system-prompts/scenario-feedback-default/scenario_feedback_purpose_and_rules.md'),
    ];

    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
            cachedFeedbackPromptBody = fs.readFileSync(filePath, 'utf8');
            return cachedFeedbackPromptBody;
        }
    }

    throw new Error(`scenario_feedback_purpose_and_rules.md not found. Expected one of: ${candidates.join(', ')}`);
}

/** Clears cached prompt body (for tests). */
export function clearScenarioFeedbackPromptCache(): void {
    cachedFeedbackPromptBody = null;
}

/** Full system prompt for check-answer grading. Used with `scenarioFeedbackResponseSchema`. */
export function buildScenarioFeedbackSystemPrompt(): string {
    return loadScenarioFeedbackPromptBody();
}

/**
 * User turn: narrative context, the specific sub-question being checked, its model answer
 * (grading ground truth only — never echoed to the student), and the student's submission.
 * XML-escaped to keep untrusted student input from breaking out of its element (E-13).
 */
export function buildScenarioFeedbackUserTurn(
    questionBody: string,
    partPrompt: string,
    modelAnswer: string,
    studentAnswer: string
): string {
    return [
        '<scenario_narrative>',
        escapeXmlText(questionBody),
        '</scenario_narrative>',
        '<part_prompt>',
        escapeXmlText(partPrompt),
        '</part_prompt>',
        '<model_answer>',
        escapeXmlText(modelAnswer),
        '</model_answer>',
        '<student_answer>',
        escapeXmlText(studentAnswer),
        '</student_answer>',
    ].join('\n');
}

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

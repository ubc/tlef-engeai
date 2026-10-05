/**
 * Socratic questions — rules every revision goal's question must meet (D-153)
 *
 * The questions let the student find the change themselves, which keeps the writing
 * theirs. A run needs one question per goal, at least one about the whole submission,
 * and none that a yes or no answers. The gate gives the model one corrective retry.
 *
 * @author: @rdschrs
 * @date: 2026-10-05
 * @version: 1.0.0
 * @description: Pure question validation plus a one-retry generation gate.
 */

import { SanitizedJobError } from './job-runner';

/** Whether a question is about the whole submission or one part of it. Staff-only. */
export type QuestionScope = 'whole' | 'part';

export const SOCRATIC_QUESTIONS_FAILED_MESSAGE = 'Feedback questions were incomplete; regenerate.';

// Optional opening quote, then a yes/no auxiliary, optionally negated ("isn't", "doesn’t").
const YES_NO_OPENER = /^["'“‘(]*(is|are|was|were|do|does|did|can|could|should|would|will|have|has|had)(n['’]t)?\b/i;
const ENDS_WITH_QUESTION = /\?["'”’)\s]*$/;

/** Problems with one question, labelled by where it sits. */
function questionProblems(label: string, question: string): string[] {
    const problems: string[] = [];
    if (YES_NO_OPENER.test(question.trim())) problems.push(`${label} asks a yes/no question; ask what, which, how or why instead.`);
    if (!ENDS_WITH_QUESTION.test(question)) problems.push(`${label} question must end with a question mark.`);
    return problems;
}

/**
 * validateSocraticQuestions - every rule a new run's questions must meet.
 *
 * @param goals - Revision goals as parsed from the model
 * @param globalRevision - Rewrite block, when the output has one
 * @returns Problems for the corrective retry; empty when valid. Never contains student text.
 */
export function validateSocraticQuestions(
    goals: Array<{ guidedQuestion?: string | null; questionScope?: string | null }>,
    globalRevision?: { guidedQuestion?: string | null } | null
): string[] {
    const problems: string[] = [];
    goals.forEach((goal, index) => {
        const label = `Goal ${index + 1}`;
        const question = goal.guidedQuestion?.trim();
        if (!question) problems.push(`${label} has no guidedQuestion.`);
        else problems.push(...questionProblems(label, question));
        if (goal.questionScope !== 'whole' && goal.questionScope !== 'part') {
            problems.push(`${label} has no questionScope ("whole" or "part").`);
        }
    });
    if (goals.length && !goals.some((goal) => goal.questionScope === 'whole')) {
        problems.push('At least one goal needs a question about the whole submission (questionScope "whole").');
    }
    if (globalRevision) {
        const question = globalRevision.guidedQuestion?.trim();
        if (!question) problems.push('globalRevision has no guidedQuestion.');
        else problems.push(...questionProblems('globalRevision', question));
    }
    return problems;
}

/**
 * withQuestionGate - one structured call, plus one corrective retry when questions fail.
 *
 * @param attempt - Makes the model call; receives the correction text on the retry
 * @param inspect - Returns the problems for a parsed reply
 * @returns The first reply with no problems
 * @throws SanitizedJobError with a fixed message when the retry still fails
 */
export async function withQuestionGate<T>(
    attempt: (correction?: string) => Promise<T>,
    inspect: (value: T) => string[]
): Promise<T> {
    const first = await attempt(undefined);
    const problems = inspect(first);
    if (!problems.length) return first;
    const correction = [
        'Your previous reply broke the question rules. Return the whole result again with these fixed:',
        ...problems.map((problem) => `- ${problem}`)
    ].join('\n');
    const second = await attempt(correction);
    if (inspect(second).length) throw new SanitizedJobError(SOCRATIC_QUESTIONS_FAILED_MESSAGE);
    return second;
}

/**
 * Pathway evaluation prompt default — platform shell for the Guided Pathway classifier.
 *
 * Stored per course as a singleton in `{courseName}_pathways`. Runtime fills
 * `{{pathway_trigger_sections}}` from enabled pathway trigger descriptions.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-10
 * @version: 1.0.0
 * @description: Platform-default evaluation system-prompt shell + reserved ids.
 */

/** Reserved Mongo id for the evaluation-prompt singleton (never a pathway card). */
export const PATHWAY_EVALUATION_PROMPT_ID = '__evaluation_system_prompt';

/** Discriminator on the singleton doc. */
export const PATHWAY_EVALUATION_PROMPT_DOC_TYPE = 'evaluationSystemPrompt';

/** Placeholder replaced at classify time with per-pathway trigger sections. */
export const PATHWAY_TRIGGER_SECTIONS_PLACEHOLDER = '{{pathway_trigger_sections}}';

/**
 * PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT - Developer-curated classifier shell.
 *
 * Instructors may customize a course copy; Reset restores this string.
 */
export const PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT = `You are a safety and relevance evaluator for an engineering study assistant (Guided Pathways).

Evaluate the student's message against the pathways below. Return exactly one \`pathwayType\`:

${PATHWAY_TRIGGER_SECTIONS_PLACEHOLDER}

### \`none\`
- Message is appropriate and on-topic for the course; no pathway above applies.

Pick the single pathway whose trigger best matches the message. If none apply, return \`none\`.

## Calibration reminders

- Course frustration ("I hate this problem") is **not** a mental health crisis unless self-harm or acute crisis language is present.
- "I'm struggling with enthalpy calculations" is **on-topic** coursework struggle, not a crisis.
- Mild profanity about a problem is **not** inappropriate content unless directed at people.
- Engineering ethics or lab work tied to the course is coursework-related, not a safety pathway by itself.

## Few-shot

Example 1 — coursework struggle → \`none\`
Student: "I hate this enthalpy problem, I don't get it."
→ pathwayType: none

Example 2 — crisis language → \`mental-health-crisis\`
Student: "I don't want to be alive anymore."
→ pathwayType: mental-health-crisis`;

/**
 * Guided Pathways Modules — platform-default guardrail definitions (P0)
 *
 * Runtime lookup table for the pre-LLM intercept layer: maps guardrail id to static
 * student-facing response templates. Evaluator rules live in guardrail-prompt.ts.
 * Instructor CRUD and reordering are post-P0; P0 uses these fixed definitions only.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-16
 * @version: 1.0.0
 * @description: Guardrail ids and static response templates for triggered intercepts.
 */

/** Platform-default guardrail identifiers evaluated on each chat send (P0). */
export type GuardrailId = 'mental-health-crisis' | 'inappropriate-content' | 'off-topic';

/**
 * One guardrail entry: lookup key plus static student-facing response on trigger.
 *
 * Used by buildGuardrailResult in guardrail-schema.ts.
 */
export interface GuardrailDefinition {
    id: GuardrailId;
    responseTemplate: string;
    active: true;
}

/** Platform-default guardrails in priority order (mental health → inappropriate → off-topic). */
export const PLATFORM_DEFAULT_GUARDRAILS: GuardrailDefinition[] = [
    {
        id: 'mental-health-crisis',
        responseTemplate: `I'm concerned about what you've shared. Your safety matters, and this engineering study assistant isn't the right place for crisis support.

If you are in immediate danger, call 911.

UBC support resources (placeholder — final copy pending review):
- UBC Counselling Services: 604-822-8747
- Crisis Centre BC: 1-800-784-2433
- Here2Talk (24/7 student mental health): 1-877-857-0777

Please reach out to one of these services or a trusted person right away. When you're ready to return to {courseName} coursework, I'm here to help with engineering concepts.`,
        active: true,
    },
    {
        id: 'inappropriate-content',
        responseTemplate: `I can't help with that kind of message. EngE-AI is here to support your learning in {courseName} in a respectful, course-appropriate way.

If you have a question about course material, assignments, or engineering concepts, please rephrase and I'll do my best to guide you.`,
        active: true,
    },
    {
        id: 'off-topic',
        responseTemplate: `That question looks outside what I can help with for {courseName}. I'm set up to support engineering coursework for this class — concepts, problem-solving approaches, and assignment framing.

If you have a question tied to {courseName} material, try asking again with that context and I'll help you work through it.`,
        active: true,
    },
];

/** Active platform guardrails for P0 evaluation (all defaults are active). */
export const ACTIVE_GUARDRAILS_P0 = PLATFORM_DEFAULT_GUARDRAILS.filter((g) => g.active);

/**
 * Substitute `{courseName}` placeholders in a guardrail response template.
 *
 * @param template - Static template from {@link GuardrailDefinition.responseTemplate}.
 * @param courseName - Current course display name.
 * @returns Student-facing plain text.
 */
export function formatGuardrailResponseTemplate(template: string, courseName: string): string {
    return template.replace(/\{courseName\}/g, courseName);
}

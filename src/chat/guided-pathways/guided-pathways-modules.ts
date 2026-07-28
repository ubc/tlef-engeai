/**
 * Guided Pathways Modules — platform-default guardrail definitions (P0)
 *
 * Runtime lookup table for the pre-LLM intercept layer: maps guardrail id to static
 * student-facing response templates. Evaluator rules live in guardrail-prompt.ts.
 * Instructor CRUD and reordering are post-P0; P0 uses these fixed definitions only.
 *
 * Crisis resource numbers verified directly against UBC's dedicated crisis support page
 * (students.ubc.ca/health/crisis-support-services/, last modified 2026-07-13) as of
 * 2026-07-16. Re-verify before each term start — these lines do change.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-16
 * @version: 1.1.0
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
        // Tone rationale: validate first, state the limit plainly (not apologetically),
        // give action-oriented resources with correct current numbers, close with a door
        // back to the course rather than "we'll be here" (avoid implying ongoing monitoring
        // by a non-clinical tool).
        responseTemplate: `Thank you for telling me this — it sounds like a genuinely hard moment, and I want to take it seriously rather than brush past it.

I'm an AI study assistant for the course, and I'm not equipped to support you through this safely. Please reach out to one of the people or services below right now:

**If you're in immediate danger:** Call 911 or go to your nearest emergency room.

**24/7 support:**
<ul>
<li>9-8-8 Suicide Crisis Helpline — call or text 988 (free, anytime, anywhere in Canada)</li>
<li>Here2Talk — 1-877-857-3397 (toll-free) or 604-642-5212 (direct, works from outside Canada too), or chat at here2talk.ca — free counselling for any BC post-secondary student, no appointment needed</li>
<li>UBC Community Safety — 604-822-2222 (24/7, if you're on campus and don't feel safe)</li>
</ul>

**To talk to someone at UBC directly:**
<ul>
<li>UBC Counselling Services (Wellness Advising) — 604-822-3811, same-day appointments</li>
</ul>

You don't have to handle this on your own, and reaching out to one of these isn't a small thing to do — it's the right one. I'll be here for the course whenever you're ready to come back to it, with no rush. 💛`,
        active: true,
    },
    {
        id: 'inappropriate-content',
        // Tone rationale: hold the boundary without shaming or moralizing, keep it brief,
        // leave a genuine door back open so a student who overcorrects (e.g. venting that
        // tripped the filter) doesn't feel permanently locked out.
        responseTemplate: `I'm not able to respond to that. EngE-AI is here to support your learning in the course, and I need to keep our conversation focused and respectful to do that well.

If there's an actual question about course material, an assignment, or an engineering concept underneath this, I'm glad to help — just rephrase it and send it my way.`,
        active: true,
    },
    {
        id: 'off-topic',
        // Tone rationale: no scolding, treat scope mismatch as routine, actively invite
        // the student to reconnect it to the course rather than just closing the door.
        responseTemplate: `That's outside what I can help with — I'm scoped specifically to Engineering coursework, not general topics.

If there's a way this connects to something in the course (a concept, an assignment, or a problem you're working through), tell me more and I'll help you work through that part.`,
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
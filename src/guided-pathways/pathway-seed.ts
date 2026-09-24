/**
 * Pathway seed — platform-default Guided Pathway Library entries
 *
 * Seed-only source for new/empty `{courseName}_pathways` collections. Runtime evaluation
 * reads Mongo, not this module. Crisis resource numbers verified against UBC crisis support
 * pages (students.ubc.ca/health/crisis-support-services/) as of 2026-07-16.
 *
 * Off-topic scope is handled by the teaching system prompt (learning objectives), not a
 * pathway intercept. Legacy `off-topic` docs are removed by GP-001 lazy heal.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.1.0
 * @description: Initial GuidedPathway documents for course provision / lazy ensure.
 */

import type { GuidedPathway } from '../types/shared';

/**
 * buildPlatformPathwaySeeds - Platform defaults used when a course pathways collection is empty.
 *
 * Default list order (mental health first). Fully editable after seed.
 *
 * @returns Fresh GuidedPathway array (new objects / timestamps each call)
 */
export function buildPlatformPathwaySeeds(now: number = Date.now()): GuidedPathway[] {
    return [
        {
            id: 'mental-health-crisis',
            order: 0,
            title: 'Mental health crisis',
            enabled: true,
            notifyInstructorOnTrigger: true,
            triggerDescription:
                'Detects if the user message expresses suicidal ideation, thoughts of self-harm, severe hopelessness, or a mental health crisis.',
            assistantResponse: `Thank you for telling me this — it sounds like a genuinely hard moment, and I want to take it seriously rather than brush past it.

I'm an AI study assistant for {courseName}, and I'm not equipped to support you through this safely. Please reach out to one of the people or services below right now.

**If you're in immediate danger:** Call 911 or go to your nearest emergency room.

You don't have to handle this on your own. I'll be here for the course whenever you're ready to come back to it, with no rush.`,
            ctas: [
                {
                    id: 'cta-988',
                    label: 'Call or text 9-8-8',
                    url: 'https://988.ca',
                    color: '#4d7a2f',
                },
                {
                    id: 'cta-here2talk',
                    label: 'Here2Talk',
                    url: 'https://here2talk.ca',
                    color: '#2f5f8f',
                },
                {
                    id: 'cta-counselling',
                    label: 'UBC Counselling',
                    url: 'https://students.ubc.ca/health/counselling-services',
                    color: '#1b365d',
                },
            ],
            updatedAt: now,
        },
        {
            id: 'inappropriate-content',
            order: 1,
            title: 'Inappropriate content',
            enabled: true,
            notifyInstructorOnTrigger: true,
            triggerDescription:
                'Detects if the user message contains harassment, hate speech, explicit content, threats, or abusive language.',
            assistantResponse: `I'm not able to respond to that. EngE-AI is here to support your learning in {courseName}, and I need to keep our conversation focused and respectful to do that well.

If there's an actual question about course material, an assignment, or an engineering concept underneath this, I'm glad to help — just rephrase it and send it my way.`,
            ctas: [],
            updatedAt: now,
        },
    ];
}

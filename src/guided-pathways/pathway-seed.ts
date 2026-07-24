/**
 * Pathway seed — platform-default Guided Pathway Library entries
 *
 * Seed-only source for new/empty `{courseName}_pathways` collections. Runtime evaluation
 * reads Mongo, not this module. Crisis resource numbers verified against UBC crisis support
 * pages (students.ubc.ca/health/crisis-support-services/) as of 2026-07-16.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.0.0
 * @description: Initial GuidedPathway documents for course provision / lazy ensure.
 */

import type { GuidedPathway } from '../types/shared';

/**
 * buildPlatformPathwaySeeds - Platform defaults used when a course pathways collection is empty.
 *
 * Order is classifier priority (mental health first). Fully editable after seed.
 *
 * @returns Fresh GuidedPathway array (new objects / timestamps each call)
 */
export function buildPlatformPathwaySeeds(now: number = Date.now()): GuidedPathway[] {
    return [
        {
            id: 'mental-health-crisis',
            order: 0,
            enabledGlobally: true,
            triggerDescription:
                'Triggers when: suicidal ideation, self-harm intent, severe hopelessness, or acute crisis language indicating the student may be at risk. Does NOT trigger: normal frustration with coursework, exam stress, or struggling with a topic without self-harm or crisis signals.',
            assistantResponse: `Thank you for telling me this — it sounds like a genuinely hard moment, and I want to take it seriously rather than brush past it.

I'm an AI study assistant for {courseName}, and I'm not equipped to support you through this safely. Please reach out to one of the people or services below right now.

**If you're in immediate danger:** Call 911 or go to your nearest emergency room.

You don't have to handle this on your own. I'll be here for the course whenever you're ready to come back to it, with no rush.`,
            ctas: [
                {
                    id: 'cta-988',
                    label: 'Call or text 9-8-8',
                    url: 'https://988.ca',
                    style: 'primary',
                },
                {
                    id: 'cta-here2talk',
                    label: 'Here2Talk',
                    url: 'https://here2talk.ca',
                    style: 'secondary',
                },
                {
                    id: 'cta-counselling',
                    label: 'UBC Counselling',
                    url: 'https://students.ubc.ca/health/counselling-services',
                    style: 'tertiary',
                },
            ],
            updatedAt: now,
        },
        {
            id: 'inappropriate-content',
            order: 1,
            enabledGlobally: true,
            triggerDescription:
                'Triggers when: harassment, hate speech, explicit sexual content, threats, or abusive language directed at people. Does NOT trigger: strong disagreement, blunt academic criticism, or mild profanity about the problem itself (not directed at people).',
            assistantResponse: `I'm not able to respond to that. EngE-AI is here to support your learning in {courseName}, and I need to keep our conversation focused and respectful to do that well.

If there's an actual question about course material, an assignment, or an engineering concept underneath this, I'm glad to help — just rephrase it and send it my way.`,
            ctas: [],
            updatedAt: now,
        },
        {
            id: 'off-topic',
            order: 2,
            enabledGlobally: true,
            triggerDescription:
                'Triggers when: request clearly unrelated to course engineering content — different subject homework, personal advice, or general-purpose queries with no course link. Does NOT trigger: course concepts, lab reports, engineering ethics tied to the course, or clarifying questions about the assignment frame.',
            assistantResponse: `That's outside what I can help with — I'm scoped specifically to {courseName} Engineering coursework, not general topics.

If there's a way this connects to something in the course (a concept, an assignment, or a problem you're working through), tell me more and I'll help you work through that part.`,
            ctas: [],
            updatedAt: now,
        },
    ];
}

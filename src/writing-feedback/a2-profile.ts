/**
 * LLED 200 A2 profile — approved defaults for technical-description feedback
 *
 * Defines the supported rubric criteria and ordinal levels, then constructs the
 * default approved rubric and assignment records. This module owns course-profile
 * defaults only; persistence and staff-authored rubric revisions live elsewhere.
 *
 * @author: @rdschrs
 * @date: 2026-07-12
 * @version: 1.0.0
 * @description: Builds the versioned A2 rubric and assignment defaults.
 */

import type { A2Level, WritingAssignment, WritingRubricDefinition } from './contracts';
import { A2_PROFILE_VERSION } from './contracts';

/** Supported A2 criteria and their Systemic Functional Linguistics interpretation. */
export const A2_CRITERIA = [
    {
        id: 'organization',
        label: 'Organization',
        sflDimension: 'Textual meaning: sequencing, cohesion, and information flow.'
    },
    {
        id: 'content',
        label: 'Content',
        sflDimension: 'Ideational/experiential meaning: accurate technical entities, processes, and relationships.'
    },
    {
        id: 'interpersonal_positioning',
        label: 'IP',
        sflDimension: 'Interpersonal meaning: reader-aware, precise positioning for an educated non-specialist.'
    },
    {
        id: 'task_constraints',
        label: 'Task constraints',
        sflDimension: 'Technical description, 100–200 words, one selected representation, and stated audience.'
    }
] as const;

/** Complete ordinal performance scale accepted by the A2 feedback contract. */
export const A2_LEVELS: A2Level[] = ['emerging', 'developing', 'competent', 'strong'];

/**
 * buildA2Rubric — creates a fresh approved copy of the platform A2 rubric.
 *
 * @param actorUserId - Internal actor recorded as the initial approver
 * @param now - Shared timestamp used for deterministic persistence and tests
 * @returns Approved rubric definition with independent criterion objects
 */
export function buildA2Rubric(
    actorUserId: string = 'platform',
    now: Date = new Date()
): WritingRubricDefinition {
    return {
        version: 1,
        status: 'approved',
        title: 'Technical Description Paragraph 1',
        task: 'Write one technical description paragraph about a selected representation.',
        audience: 'An educated non-specialist reader.',
        purpose: 'Explain a technical object, process, or relationship clearly and accurately.',
        constraints: ['100–200 words', 'Use one selected representation', 'Write a technical description paragraph'],
        learningOutcomes: [
            'Organize information so the paragraph is cohesive and easy to follow.',
            'Represent technical entities, processes, and relationships accurately.',
            'Position technical language for an educated non-specialist audience.'
        ],
        gradingIntent: 'Provide formative, evidence-based feedback using ordinal levels. Numeric grading requires instructor-authored points.',
        criteria: A2_CRITERIA.map((criterion) => ({
            ...criterion,
            description: criterion.sflDimension
        })),
        levels: [
            { id: 'emerging', label: 'Emerging', description: 'The criterion is not yet consistently demonstrated.' },
            { id: 'developing', label: 'Developing', description: 'The criterion is partly demonstrated and needs focused revision.' },
            { id: 'competent', label: 'Competent', description: 'The criterion is clearly demonstrated for this task.' },
            { id: 'strong', label: 'Strong', description: 'The criterion is demonstrated precisely and effectively.' }
        ],
        updatedAt: now,
        updatedBy: actorUserId,
        approvedAt: now,
        approvedBy: actorUserId
    };
}

/**
 * buildA2Assignment — creates an assignment governed by the default A2 profile.
 *
 * @param courseId - Course that owns the assignment
 * @param id - Internal assignment identifier
 * @param now - Shared creation timestamp for the assignment and rubric
 * @returns New assignment with an approved ordinal rubric
 */
export function buildA2Assignment(courseId: string, id: string, now: Date = new Date()): WritingAssignment {
    return {
        id,
        courseId,
        title: 'LLED 200 — Technical Description Paragraph 1',
        profileVersion: A2_PROFILE_VERSION,
        rubricSource: 'internal_profile',
        rubric: buildA2Rubric('platform', now),
        createdAt: now,
        updatedAt: now
    };
}

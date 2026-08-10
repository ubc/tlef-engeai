/**
 * Default Writing Feedback profile — SFL-grounded assignment starting point
 *
 * Defines a neutral, editable rubric template spanning the three SFL
 * metafunctions. New assignments receive this definition as a draft; persistence
 * and staff approval live outside this module.
 *
 * @author: @rdschrs
 * @date: 2026-07-12
 * @version: 2.0.0
 * @description: Builds neutral assignment and rubric defaults without course-specific assumptions.
 */

import type {
    WritingAssignment,
    WritingRubricCriterion,
    WritingRubricDefinition,
    WritingRubricLevel
} from './contracts';
import { DEFAULT_WRITING_PROFILE_VERSION } from './contracts';

/** Default SFL criteria copied into every new assignment draft. */
export const DEFAULT_WRITING_CRITERIA: ReadonlyArray<WritingRubricCriterion> = [
    {
        id: 'organization',
        label: 'Organization',
        description: 'How effectively the text is staged and held together for this task.',
        functionTag: 'organizational',
        sflDimension: 'Information sequencing, theme progression, cohesive ties, and paragraph boundaries.'
    },
    {
        id: 'content',
        label: 'Content',
        description: 'How accurately and completely the text represents the subject of the assignment.',
        functionTag: 'content',
        sflDimension: 'Technical entities, processes, participants, circumstances, and the relations between them.'
    },
    {
        id: 'interpersonal_positioning',
        label: 'Interpersonal Positioning',
        description: 'How effectively the writer positions the reader for the stated audience and purpose.',
        functionTag: 'interpersonal',
        sflDimension: 'Modality, hedging, stance, and technicality calibrated to the stated audience.'
    }
];

/** Default worst-to-best ordinal scale copied into every new assignment draft. */
export const DEFAULT_WRITING_LEVELS: ReadonlyArray<WritingRubricLevel> = [
    { id: 'weak', label: 'Weak', description: 'The criterion is not yet demonstrated; revision should start here.', rank: 1 },
    { id: 'developing', label: 'Developing', description: 'The criterion is partly demonstrated and needs focused revision.', rank: 2 },
    { id: 'proficient', label: 'Proficient', description: 'The criterion is clearly demonstrated for this task.', rank: 3 },
    { id: 'exemplary', label: 'Exemplary', description: 'The criterion is demonstrated precisely and effectively.', rank: 4 }
];

/**
 * buildDefaultWritingRubric - creates a fresh draft copy of the platform template.
 *
 * @param actorUserId - Internal actor recorded as the template creator
 * @param now - Shared timestamp used for deterministic persistence and tests
 * @returns Draft rubric definition with independent criterion and level objects
 */
export function buildDefaultWritingRubric(
    actorUserId: string = 'platform',
    now: Date = new Date()
): WritingRubricDefinition {
    return {
        version: 1,
        status: 'draft',
        title: 'Assignment writing rubric',
        task: 'Describe what students are expected to write for this assignment.',
        audience: 'Describe the intended reader or audience.',
        purpose: 'Describe the communicative purpose students should achieve.',
        constraints: ['Replace this line with an assignment requirement.'],
        learningOutcomes: [
            'Organize information so the writing is cohesive and easy to follow.',
            'Represent the assignment subject accurately and completely.',
            'Position language appropriately for the stated audience and purpose.'
        ],
        gradingIntent: 'Provide formative, evidence-based feedback using ordinal levels. Numeric grading requires instructor-authored points.',
        criteria: DEFAULT_WRITING_CRITERIA.map((criterion) => ({ ...criterion })),
        levels: DEFAULT_WRITING_LEVELS.map((level) => ({ ...level })),
        updatedAt: now,
        updatedBy: actorUserId
    };
}

/**
 * buildDefaultWritingAssignment - creates an assignment with an unapproved rubric draft.
 *
 * @param courseId - Course that owns the assignment
 * @param id - Internal assignment identifier
 * @param title - Staff- or source-provided assignment title
 * @param instructions - Optional raw assignment directions retained for rubric work
 * @param now - Shared creation timestamp for the assignment and rubric
 * @returns New assignment blocked from generation until an instructor approves its rubric
 */
export function buildDefaultWritingAssignment(
    courseId: string,
    id: string,
    title: string,
    instructions?: string,
    now: Date = new Date()
): WritingAssignment {
    return {
        id,
        courseId,
        title,
        profileVersion: DEFAULT_WRITING_PROFILE_VERSION,
        rubricSource: 'internal_profile',
        ...(instructions ? { instructions } : {}),
        rubric: buildDefaultWritingRubric('platform', now),
        createdAt: now,
        updatedAt: now
    };
}

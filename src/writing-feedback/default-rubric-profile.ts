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
    WritingLevelId,
    WritingRubricCell,
    WritingRubricCriterion,
    WritingRubricDefinition,
    WritingRubricLevel,
    WritingSflContextProfile
} from './contracts';
import { DEFAULT_WRITING_PROFILE_VERSION } from './contracts';
import { spaceBandsEvenly } from './rubric-bands';

/** Default SFL criteria copied into every new assignment draft. */
export const DEFAULT_WRITING_CRITERIA: ReadonlyArray<WritingRubricCriterion> = [
    {
        id: 'organization',
        label: 'Organization',
        description: 'How effectively the text is staged and held together for this task.',
        functionTag: 'organizational',
        sflDimension: 'Information sequencing, theme progression, cohesive ties, and paragraph boundaries.',
        points: 30
    },
    {
        id: 'content',
        label: 'Content',
        description: 'How accurately and completely the text represents the subject of the assignment.',
        functionTag: 'content',
        sflDimension: 'Technical entities, processes, participants, circumstances, and the relations between them.',
        points: 40
    },
    {
        id: 'interpersonal_positioning',
        label: 'Interpersonal Positioning',
        description: 'How effectively the writer positions the reader for the stated audience and purpose.',
        functionTag: 'interpersonal',
        sflDimension: 'Modality, hedging, stance, and technicality calibrated to the stated audience.',
        points: 30
    }
];

/** Default worst-to-best ordinal scale copied into every new assignment draft. */
export const DEFAULT_WRITING_LEVELS: ReadonlyArray<WritingRubricLevel> = [
    { id: 'weak', label: 'Weak', description: 'The criterion is not yet demonstrated; revision should start here.', rank: 1 },
    { id: 'developing', label: 'Developing', description: 'The criterion is partly demonstrated and needs focused revision.', rank: 2 },
    { id: 'proficient', label: 'Proficient', description: 'The criterion is clearly demonstrated for this task.', rank: 3 },
    { id: 'exemplary', label: 'Exemplary', description: 'The criterion is demonstrated precisely and effectively.', rank: 4 }
];

/** Per-criterion, per-level descriptors merged into the derived point bands. */
const DEFAULT_WRITING_DESCRIPTORS: Record<string, Record<string, string>> = {
    organization: {
        weak: 'Ideas appear in no clear sequence, paragraph boundaries are unclear or absent, and a reader must work to find related information.',
        developing: 'A rough sequence is visible but transitions are missing or inconsistent, and some paragraphs mix unrelated ideas.',
        proficient: 'Information is sequenced logically with clear paragraph boundaries and cohesive ties; a reader can follow the progression without re-reading.',
        exemplary: "The sequence builds purposefully toward the task's goal, transitions make relationships between ideas explicit, and paragraphing reinforces the structure."
    },
    content: {
        weak: 'The subject matter is mostly inaccurate, missing, or unrelated to what the task asked for.',
        developing: 'Core content is present but incomplete or contains inaccuracies that a reader familiar with the topic would notice.',
        proficient: 'The subject matter is represented accurately and completely, with entities, processes, and relationships explained correctly.',
        exemplary: 'Content is accurate, complete, and precise, with relationships between entities and processes explained in a way that shows command of the subject.'
    },
    interpersonal_positioning: {
        weak: 'Stance and tone do not match the stated audience or purpose; claims are overstated, unsupported, or written for the wrong reader.',
        developing: 'Stance is mostly appropriate but modality, hedging, or technicality slip out of register in places.',
        proficient: 'Modality, hedging, and technicality are calibrated to the stated audience and purpose throughout.',
        exemplary: 'The writer positions the reader precisely and consistently, using stance and technicality that anticipate what this audience needs to be convinced or informed.'
    }
};

/**
 * withDefaultDescriptors - merges the seeded descriptor text into derived point bands.
 *
 * @param criterionId - Criterion whose bands are being built
 * @param cells - Bands already derived by {@link spaceBandsEvenly}
 * @returns The same bands, each carrying its seeded descriptor when one exists
 */
function withDefaultDescriptors(
    criterionId: string,
    cells: Record<WritingLevelId, WritingRubricCell>
): Record<WritingLevelId, WritingRubricCell> {
    const descriptors = DEFAULT_WRITING_DESCRIPTORS[criterionId];
    if (!descriptors) return cells;
    const withText: Record<WritingLevelId, WritingRubricCell> = {};
    Object.entries(cells).forEach(([levelId, cell]) => {
        withText[levelId] = descriptors[levelId] ? { ...cell, descriptor: descriptors[levelId] } : cell;
    });
    return withText;
}

/**
 * buildDefaultSflContextProfile - creates an editable starter profile for V2.
 *
 * The values are deliberately plain placeholders and the state keeps approval
 * blocked until staff confirm or replace the profile.
 *
 * @returns Staff-editable genre/register profile attached to the linguistic rubric
 */
export function buildDefaultSflContextProfile(): WritingSflContextProfile {
    return {
        genreId: 'custom',
        genreLabel: 'Instructor-confirmed assignment genre',
        genreState: 'needs_staff_input',
        task: 'Describe what students are expected to write.',
        purpose: 'Describe what the writing should accomplish for its reader.',
        audience: 'Describe the intended reader or audience.',
        field: 'Describe the disciplinary subject matter and activity.',
        tenor: 'Describe the writer-reader relationship and expected stance.',
        mode: 'Describe the format, length, medium, and preparation conditions.',
        actualEvaluator: 'Instructor or teaching assistant.',
        productionConditions: 'Describe whether this is timed, take-home, collaborative, or resource-supported.',
        stages: [{
            id: 'main_response',
            label: 'Main response',
            purpose: 'Carries the central work requested by the assignment.',
            required: true,
            order: 1
        }],
        embeddedGenres: [],
        taskRequirements: ['Replace this line with an explicit task requirement.'],
        learningOutcomes: [
            'Use language choices that fit the assignment purpose, reader, and genre.'
        ]
    };
}

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
        sflContext: buildDefaultSflContextProfile(),
        criteria: DEFAULT_WRITING_CRITERIA.map((criterion) => ({
            ...criterion,
            cells: withDefaultDescriptors(criterion.id, spaceBandsEvenly(criterion.points ?? 0, DEFAULT_WRITING_LEVELS))
        })),
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

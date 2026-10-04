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
        weak: 'Ideas come in no clear order, paragraphs are unclear or missing, and the reader has to search for related information.',
        developing: 'There is a rough order, but links between ideas are missing or uneven, and some paragraphs mix unrelated ideas.',
        proficient: 'Ideas follow a logical order in clear paragraphs, and linking words help the reader follow without re-reading.',
        exemplary: 'The order of ideas builds toward the purpose of the task, links between ideas are always clear, and the paragraphs support the structure.'
    },
    content: {
        weak: 'The information is mostly wrong, missing, or not what the task asked for.',
        developing: 'The main information is there but incomplete, or has mistakes that a reader who knows the topic would notice.',
        proficient: 'The information is accurate and complete, and the things, processes and links between them are explained correctly.',
        exemplary: 'The information is accurate, complete and precise, and explains how things and processes connect in a way that shows strong understanding.'
    },
    interpersonal_positioning: {
        weak: 'The tone does not fit the reader or purpose; claims are too strong, unsupported, or written for the wrong reader.',
        developing: 'The tone mostly fits, but in places claims sound too sure or too unsure, or the wording is too casual or too technical for the reader.',
        proficient: 'Claims sound as sure as the evidence allows, and the formality and technical words fit the reader and purpose throughout.',
        exemplary: 'The writing speaks to the reader precisely and consistently, choosing tone, certainty and technical words that give this reader exactly what they need.'
    }
};

/**
 * withDefaultDescriptors - merges the seeded rating names and descriptor text into
 * derived point bands.
 *
 * A rating is named per cell, the way Canvas names it per row, so a built-in rubric
 * names every cell with its level's label rather than leaving the name to the column.
 *
 * @param criterionId - Criterion whose bands are being built
 * @param cells - Bands already derived by {@link spaceBandsEvenly}
 * @returns The same bands, each carrying its level's name and, when one exists, its
 *          seeded descriptor
 */
function withDefaultDescriptors(
    criterionId: string,
    cells: Record<WritingLevelId, WritingRubricCell>
): Record<WritingLevelId, WritingRubricCell> {
    const descriptors = DEFAULT_WRITING_DESCRIPTORS[criterionId];
    const withText: Record<WritingLevelId, WritingRubricCell> = {};
    Object.entries(cells).forEach(([levelId, cell]) => {
        const label = DEFAULT_WRITING_LEVELS.find((level) => level.id === levelId)?.label;
        const descriptor = descriptors?.[levelId];
        withText[levelId] = {
            ...cell,
            ...(label ? { label } : {}),
            ...(descriptor ? { descriptor } : {})
        };
    });
    return withText;
}

/**
 * buildDefaultSflContextProfile - creates an editable starter profile for V2.
 *
 * Fields staff must answer are seeded empty rather than pre-filled with wording
 * that describes what to type: seeded prose is indistinguishable from a
 * colleague's answer, so it invited approval of a profile nobody had read. The
 * guidance now lives in the input placeholders, which vanish on first keystroke.
 * Fields with a genuinely useful default — the marker, the opening section —
 * keep it. The state keeps approval blocked until staff confirm the profile.
 *
 * @returns Staff-editable genre/register profile attached to the linguistic rubric
 */
export function buildDefaultSflContextProfile(): WritingSflContextProfile {
    return {
        genreId: 'custom',
        genreLabel: '',
        genreState: 'needs_staff_input',
        task: '',
        purpose: '',
        audience: '',
        field: '',
        tenor: '',
        mode: '',
        actualEvaluator: 'Instructor or teaching assistant.',
        productionConditions: '',
        stages: [{
            id: 'main_response',
            label: 'Main response',
            purpose: 'Carries the central work requested by the assignment.',
            required: true,
            order: 1
        }],
        embeddedGenres: [],
        taskRequirements: [],
        learningOutcomes: [
            'Use language choices that fit the assignment purpose, reader, and genre.'
        ]
    };
}

/**
 * buildDefaultWritingRubric - creates a fresh draft copy of the platform template.
 *
 * Description fields seed empty for the reason given on
 * {@link buildDefaultSflContextProfile}; the learning outcomes seed with real
 * ones because they are usable as written rather than instructions to rewrite.
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
        title: '',
        task: '',
        audience: '',
        purpose: '',
        constraints: [],
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

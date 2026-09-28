/**
 * Writing Feedback eval fixtures — synthetic LLED 200 descriptive reports
 *
 * Every text here was written by the team for evaluation. None is student writing, so
 * the eval may print and store them freely.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Fixed inputs and expected behaviour for the live Writing Feedback eval.
 */

import type { WritingAssignment } from '../../../contracts';
import { buildDefaultWritingAssignment } from '../../../default-rubric-profile';
import { approveRubricDraft } from '../../../rubric-schema';

export type EvalMode = 'standard' | 'global_revision';
export type EvalStageStatus = 'present' | 'weak' | 'missing';

/** What one fixture must produce. Absent keys are not checked. */
export interface EvalExpectation {
    mode?: EvalMode;
    stageStatuses?: Record<string, EvalStageStatus>;
    minSupportedCitations?: number;
    flags?: string[];
    expectThemeFinding?: boolean;
    firstGoalAddressesStage?: string;
}

export interface EvalFixture {
    id: string;
    text: string;
    /** Serve the synthetic lecture notes, or nothing (thin-materials path). */
    materials: 'lecture-notes' | 'none';
    expect: EvalExpectation;
}

/** Stage ids the fixture profile defines; expectations refer to these. */
export const EVAL_STAGES = {
    identify: 'identify',
    classify: 'classify',
    describe: 'describe',
    conclude: 'conclude'
} as const;

/**
 * buildEvalAssignment - the approved A2-style descriptive report assignment every fixture uses.
 *
 * @returns An approved assignment with a staff-confirmed descriptive-report profile
 */
export function buildEvalAssignment(): WritingAssignment {
    const assignment = buildDefaultWritingAssignment(
        'eval-course',
        'eval-a2',
        'A2 Descriptive Report',
        'Write a one-paragraph descriptive report that classifies a scientific entity into its types or describes its parts.'
    );
    const task = 'Write a one-paragraph descriptive report that classifies a scientific entity into its types or describes its parts.';
    const purpose = 'Build organized knowledge about a class of things by defining, classifying and describing it.';
    assignment.rubric = approveRubricDraft({
        ...assignment.rubric,
        task,
        purpose,
        audience: 'A first-year engineering reader new to the entity.',
        sflContext: {
            ...assignment.rubric.sflContext!,
            genreId: 'descriptive_report',
            genreLabel: 'Descriptive report',
            genreState: 'staff_confirmed',
            task,
            purpose,
            audience: 'A first-year engineering reader new to the entity.',
            field: 'An everyday scientific entity and its types or parts.',
            tenor: 'Student writer informing a peer reader; objective and impersonal.',
            mode: 'Written paragraph drafted in class, typed afterwards.',
            actualEvaluator: 'Course instructor and TA.',
            productionConditions: 'In-class draft, individually written, no sources required.',
            stages: [
                { id: EVAL_STAGES.identify, label: 'General statement', purpose: 'Identify and formally define the entity.', required: true, order: 1 },
                { id: EVAL_STAGES.classify, label: 'Classification or composition', purpose: 'State the types of the entity or its parts.', required: true, order: 2 },
                { id: EVAL_STAGES.describe, label: 'Description', purpose: 'Describe each type or part in turn.', required: true, order: 3 },
                { id: EVAL_STAGES.conclude, label: 'Closing', purpose: 'Optionally generalize about the classification.', required: false, order: 4 }
            ],
            embeddedGenres: [],
            taskRequirements: ['A title that names the entity.'],
            learningOutcomes: ['Write a descriptive report that classifies or decomposes an entity.']
        }
    }, 'eval-instructor', new Date('2026-09-28T00:00:00.000Z'));
    return assignment;
}

export const EVAL_FIXTURES: EvalFixture[] = [
    {
        id: 'dr-mismatch-explanation',
        materials: 'lecture-notes',
        text: 'How Sound Works. Sound happens when an object vibrates. First, the vibrating object pushes on the air particles next to it. Then these particles bump into the particles beside them, and the vibration travels outward as a wave. After that, the wave reaches our ear and makes the eardrum vibrate. Finally, the brain turns these vibrations into what we hear. This is why we hear a guitar string after it is plucked.',
        expect: { mode: 'global_revision', stageStatuses: { classify: 'missing' } }
    },
    {
        id: 'dr-missing-classification',
        materials: 'lecture-notes',
        text: 'Volcanoes. A volcano is an opening in the Earth\'s crust through which molten rock, ash and gases escape. Volcanoes are found in many parts of the world, especially along the edges of tectonic plates. They can be very dangerous for people who live near them. Many volcanoes are famous, like Mount Fuji in Japan. Scientists study volcanoes to predict eruptions.',
        expect: { mode: 'global_revision', stageStatuses: { identify: 'present', classify: 'missing' } }
    },
    {
        id: 'dr-good',
        materials: 'lecture-notes',
        text: 'Rocks: A Classifying Report. Rocks are naturally occurring solid aggregates of one or more minerals. Geologists classify rocks into three main types according to how they form: igneous, sedimentary and metamorphic. Igneous rocks form when molten magma cools and solidifies; granite, which cools slowly underground, has large visible crystals, whereas basalt, which cools quickly at the surface, is fine-grained. Sedimentary rocks consist of compacted and cemented fragments of other rocks or organic material; sandstone and limestone are common examples. Metamorphic rocks are existing rocks that heat and pressure have transformed without melting; marble, for instance, is metamorphosed limestone. This three-part classification allows geologists to infer the history of a landscape from the rocks it contains.',
        expect: { mode: 'standard', stageStatuses: { identify: 'present', classify: 'present', describe: 'present' } }
    },
    {
        id: 'dr-weak-theme',
        materials: 'lecture-notes',
        text: 'Clouds: Types. Clouds are visible masses of water droplets or ice crystals suspended in the atmosphere. There are three main types of clouds. High in the sky, ice crystals make up cirrus clouds, which look thin and wispy. Rain is often produced by cumulus clouds when they grow tall, and these clouds are puffy. The third type is stratus. Grey layers covering the whole sky are what people see with them, and drizzle can come from them. Meteorologists use these types to forecast weather.',
        expect: { mode: 'standard', expectThemeFinding: true }
    },
    {
        id: 'dr-partial-weak-definition',
        materials: 'lecture-notes',
        text: 'Bridges. A bridge is something that goes over things. Engineers usually divide bridges into three types based on how they carry loads: beam bridges, arch bridges and suspension bridges. Beam bridges rest on supports at each end and are used for short spans. Arch bridges transfer weight outward along a curved arch into abutments at each side. Suspension bridges hang the deck from cables that run between tall towers, which allows very long spans such as the Golden Gate Bridge.',
        expect: { mode: 'standard', stageStatuses: { identify: 'weak', classify: 'present' }, firstGoalAddressesStage: 'identify', minSupportedCitations: 1 }
    },
    {
        id: 'dr-materials-empty',
        materials: 'none',
        text: 'How Sound Works. Sound happens when an object vibrates. First, the vibrating object pushes on the air particles next to it. Then these particles bump into the particles beside them, and the vibration travels outward as a wave. After that, the wave reaches our ear and makes the eardrum vibrate. Finally, the brain turns these vibrations into what we hear.',
        expect: { mode: 'global_revision', flags: ['no_genre_material'] }
    }
];

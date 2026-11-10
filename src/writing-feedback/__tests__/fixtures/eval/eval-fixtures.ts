/**
 * Writing Feedback eval fixtures — synthetic LLED 200 descriptive reports
 *
 * Every text here was written by the team for evaluation. None is student writing, so
 * the eval may print and store them freely.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.1.0
 * @description: Fixed inputs and expected behaviour for the live Writing Feedback eval.
 */

import type { WritingAssignment, WritingSourceMaterial } from '../../../contracts';
import { buildDefaultWritingAssignment } from '../../../rubric/default-rubric-profile';
import { approveRubricDraft } from '../../../rubric/rubric-schema';

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

/** Instructor handout the general analysis reads in place of the SFL profile's stages. */
export const EVAL_HANDOUT: WritingSourceMaterial = {
    id: 'eval-handout',
    courseId: 'eval-course',
    assignmentId: 'eval-a2',
    kind: 'paste',
    text: [
        'A2: Descriptive report (one paragraph).',
        'Your report must include these three sections, in this order:',
        '1. General statement: identify and formally define the entity.',
        '2. Classification or composition: state the types of the entity or its parts.',
        '3. Description: describe each type or part in turn.',
        'You may end with a short closing that generalizes about the classification; this is optional.',
        'A descriptive report organizes knowledge about a class of things. It does not explain how a process happens step by step.'
    ].join('\n'),
    hasTables: false,
    characterCount: 0,
    addedAt: new Date('2026-09-28T00:00:00.000Z'),
    addedBy: 'eval-instructor'
};

/** A general-analysis fixture that brings its own assignment, for kinds of work other than a report. */
export interface GeneralEvalFixture extends EvalFixture {
    title: string;
    instructions: string;
    handout?: string;
}

/**
 * buildGeneralEvalAssignment - an approved assignment built from one general fixture.
 *
 * @param fixture - Supplies the title and instructions
 * @returns An approved assignment with the default rubric and no genre profile
 */
export function buildGeneralEvalAssignment(fixture: GeneralEvalFixture): WritingAssignment {
    const assignment = buildDefaultWritingAssignment('eval-course', `eval-${fixture.id}`, fixture.title, fixture.instructions);
    const rubric = { ...assignment.rubric, task: fixture.instructions };
    delete rubric.sflContext;
    assignment.rubric = approveRubricDraft(rubric, 'eval-instructor', new Date('2026-11-09T00:00:00.000Z'));
    return assignment;
}

/**
 * generalEvalHandout - the fixture's handout as stored instructor material.
 *
 * @param fixture - Fixture that may carry a handout
 * @returns Source materials for the engine; empty when the fixture has no handout
 */
export function generalEvalHandout(fixture: GeneralEvalFixture): WritingSourceMaterial[] {
    if (!fixture.handout) return [];
    return [{
        ...EVAL_HANDOUT,
        id: `handout-${fixture.id}`,
        assignmentId: `eval-${fixture.id}`,
        text: fixture.handout,
        characterCount: fixture.handout.length
    }];
}

const DESIGN_MEMO_HANDOUT = [
    'Design memo. Your memo must include these sections:',
    '1. Problem: state the design problem and its constraints.',
    '2. Options: describe at least two options.',
    '3. Recommendation: recommend one option and justify it against the constraints.'
].join('\n');

/** On-task work of other kinds must stay unflagged; only the off-task memo is flagged. */
export const GENERAL_EVAL_FIXTURES: GeneralEvalFixture[] = [
    {
        id: 'general-design-memo-on-task',
        title: 'Footbridge design memo',
        instructions: 'Write a short design memo recommending a footbridge deck material.',
        handout: DESIGN_MEMO_HANDOUT,
        materials: 'none',
        text: 'Problem. The campus footbridge deck must span 12 m, carry 5 kPa, and cost under $40,000. Options. A timber deck is cheap and light but needs sealing every three years. A glass-fibre deck costs more at first but needs almost no upkeep. Recommendation. We recommend the glass-fibre deck because it stays within the $40,000 limit and removes the sealing cost over the life of the bridge.',
        expect: { mode: 'standard' }
    },
    {
        id: 'general-design-memo-off-task',
        title: 'Footbridge design memo',
        instructions: 'Write a short design memo recommending a footbridge deck material.',
        handout: DESIGN_MEMO_HANDOUT,
        materials: 'none',
        text: 'Last weekend I walked over the old footbridge with my friends. It was sunny and we took some photos. I felt a bit nervous because the bridge moved when we jumped on it. Afterwards we went for lunch and talked about our classes. I really enjoy being on campus in the fall.',
        expect: { mode: 'global_revision' }
    },
    {
        id: 'general-problem-set',
        title: 'Statics problem set 3',
        instructions: 'Answer each question and show your reasoning. Q1: Find the reaction at support A of a 4 m simply supported beam with a 10 kN load at midspan. Q2: Explain why the reactions are equal.',
        materials: 'none',
        text: 'Q1. Taking moments about B, RA times 4 m equals 10 kN times 2 m, so RA is 5 kN. Q2. The reactions are equal because the load is at the midpoint, so each support carries the same moment arm.',
        expect: { mode: 'standard' }
    },
    {
        id: 'general-reflection',
        title: 'Team project reflection',
        instructions: 'Write a personal reflection on what you learned about working in a team during the term project.',
        materials: 'none',
        text: 'At the start of the project I tried to do everything myself because I was worried about our grade. When my teammate pointed out that I had changed her section without asking, I felt embarrassed. Since then I have learned to raise concerns early and to trust the plan we agreed on. In my next project I want to ask what each person needs before I start.',
        expect: { mode: 'standard' }
    }
];

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
        // Two of three required stages fail: under 75%, so standard feedback naming the gap.
        expect: { mode: 'standard', stageStatuses: { identify: 'present', classify: 'missing' }, firstGoalAddressesStage: 'classify' }
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
    },
    {
        id: 'dr-mostly-missing',
        materials: 'lecture-notes',
        text: 'Batteries. Batteries are in a lot of things we use every day. My phone battery always runs out too fast. Some people say you should not charge your phone overnight. I think batteries will get better in the future because companies are working on it.',
        expect: { mode: 'global_revision' }
    }
];

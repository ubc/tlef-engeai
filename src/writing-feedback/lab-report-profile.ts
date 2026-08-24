/**
 * Lab-report profile — the seeded technical rubric for engineering lab reports
 *
 * Mirrors the APSC 182 Lab Evaluation Form: seven weighted sections and a
 * four-point ordinal scale. Instructors receive this as an editable draft and
 * must approve it before it governs any generation. Data only; it activates
 * and scores nothing on its own.
 *
 * @author: @rdschrs
 * @date: 2026-08-20
 * @version: 1.0.0
 * @description: Builds the editable lab-report technical rubric template.
 */

import type { WritingRubricCriterion, WritingRubricDefinition, WritingRubricLevel } from './contracts';
import { spaceBandsEvenly } from './rubric-bands';

/** The seven evaluation-form sections, in form order, carrying their weights as data. */
export const LAB_REPORT_CRITERIA: ReadonlyArray<WritingRubricCriterion> = [
    {
        id: 'report_presentation',
        label: 'Report Presentation',
        description: 'Whether the report is properly formatted, contains all required elements, and is presented in a clear, organized, professional way.',
        points: 15
    },
    {
        id: 'language',
        label: 'Language',
        description: 'Whether the quality of the language is appropriate and technical language is used where appropriate.',
        points: 5
    },
    {
        id: 'abstract',
        label: 'Summary/Abstract',
        description: 'Whether the summary is complete and concise, and states the experimental objectives, important results, and main conclusions.',
        points: 10
    },
    {
        id: 'results_discussion',
        label: 'Results and Discussion',
        description: 'Whether every point in the lab handout is addressed, the discussion is correct and comprehensive, results are compared to theoretical or reported values, sources of error and deviations are critically discussed, and the report demonstrates understanding of the phenomena involved.',
        points: 45
    },
    {
        id: 'conclusions',
        label: 'Conclusions',
        description: 'Whether the conclusions are supported by the results and discussion, relevant information is presented, and recommendations for improving the experiment are made.',
        points: 5
    },
    {
        id: 'references',
        label: 'References',
        description: 'Whether material is appropriately referenced in the required citation style.',
        points: 5
    },
    {
        id: 'sample_calculations',
        label: 'Sample Calculations',
        description: 'Whether calculations are presented clearly and logically, use correct equations, are accurate, and report the correct number of significant figures.',
        points: 15
    }
];

/** Four-point ordinal scale shared with the linguistic default, carrying seeded points. */
export const LAB_REPORT_LEVELS: ReadonlyArray<WritingRubricLevel> = [
    { id: 'weak', label: 'Weak', description: 'The section is not yet demonstrated; revision should start here.', rank: 1, points: 0 },
    { id: 'developing', label: 'Developing', description: 'The section is partly demonstrated and needs focused revision.', rank: 2, points: 1 },
    { id: 'proficient', label: 'Proficient', description: 'The section is clearly demonstrated for this lab report.', rank: 3, points: 2 },
    { id: 'exemplary', label: 'Exemplary', description: 'The section is demonstrated precisely and effectively.', rank: 4, points: 3 }
];

/** Per-section, per-level descriptors merged into the derived point bands. */
const LAB_REPORT_DESCRIPTORS: Record<string, Record<string, string>> = {
    report_presentation: {
        weak: 'The report is missing required elements or its formatting makes it difficult to follow.',
        developing: 'Most required elements are present, but formatting or organization is inconsistent in places.',
        proficient: 'The report is properly formatted, contains all required elements, and is organized clearly.',
        exemplary: 'The report is properly formatted, complete, and presented in a polished, professional way that reads like a finished technical document.'
    },
    language: {
        weak: 'Language errors or imprecise wording interfere with understanding, and technical terms are used incorrectly or not at all.',
        developing: 'Language is mostly clear, but technical terminology is used inconsistently or occasionally imprecisely.',
        proficient: 'Language quality is appropriate throughout and technical terms are used correctly where needed.',
        exemplary: 'Language is precise and appropriate throughout, and technical terminology is used accurately and confidently.'
    },
    abstract: {
        weak: 'The summary is missing, or omits the objectives, results, or conclusions.',
        developing: 'The summary states most of the objectives, results, and conclusions but is incomplete or unfocused.',
        proficient: 'The summary is complete and concise, and clearly states the objectives, key results, and main conclusions.',
        exemplary: 'The summary is complete, concise, and gives a reader who reads nothing else an accurate picture of what was done, found, and concluded.'
    },
    results_discussion: {
        weak: 'Most handout points are unaddressed, results are not compared to expected values, and deviations are not discussed.',
        developing: 'Some handout points are addressed and results are compared to expected values, but the discussion of deviations or error sources is thin or missing.',
        proficient: 'Every point in the handout is addressed, results are compared to theoretical or reported values, and sources of error and deviations are discussed.',
        exemplary: 'Every point is addressed comprehensively, results are compared critically to expected values, and deviations are explained with plausible, well-reasoned causes that show real understanding of the phenomena.'
    },
    conclusions: {
        weak: 'Conclusions are missing, unsupported by the results, or unrelated to the discussion.',
        developing: 'Conclusions follow the results in general terms but omit relevant information or recommendations.',
        proficient: 'Conclusions are supported by the results and discussion, present relevant information, and include recommendations for improving the experiment.',
        exemplary: 'Conclusions follow directly and precisely from the results and discussion, and the recommendations show genuine insight into how the experiment could be improved.'
    },
    references: {
        weak: 'Sources are missing or not cited in the required style.',
        developing: 'Most sources are cited, but the style is inconsistent or some citations are missing.',
        proficient: 'Material is appropriately referenced throughout in the required citation style.',
        exemplary: 'Every source is referenced accurately and consistently in the required citation style, with no gaps.'
    },
    sample_calculations: {
        weak: 'Calculations are missing, use incorrect equations, or contain errors that affect the results.',
        developing: 'Calculations are mostly correct but are presented unclearly or use an inconsistent number of significant figures.',
        proficient: 'Calculations are presented clearly and logically, use correct equations, are accurate, and report the correct number of significant figures.',
        exemplary: 'Calculations are presented clearly and logically, are fully accurate, use correct equations, and are precise about significant figures throughout.'
    }
};

/**
 * withLabReportDescriptors - merges the seeded descriptor text into derived point bands.
 *
 * @param criterionId - Section whose bands are being built
 * @param cells - Bands already derived by {@link spaceBandsEvenly}
 * @returns The same bands, each carrying its seeded descriptor
 */
function withLabReportDescriptors(
    criterionId: string,
    cells: Record<string, { min: number; max: number; descriptor?: string }>
): Record<string, { min: number; max: number; descriptor?: string }> {
    const descriptors = LAB_REPORT_DESCRIPTORS[criterionId];
    if (!descriptors) return cells;
    const withText: Record<string, { min: number; max: number; descriptor?: string }> = {};
    Object.entries(cells).forEach(([levelId, cell]) => {
        withText[levelId] = descriptors[levelId] ? { ...cell, descriptor: descriptors[levelId] } : cell;
    });
    return withText;
}

/**
 * buildLabReportRubric - creates a fresh, unapproved technical rubric draft.
 *
 * @param actorUserId - Internal actor recorded as the template creator
 * @param now - Shared timestamp used for deterministic persistence and tests
 * @returns Draft rubric with independent criterion and level objects
 */
export function buildLabReportRubric(
    actorUserId: string = 'platform',
    now: Date = new Date()
): WritingRubricDefinition {
    return {
        version: 1,
        status: 'draft',
        title: 'Lab report technical rubric',
        task: 'Write a laboratory report documenting an experiment, its results, and their interpretation.',
        audience: 'A technical reader who did not perform the experiment.',
        purpose: 'Report what was measured, what was found, and what the findings mean, including how and why the results deviate from expected values.',
        constraints: [
            'Report all results in SI units, using scientific notation rather than spreadsheet exponent format.',
            'Present each result in either a table or a figure, never duplicated in both.',
            'Provide one sample calculation for each type of calculation performed.',
            'Cite every source of a literature value, equation, or image.'
        ],
        learningOutcomes: [
            'Represent experimental data accurately, including its uncertainty.',
            'Compare measured results against theoretical or reported values.',
            'Explain deviations from expected results with plausible, quantitatively reasonable causes.',
            'Draw conclusions that follow from the reported results.'
        ],
        gradingIntent: 'Provide formative, evidence-based technical feedback using ordinal levels. Results are not judged on agreement with theory; the quality of the analysis and explanation is what is assessed.',
        criteria: LAB_REPORT_CRITERIA.map((criterion) => ({
            ...criterion,
            cells: withLabReportDescriptors(criterion.id, spaceBandsEvenly(criterion.points ?? 0, LAB_REPORT_LEVELS))
        })),
        levels: LAB_REPORT_LEVELS.map((level) => ({ ...level })),
        updatedAt: now,
        updatedBy: actorUserId
    };
}

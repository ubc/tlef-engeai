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

/** The seven evaluation-form sections, in form order, with their weights stated in each description. */
export const LAB_REPORT_CRITERIA: ReadonlyArray<WritingRubricCriterion> = [
    {
        id: 'report_presentation',
        label: 'Report Presentation',
        description: 'Whether the report is properly formatted, contains all required elements, and is presented in a clear, organized, professional way (15 points).'
    },
    {
        id: 'language',
        label: 'Language',
        description: 'Whether the quality of the language is appropriate and technical language is used where appropriate (5 points).'
    },
    {
        id: 'abstract',
        label: 'Summary/Abstract',
        description: 'Whether the summary is complete and concise, and states the experimental objectives, important results, and main conclusions (10 points).'
    },
    {
        id: 'results_discussion',
        label: 'Results and Discussion',
        description: 'Whether every point in the lab handout is addressed, the discussion is correct and comprehensive, results are compared to theoretical or reported values, sources of error and deviations are critically discussed, and the report demonstrates understanding of the phenomena involved (45 points).'
    },
    {
        id: 'conclusions',
        label: 'Conclusions',
        description: 'Whether the conclusions are supported by the results and discussion, relevant information is presented, and recommendations for improving the experiment are made (5 points).'
    },
    {
        id: 'references',
        label: 'References',
        description: 'Whether material is appropriately referenced in the required citation style (5 points).'
    },
    {
        id: 'sample_calculations',
        label: 'Sample Calculations',
        description: 'Whether calculations are presented clearly and logically, use correct equations, are accurate, and report the correct number of significant figures (15 points).'
    }
];

/** Four-point ordinal scale shared with the linguistic default, carrying seeded points. */
export const LAB_REPORT_LEVELS: ReadonlyArray<WritingRubricLevel> = [
    { id: 'weak', label: 'Weak', description: 'The section is not yet demonstrated; revision should start here.', rank: 1, points: 0 },
    { id: 'developing', label: 'Developing', description: 'The section is partly demonstrated and needs focused revision.', rank: 2, points: 1 },
    { id: 'proficient', label: 'Proficient', description: 'The section is clearly demonstrated for this lab report.', rank: 3, points: 2 },
    { id: 'exemplary', label: 'Exemplary', description: 'The section is demonstrated precisely and effectively.', rank: 4, points: 3 }
];

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
        criteria: LAB_REPORT_CRITERIA.map((criterion) => ({ ...criterion })),
        levels: LAB_REPORT_LEVELS.map((level) => ({ ...level })),
        updatedAt: now,
        updatedBy: actorUserId
    };
}

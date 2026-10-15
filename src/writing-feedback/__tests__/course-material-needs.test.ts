/**
 * @fileoverview Need builders and need-based retrieval: short focused queries, no
 * student text in any query, published-only citability, and advisory failure.
 */

import type { SflAnalysis } from '../contracts';
import {
    buildContrastNeed,
    buildFindingNeeds,
    buildGenreNeeds,
    isTeachableRequirement,
    retrieveForNeeds,
    MAX_GENRE_QUERIES
} from '../course-material-mentions';
import { buildEvalAssignment } from './fixtures/eval/eval-fixtures';

const assignment = buildEvalAssignment();
const studentQuote = 'Sound happens when an object vibrates.';
const analysis = {
    findings: [{
        id: 'f1',
        evidence: [{ quote: studentQuote }],
        observation: 'The writer sequences vibration events.',
        functionalInterpretation: 'It explains a process instead of classifying.',
        primaryFunction: 'organizational',
        crossFunctions: [],
        languageLevel: 'clause_word',
        ruleIds: ['O10'],
        sourceIds: [],
        confidence: 0.7,
        alternatives: []
    }],
    abstentions: [],
    internalFlags: []
} as unknown as SflAnalysis;

describe('need builders', () => {
    it('builds one short genre need per stage, requirement and language function, capped', () => {
        const needs = buildGenreNeeds(assignment);
        expect(needs.length).toBeLessThanOrEqual(MAX_GENRE_QUERIES);
        expect(needs.filter((need) => need.kind === 'stage').map((need) => need.stageId))
            .toEqual(['identify', 'classify', 'describe', 'conclude']);
        expect(needs.some((need) => need.kind === 'language_function' && /theme/i.test(need.query))).toBe(true); // retrieval wording keeps the technical term
        needs.forEach((need) => expect(need.query.length).toBeLessThan(300));
    });

    it('builds a contrast need only for a different genre', () => {
        expect(buildContrastNeed('explanation', 'descriptive_report')?.query).toMatch(/explanation/);
        expect(buildContrastNeed('descriptive_report', 'descriptive_report')).toBeNull();
        expect(buildContrastNeed('unclear', 'descriptive_report')).toBeNull();
    });

    it('expands finding queries with curated SFL vocabulary', () => {
        const [need] = buildFindingNeeds(assignment, analysis);
        expect(need.query).toMatch(/rheme/);
        expect(need.clusterKey).toBe('organizational|clause_word|O10');
    });

    it('never puts student text or analyzer prose in any query', () => {
        const queries = [
            ...buildGenreNeeds(assignment),
            ...buildFindingNeeds(assignment, analysis),
            buildContrastNeed('explanation', 'descriptive_report')!
        ].map((need) => need.query).join('\n');
        expect(queries).not.toContain(studentQuote);
        expect(queries).not.toContain('sequences vibration events');
        expect(queries).not.toContain('explains a process instead of classifying');
    });
});

describe('retrieveForNeeds', () => {
    const chunk = (id: string, published: boolean, content: string, score = 0.9) => ({
        content, score, published, metadata: { id, topicOrWeekTitle: 'Week 3', itemTitle: 'Lecture', name: id }
    });

    it('dedupes excerpts across needs, records every need that found them, and ids them', async () => {
        const retriever = { retrieve: jest.fn(async () => [chunk('m1', true, 'Reports classify entities.')]) };
        const needs = buildGenreNeeds(assignment).slice(0, 2);
        const result = await retrieveForNeeds(assignment, needs, { retriever, budgetChars: 4000, idPrefix: 'g' });
        expect(result.excerpts).toHaveLength(1);
        expect(result.excerpts[0]).toMatchObject({ id: 'g1', published: true, needIds: needs.map((need) => need.id) });
        expect(result.excerpts[0].mention?.label).toBe('Week 3 · Lecture · m1');
    });

    it('keeps unpublished text readable but without a mention', async () => {
        const retriever = { retrieve: jest.fn(async () => [chunk('draft', false, 'Unpublished notes.')]) };
        const result = await retrieveForNeeds(assignment, buildGenreNeeds(assignment).slice(0, 1), { retriever, budgetChars: 4000, idPrefix: 'g' });
        expect(result.excerpts[0].published).toBe(false);
        expect(result.excerpts[0].mention).toBeUndefined();
        expect(result.excerpts[0].staffMention?.label).toBe('Week 3 · Lecture · draft');
    });

    it('respects the character budget, best score first', async () => {
        const long = 'x'.repeat(600);
        const retriever = { retrieve: jest.fn(async ({ query }: { query: string }) => [chunk(query.slice(0, 12), true, `${query.slice(0, 5)}${long}`, Math.random())]) };
        const result = await retrieveForNeeds(assignment, buildGenreNeeds(assignment), { retriever, budgetChars: 1300, idPrefix: 'g' });
        expect(result.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0)).toBeLessThanOrEqual(1300);
    });

    it('is advisory: a retriever failure returns no excerpts and failed=true', async () => {
        const retriever = { retrieve: jest.fn(async () => { throw new Error('qdrant down'); }) };
        const result = await retrieveForNeeds(assignment, buildGenreNeeds(assignment), { retriever, budgetChars: 4000, idPrefix: 'g' });
        expect(result).toEqual({ excerpts: [], failed: true });
    });
});

const MOCK_TASK = 'Write a descriptive report (250–350 words) that classifies an everyday engineering or scientific entity into its main types, or breaks it into its main parts.';
const MOCK_STAGES = ['General statement', 'Classification', 'Description', 'Closing'];

describe('isTeachableRequirement (D-154)', () => {
    it.each([
        'Use 250–350 words.',
        'Length: 1–2 pages',
        'Submit as a .docx file',
        'Due Friday at 11:59 pm',
        'No outside sources required.',
        'Drafted individually in class, typed afterwards.'
    ])('drops logistics: %s', (requirement) => {
        expect(isTeachableRequirement(requirement, MOCK_STAGES, MOCK_TASK)).toBe(false);
    });

    it('drops a requirement that repeats two or more stages', () => {
        expect(isTeachableRequirement('Include a general statement, classification, and description.', MOCK_STAGES, MOCK_TASK)).toBe(false);
    });

    it('drops a restatement of the task', () => {
        expect(isTeachableRequirement('Classify an everyday engineering or scientific entity into its main types or break it into its main parts.', MOCK_STAGES, MOCK_TASK)).toBe(false);
    });

    it.each([
        'Explain how each type changes due to heating.',
        'Compare the length and mass of each type.',
        'Follow the formal definition format: term, class, features.'
    ])('keeps a skill requirement that shares a logistics word: %s', (requirement) => {
        expect(isTeachableRequirement(requirement, MOCK_STAGES, MOCK_TASK)).toBe(true);
    });

    it('keeps a real skill requirement', () => {
        expect(isTeachableRequirement('Use at least two sources to support each type', MOCK_STAGES, MOCK_TASK)).toBe(true);
        expect(isTeachableRequirement('Include a title that names the entity.', MOCK_STAGES, MOCK_TASK)).toBe(true);
    });
});

describe('genre language functions (D-154)', () => {
    it('drops functions that repeat a stage and uses readable labels', () => {
        const labels = buildGenreNeeds(assignment).filter((need) => need.kind === 'language_function').map((need) => need.label);
        expect(labels).toEqual(['Sentence openings that guide the reader', 'Building precise noun phrases', 'Objective stance']);
        labels.forEach((label) => expect(label).not.toMatch(/\b(theme|rheme|noun group|thematic)\b/i));
    });

    it('gives a custom genre the default list', () => {
        const custom = buildEvalAssignment();
        custom.rubric = { ...custom.rubric, sflContext: { ...custom.rubric.sflContext!, genreId: 'custom_memo' as never, stages: [] } };
        expect(buildGenreNeeds(custom).filter((need) => need.kind === 'language_function').map((need) => need.label))
            .toEqual(['Sentence openings that guide the reader', 'Linking ideas across sentences', 'Objective stance']);
    });

    it('keeps the eval assignment title requirement as a short label', () => {
        expect(buildGenreNeeds(assignment).filter((need) => need.kind === 'task_requirement').map((need) => need.label))
            .toEqual(['A title that names the entity']);
    });
});

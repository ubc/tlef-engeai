/**
 * @fileoverview Need builders and need-based retrieval: short focused queries, no
 * student text in any query, published-only citability, and advisory failure.
 */

import type { SflAnalysis } from '../contracts';
import {
    buildContrastNeed,
    buildFindingNeeds,
    buildGenreNeeds,
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
        expect(needs.some((need) => need.kind === 'language_function' && /theme/i.test(need.query))).toBe(true);
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

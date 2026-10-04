/**
 * @fileoverview The lab-report eval fixtures build an assignment the technical engine
 * accepts, carry known course terms, and produce exact-evidence mock output.
 */

import { buildLabEvalAssignment, LAB_EVAL_FIXTURES } from './fixtures/eval/lab-eval-fixtures';
import { buildTechnicalFeedbackSystemPrompt, technicalKnownTerms, TechnicalWritingFeedbackEngine } from '../technical-feedback-engine';

describe('lab-report eval fixtures', () => {
    const assignment = buildLabEvalAssignment();

    it('builds an approved lab-report assignment the technical prompt accepts', () => {
        expect(assignment.isLabReport).toBe(true);
        expect(() => buildTechnicalFeedbackSystemPrompt(assignment)).not.toThrow();
    });

    it('carries the course glossary and stage labels as known terms', () => {
        expect(technicalKnownTerms(assignment)).toEqual(expect.arrayContaining(['thermal expansion coefficient', 'Results', 'Discussion']));
    });

    it('has distinct synthetic fixtures the mock engine can quote exactly', async () => {
        expect(new Set(LAB_EVAL_FIXTURES.map((fixture) => fixture.id)).size).toBe(LAB_EVAL_FIXTURES.length);
        const original = process.env.MOCK_RESPONSE;
        process.env.MOCK_RESPONSE = 'true';
        for (const fixture of LAB_EVAL_FIXTURES) {
            const result = await new TechnicalWritingFeedbackEngine().generate({ assignment, verifiedText: fixture.text });
            result.criteria.forEach((criterion) => criterion.evidence.forEach((item) => expect(fixture.text).toContain(item.quote)));
        }
        if (original === undefined) delete process.env.MOCK_RESPONSE; else process.env.MOCK_RESPONSE = original;
    });
});

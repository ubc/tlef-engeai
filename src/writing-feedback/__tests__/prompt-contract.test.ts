/**
 * @fileoverview Prompt contract: explained expectedness codes, no unexplained gates, Theme
 * no longer suppressed, worked examples present, invariants kept, whole-text problem method.
 */

import { buildSflAnalyzerSystemPrompt, buildWritingFeedbackSystemPrompt } from '../feedback-engine';
import { sflFoundationPromptResource } from '../sfl-foundation';
import { buildEvalAssignment } from './fixtures/eval/eval-fixtures';

const assignment = buildEvalAssignment();

describe('foundation resource', () => {
    const resource = JSON.parse(sflFoundationPromptResource());

    it('explains every expectedness code', () => {
        expect(Object.keys(resource.expectednessLegend).sort()).toEqual(['E', 'O', 'P', 'R']);
    });

    it('does not send gates the model is never told how to use', () => {
        expect(JSON.stringify(resource.rules)).not.toContain('"gates"');
        expect(JSON.stringify(resource.rules)).not.toContain('theme_analysis_reliable');
    });
});

describe('analyzer prompt', () => {
    const prompt = buildSflAnalyzerSystemPrompt(assignment, [{ id: 'g1', text: 'Theme is the point of departure.' }]);

    it('asks for Theme analysis at clause level', () => {
        expect(prompt).toMatch(/Theme/);
        expect(prompt).toMatch(/abstain only for fragments/i);
    });

    it('carries course excerpts and worked examples', () => {
        expect(prompt).toContain('Theme is the point of departure.');
        expect(prompt).toContain('<worked_examples>');
    });
});

describe('writer prompt', () => {
    it('states the pedagogy before the constraints', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment);
        expect(prompt.indexOf('Pedagogy')).toBeGreaterThan(-1);
        expect(prompt.indexOf('Pedagogy')).toBeLessThan(prompt.indexOf('Constraints'));
    });

    it('keeps the non-negotiable invariants', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment);
        expect(prompt).toMatch(/copied exactly/);
        expect(prompt).toMatch(/Do not write or rewrite sentences/);
        expect(prompt).toMatch(/supportingExcerptId/);
        expect(prompt).toMatch(/action/);
    });

    it('asks for the overall message and restructuring goal only on a whole-text problem', () => {
        const problem = buildWritingFeedbackSystemPrompt(assignment, true);
        expect(problem).toContain('Write overallMessage');
        expect(problem).toContain('Your first revision goal is the restructuring goal');
        expect(problem).toContain('chosen from transferableStrengths');
        expect(problem).toContain('<worked_example_whole_text_problem>');
        expect(problem).toContain('Never say "rewrite", "resubmit" or "start again".');
        expect(problem).toContain('No list and no numbered steps');
        const fine = buildWritingFeedbackSystemPrompt(assignment);
        expect(fine).not.toContain('overallMessage');
        expect(fine).not.toContain('restructuring goal');
        expect(fine).not.toContain('<worked_example_whole_text_problem>');
    });

    it('never asks for the old rewrite block', () => {
        for (const prompt of [buildWritingFeedbackSystemPrompt(assignment), buildWritingFeedbackSystemPrompt(assignment, true)]) {
            expect(prompt).not.toContain('globalRevision');
            expect(prompt).not.toContain('rewriteGoal');
            expect(prompt).toMatch(/at least one of these revision goals has questionScope "whole"\./i);
        }
    });

    it('points the first goal at a weak or missing section', () => {
        expect(buildWritingFeedbackSystemPrompt(assignment)).toMatch(/weak or missing, your first revision goal addresses it/);
    });

it('writes for the student in plain language, not in SFL terms', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment);
        expect(prompt).not.toMatch(/light SFL terms/);
        expect(prompt).toContain('<student_reader>');
        expect(prompt).toMatch(/Never copy them\. Translate/);
    });

    it('offers the approved stage labels as known terms', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment);
        expect(prompt).toMatch(/Known course terms you may use:.*"General statement"/);
    });

    it('shows an abstract comment as one to avoid', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment);
        expect(prompt).toMatch(/Abstract annotation \(avoid\)/);
    });

    it('names the weakest stage first on a partial fit', () => {
        expect(buildWritingFeedbackSystemPrompt(assignment)).toMatch(/first revision goal.*weakest stage/i);
    });
});

describe('Socratic questions in the writer prompt (D-153)', () => {
    it('requires a scoped Socratic question on every goal', () => {
        const prompt = buildWritingFeedbackSystemPrompt(buildEvalAssignment());
        expect(prompt).toContain('every revision goal has exactly one guidedQuestion and a questionScope');
        expect(prompt).not.toContain('Add a guidedQuestion only when it genuinely helps');
    });

    it('scopes the restructuring goal to the whole submission', () => {
        expect(buildWritingFeedbackSystemPrompt(buildEvalAssignment(), true)).toContain('its questionScope is "whole"');
    });
});

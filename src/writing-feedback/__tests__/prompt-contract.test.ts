/**
 * @fileoverview Prompt contract: explained expectedness codes, no unexplained gates, Theme
 * no longer suppressed, worked examples present, invariants kept, mode-specific method.
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
        const prompt = buildWritingFeedbackSystemPrompt(assignment, 'standard');
        expect(prompt.indexOf('Pedagogy')).toBeGreaterThan(-1);
        expect(prompt.indexOf('Pedagogy')).toBeLessThan(prompt.indexOf('Constraints'));
    });

    it('keeps the non-negotiable invariants', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment, 'standard');
        expect(prompt).toMatch(/copied exactly/);
        expect(prompt).toMatch(/Do not write or rewrite sentences/);
        expect(prompt).toMatch(/supportingExcerptId/);
        expect(prompt).toMatch(/action/);
    });

    it('switches method in global mode', () => {
        const standard = buildWritingFeedbackSystemPrompt(assignment, 'standard');
        const global = buildWritingFeedbackSystemPrompt(assignment, 'global_revision');
        expect(global).toContain('This text needs a rewrite');
        expect(standard).not.toContain('This text needs a rewrite');
        expect(global).toContain('<worked_example_global>');
    });

    it('names the weakest stage first on a partial fit', () => {
        expect(buildWritingFeedbackSystemPrompt(assignment, 'standard')).toMatch(/first revision goal.*weakest stage/i);
    });
});

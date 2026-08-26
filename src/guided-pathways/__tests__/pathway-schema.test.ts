/**
 * pathway-schema.test.ts — unit tests for dynamic pathway evaluation result builders.
 */

import {
    buildPathwayEvaluationSchema,
    buildPathwayResult,
    isPathwayEvaluable,
    formatPathwayResponse,
} from '../pathway-schema';
import { buildPlatformPathwaySeeds } from '../pathway-seed';
import { buildPathwayEvaluationSystemPrompt } from '../pathway-prompt';
import { PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT } from '../pathway-evaluation-prompt-default';

describe('pathway-schema', () => {
    const courseName = 'APSC 183';
    const seeds = buildPlatformPathwaySeeds(1);

    it('isPathwayEvaluable requires enabled + non-empty response', () => {
        expect(isPathwayEvaluable(seeds[0])).toBe(true);
        expect(
            isPathwayEvaluable({
                ...seeds[0],
                assistantResponse: '   ',
            })
        ).toBe(false);
        expect(
            isPathwayEvaluable({
                ...seeds[0],
                enabled: false,
            })
        ).toBe(false);
    });

    it('formatPathwayResponse substitutes courseName', () => {
        expect(formatPathwayResponse('Hello {courseName}', courseName)).toBe('Hello APSC 183');
    });

    it('buildPathwayResult returns no trigger for none', () => {
        const result = buildPathwayResult('none', courseName, seeds);
        expect(result.triggered).toBe(false);
        expect(result.winningPathwayId).toBeNull();
        expect(result.responseText).toBeNull();
        expect(result.ctas).toEqual([]);
    });

    it('maps mental-health-crisis with CTAs snapshot', () => {
        const result = buildPathwayResult('mental-health-crisis', courseName, seeds);
        expect(result.triggered).toBe(true);
        expect(result.winningPathwayId).toBe('mental-health-crisis');
        expect(result.responseText).toContain(courseName);
        expect(result.ctas.length).toBeGreaterThan(0);
        expect(result.ctas[0].label).toContain('9-8-8');
    });

    it('maps inappropriate-content', () => {
        expect(buildPathwayResult('inappropriate-content', courseName, seeds).triggered).toBe(true);
    });

    it('unknown pathway id fails safe', () => {
        const result = buildPathwayResult('does-not-exist', courseName, seeds);
        expect(result.triggered).toBe(false);
    });

    it('empty-response pathway cannot win even if id matches', () => {
        const empty = { ...seeds[1], assistantResponse: '' };
        const result = buildPathwayResult(empty.id, courseName, [empty]);
        expect(result.triggered).toBe(false);
    });

    it('buildPathwayEvaluationSchema includes none and pathway ids', () => {
        const schema = buildPathwayEvaluationSchema(['mental-health-crisis', 'inappropriate-content']);
        expect(schema.parse({ pathwayType: 'none' }).pathwayType).toBe('none');
        expect(schema.parse({ pathwayType: 'inappropriate-content' }).pathwayType).toBe(
            'inappropriate-content'
        );
        expect(() => schema.parse({ pathwayType: 'off-topic' })).toThrow();
    });

    it('prompt lists pathway ids and triggers without priority language', () => {
        const prompt = buildPathwayEvaluationSystemPrompt(seeds);
        expect(prompt.indexOf('mental-health-crisis')).toBeLessThan(prompt.indexOf('inappropriate-content'));
        expect(prompt).toContain('### `mental-health-crisis`');
        expect(prompt).not.toContain('Priority rule');
        expect(prompt).not.toContain('priority 1');
        expect(prompt).not.toContain('off-topic');
        expect(prompt).toContain('Calibration reminders');
    });

    it('custom shell replaces pathway_trigger_sections placeholder', () => {
        const shell = `HEADER\n{{pathway_trigger_sections}}\nFOOTER`;
        const prompt = buildPathwayEvaluationSystemPrompt(seeds, shell);
        expect(prompt).toContain('HEADER');
        expect(prompt).toContain('FOOTER');
        expect(prompt).toContain('### `mental-health-crisis`');
        expect(prompt).not.toContain('{{pathway_trigger_sections}}');
    });

    it('platform default shell includes placeholder and few-shot examples', () => {
        expect(PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT).toContain('{{pathway_trigger_sections}}');
        expect(PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT).toContain('## Few-shot');
        expect(PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT).toContain('pathwayType: none');
        expect(PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT).toContain('mental-health-crisis');
    });
});

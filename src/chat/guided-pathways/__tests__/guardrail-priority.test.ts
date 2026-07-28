import { buildGuardrailResult } from '../guardrail-schema';

describe('buildGuardrailResult', () => {
    const courseName = 'APSC 183';

    it('returns no trigger for none', () => {
        const result = buildGuardrailResult('none', courseName);
        expect(result.triggered).toBe(false);
        expect(result.winningGuardrailId).toBeNull();
        expect(result.responseText).toBeNull();
    });

    it('maps mental-health-crisis to static template', () => {
        const result = buildGuardrailResult('mental-health-crisis', courseName);
        expect(result.triggered).toBe(true);
        expect(result.winningGuardrailId).toBe('mental-health-crisis');
        expect(result.responseText).toContain(courseName);
        expect(result.responseText).toContain('UBC Counselling Services');
    });

    it('maps inappropriate-content to static template', () => {
        const result = buildGuardrailResult('inappropriate-content', courseName);
        expect(result.triggered).toBe(true);
        expect(result.winningGuardrailId).toBe('inappropriate-content');
        expect(result.responseText).toContain(courseName);
    });

    it('maps off-topic to static template', () => {
        const result = buildGuardrailResult('off-topic', 'CHBE 241');
        expect(result.triggered).toBe(true);
        expect(result.winningGuardrailId).toBe('off-topic');
        expect(result.responseText).toContain('CHBE 241');
    });
});

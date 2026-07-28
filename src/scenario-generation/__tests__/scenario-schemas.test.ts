/**
 * Scenario schema helpers — title resolution for generated drafts.
 */

import {
    resolveScenarioPersistTitle,
    SCENARIO_DEFAULT_TITLE,
} from '../scenario-schemas';

describe('resolveScenarioPersistTitle', () => {
    it('uses LLM title when instructor title is omitted', () => {
        expect(resolveScenarioPersistTitle(undefined, 'Pump Cavitation Alert')).toBe('Pump Cavitation Alert');
    });

    it('treats Untitled placeholder as absent and uses LLM title', () => {
        expect(resolveScenarioPersistTitle('Untitled', 'Pump Cavitation Alert')).toBe('Pump Cavitation Alert');
    });

    it('treats default fallback string as absent and uses LLM title', () => {
        expect(resolveScenarioPersistTitle(SCENARIO_DEFAULT_TITLE, 'Pump Cavitation Alert')).toBe(
            'Pump Cavitation Alert'
        );
    });

    it('honors a real instructor override', () => {
        expect(resolveScenarioPersistTitle('My Custom Title', 'LLM Title')).toBe('My Custom Title');
    });

    it('falls back when both instructor and LLM titles are empty', () => {
        expect(resolveScenarioPersistTitle(undefined, '')).toBe(SCENARIO_DEFAULT_TITLE);
    });
});

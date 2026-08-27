import {
    DEFAULT_SCENARIO_DEBUG_TOPIC,
    isScenarioDebugMessage,
    parseScenarioDebugTopic,
} from '../debug-scenario-invoke';

describe('debug-scenario-invoke detect/parse', () => {
    it('isScenarioDebugMessage matches /scenario alone (case-insensitive)', () => {
        expect(isScenarioDebugMessage('/scenario')).toBe(true);
        expect(isScenarioDebugMessage('/SCENARIO')).toBe(true);
        expect(isScenarioDebugMessage('  /Scenario  ')).toBe(true);
    });

    it('isScenarioDebugMessage matches /scenario with topic', () => {
        expect(isScenarioDebugMessage('/scenario Heat transfer')).toBe(true);
        expect(isScenarioDebugMessage('/scenario   buffers')).toBe(true);
    });

    it('isScenarioDebugMessage rejects non-commands', () => {
        expect(isScenarioDebugMessage('/debug')).toBe(false);
        expect(isScenarioDebugMessage('scenario')).toBe(false);
        expect(isScenarioDebugMessage('/scenarios')).toBe(false);
        expect(isScenarioDebugMessage('please /scenario now')).toBe(false);
    });

    it('parseScenarioDebugTopic returns default when no topic', () => {
        expect(parseScenarioDebugTopic('/scenario')).toBe(DEFAULT_SCENARIO_DEBUG_TOPIC);
        expect(parseScenarioDebugTopic('/SCENARIO   ')).toBe(DEFAULT_SCENARIO_DEBUG_TOPIC);
    });

    it('parseScenarioDebugTopic returns trimmed topic', () => {
        expect(parseScenarioDebugTopic('/scenario Heat transfer')).toBe('Heat transfer');
        expect(parseScenarioDebugTopic('/scenario   pH buffers  ')).toBe('pH buffers');
    });
});

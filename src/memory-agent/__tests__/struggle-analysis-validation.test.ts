import { filterVerbatimStruggleTopics } from '../struggle-analysis-schema';

describe('filterVerbatimStruggleTopics', () => {
    const allowed = new Set(['Phase diagrams', 'Enthalpy']);

    it('accepts exact catalog string', () => {
        expect(filterVerbatimStruggleTopics(['Phase diagrams'], allowed)).toEqual(['Phase diagrams']);
    });

    it('rejects paraphrase not in catalog', () => {
        expect(filterVerbatimStruggleTopics(['phase diagrams'], allowed)).toEqual([]);
    });

    it('returns empty for empty input', () => {
        expect(filterVerbatimStruggleTopics([], allowed)).toEqual([]);
    });

    it('keeps at most one topic', () => {
        expect(filterVerbatimStruggleTopics(['Phase diagrams', 'Enthalpy'], allowed)).toEqual([
            'Phase diagrams'
        ]);
    });
});

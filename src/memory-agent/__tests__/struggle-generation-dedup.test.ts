import { filterGeneratedStruggleTopics } from '../struggle-generation-schema';

describe('filterGeneratedStruggleTopics (dedup backstop)', () => {
    it('drops exact duplicate of earlier chapter', () => {
        const excluded = new Set(['nernst equation and its effect on cell potential']);
        expect(
            filterGeneratedStruggleTopics(
                ['nernst equation and its effect on cell potential', 'galvanic cell diagram'],
                excluded
            )
        ).toEqual(['galvanic cell diagram']);
    });

    it('drops exact duplicate of current section', () => {
        const excluded = new Set(['diagram of galvanic cell']);
        expect(
            filterGeneratedStruggleTopics(['diagram of galvanic cell', 'salt bridge role'], excluded)
        ).toEqual(['salt bridge role']);
    });

    it('keeps case-sensitive mismatch', () => {
        const excluded = new Set(['phase diagrams']);
        expect(filterGeneratedStruggleTopics(['Phase diagrams'], excluded)).toEqual(['Phase diagrams']);
    });

    it('dedupes duplicate within LLM batch', () => {
        const excluded = new Set<string>();
        expect(
            filterGeneratedStruggleTopics(
                ['enthalpy of reaction', 'enthalpy of reaction', 'entropy change'],
                excluded
            )
        ).toEqual(['enthalpy of reaction', 'entropy change']);
    });

    it('trims whitespace before dedup', () => {
        const excluded = new Set(['existing']);
        expect(filterGeneratedStruggleTopics(['  new topic  ', 'new topic'], excluded)).toEqual([
            'new topic',
        ]);
    });
});

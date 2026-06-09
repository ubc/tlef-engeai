import {
    MAX_STRUGGLE_TOPIC_LABEL_LENGTH,
    filterGeneratedStruggleTopics,
} from '../struggle-generation-schema';

describe('filterGeneratedStruggleTopics', () => {
    const excluded = new Set(['existing label', 'earlier chapter topic']);

    it('drops exact duplicate of earlier chapter', () => {
        expect(
            filterGeneratedStruggleTopics(['earlier chapter topic', 'new topic'], excluded)
        ).toEqual(['new topic']);
    });

    it('drops exact duplicate of current section', () => {
        expect(filterGeneratedStruggleTopics(['existing label'], excluded)).toEqual([]);
    });

    it('keeps case-sensitive mismatch', () => {
        expect(
            filterGeneratedStruggleTopics(['Existing Label', 'new topic'], excluded)
        ).toEqual(['Existing Label', 'new topic']);
    });

    it('dedupes duplicates within LLM batch', () => {
        expect(
            filterGeneratedStruggleTopics(['new topic', 'new topic', 'other'], excluded)
        ).toEqual(['new topic', 'other']);
    });

    it('rejects whitespace-only labels', () => {
        expect(filterGeneratedStruggleTopics(['   ', 'valid topic'], excluded)).toEqual([
            'valid topic',
        ]);
    });

    it('rejects labels longer than max length', () => {
        const tooLong = 'x'.repeat(MAX_STRUGGLE_TOPIC_LABEL_LENGTH + 1);
        expect(filterGeneratedStruggleTopics([tooLong, 'valid topic'], excluded)).toEqual([
            'valid topic',
        ]);
    });

    it('returns at most five labels', () => {
        expect(
            filterGeneratedStruggleTopics(
                ['a', 'b', 'c', 'd', 'e', 'f'],
                new Set<string>()
            )
        ).toEqual(['a', 'b', 'c', 'd', 'e']);
    });
});

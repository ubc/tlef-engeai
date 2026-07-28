import {
    appendScenarioSuggestionsTag,
    parseScenarioSuggestionsTag,
    stripQuestionUnstruggleTag,
    stripScenarioSuggestionsTag,
} from '../message-utils';

describe('message-utils scenario suggestions', () => {
    it('appendScenarioSuggestionsTag appends JSON tag with difficulty', () => {
        const text = appendScenarioSuggestionsTag('Great work!', [
            { id: 'q-1', title: 'Buffer pH', difficulty: 'hard' },
        ]);
        expect(text).toContain('Great work!');
        expect(text).toContain('<scenarioSuggestions>');
        expect(parseScenarioSuggestionsTag(text)).toEqual([
            { id: 'q-1', title: 'Buffer pH', difficulty: 'hard' },
        ]);
    });

    it('parseScenarioSuggestionsTag defaults missing difficulty to medium', () => {
        expect(
            parseScenarioSuggestionsTag(
                '<scenarioSuggestions>[{"id":"a","title":"A"}]</scenarioSuggestions>'
            )
        ).toEqual([{ id: 'a', title: 'A', difficulty: 'medium' }]);
    });

    it('parseScenarioSuggestionsTag returns empty on invalid JSON', () => {
        expect(parseScenarioSuggestionsTag('<scenarioSuggestions>not-json</scenarioSuggestions>')).toEqual([]);
    });

    it('stripScenarioSuggestionsTag removes tag', () => {
        const raw = 'Hello\n\n<scenarioSuggestions>[{"id":"a","title":"A"}]</scenarioSuggestions>';
        expect(stripScenarioSuggestionsTag(raw)).toBe('Hello');
    });

    it('stripQuestionUnstruggleTag still works', () => {
        const raw = 'Answer here <questionUnstruggle Topic="pH">';
        expect(stripQuestionUnstruggleTag(raw, 'pH')).toBe('Answer here');
    });
});

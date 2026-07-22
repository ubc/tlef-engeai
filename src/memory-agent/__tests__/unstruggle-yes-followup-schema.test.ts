import { dedupeLearningObjectiveCatalog } from '../unstruggle-yes-followup';
import {
    filterVerbatimObjectiveTexts,
    unstruggleYesFollowupResponseSchema,
} from '../unstruggle-yes-followup-schema';
import {
    formatUnstruggleYesMessage,
    UNSTRUGGLE_YES_WITH_SCENARIOS_RESPONSES,
} from '../unstruggle-responses';

describe('unstruggle-yes-followup-schema', () => {
    it('parses valid structured response', () => {
        const parsed = unstruggleYesFollowupResponseSchema.parse({
            learningObjectiveTexts: ['Calculate Reynolds number', 'Apply Bernoulli equation'],
        });
        expect(parsed.learningObjectiveTexts).toHaveLength(2);
    });

    it('rejects more than 3 objective texts', () => {
        expect(() =>
            unstruggleYesFollowupResponseSchema.parse({
                learningObjectiveTexts: ['a', 'b', 'c', 'd'],
            })
        ).toThrow();
    });

    it('filterVerbatimObjectiveTexts keeps catalog texts only', () => {
        const allowed = new Set(['LO one', 'LO two']);
        expect(
            filterVerbatimObjectiveTexts(['LO one', 'bad', 'LO two', 'LO one'], allowed)
        ).toEqual(['LO one', 'LO two']);
    });

    it('filterVerbatimObjectiveTexts caps at 3', () => {
        const allowed = new Set(['a', 'b', 'c', 'd']);
        expect(filterVerbatimObjectiveTexts(['a', 'b', 'c', 'd'], allowed)).toEqual([
            'a',
            'b',
            'c',
        ]);
    });
});

describe('formatUnstruggleYesMessage', () => {
    it('replaces {topic} placeholder', () => {
        expect(
            formatUnstruggleYesMessage(
                UNSTRUGGLE_YES_WITH_SCENARIOS_RESPONSES[0],
                'de Broglie wavelength'
            )
        ).toContain('de Broglie wavelength');
        expect(
            formatUnstruggleYesMessage(
                UNSTRUGGLE_YES_WITH_SCENARIOS_RESPONSES[0],
                'de Broglie wavelength'
            )
        ).not.toContain('{topic}');
    });
});

describe('dedupeLearningObjectiveCatalog', () => {
    it('keeps first row per trimmed text', () => {
        expect(
            dedupeLearningObjectiveCatalog([
                {
                    objectiveId: 'a',
                    text: '  Same LO  ',
                    topicOrWeekTitle: 'W1',
                    itemTitle: 'I1',
                },
                {
                    objectiveId: 'b',
                    text: 'Same LO',
                    topicOrWeekTitle: 'W2',
                    itemTitle: 'I2',
                },
                {
                    objectiveId: 'c',
                    text: 'Other LO',
                    topicOrWeekTitle: 'W1',
                    itemTitle: 'I1',
                },
            ])
        ).toEqual([
            { text: 'Same LO', topicOrWeekTitle: 'W1', itemTitle: 'I1' },
            { text: 'Other LO', topicOrWeekTitle: 'W1', itemTitle: 'I1' },
        ]);
    });
});

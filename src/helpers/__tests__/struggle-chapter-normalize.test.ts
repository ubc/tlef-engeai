import {
    assignLabelsToChapters,
    buildLabelToChapterMap,
    coerceFlatStruggleTopicsFromRaw,
    countDistinctStruggleLabels,
    countUnmappedLabels,
    flattenChapterStruggles,
    getStruggleLabelsFromEntry,
    isGarbageStruggleLabel,
    mergeChapterStruggles,
    parseMemoryAgentEntry,
    removeLabelFromChapters
} from '../struggle-chapter-normalize';
import type { InstructorStruggleTopicForDisplay } from '../../types/shared';

const catalog: InstructorStruggleTopicForDisplay[] = [
    {
        struggleTopic: 'Enthalpy',
        topicOrWeekId: 'tw-1',
        topicOrWeekTitle: 'Week 1',
        itemTitle: 'Lecture A'
    },
    {
        struggleTopic: 'Phase diagrams',
        topicOrWeekId: 'tw-1',
        topicOrWeekTitle: 'Week 1',
        itemTitle: 'Lecture B'
    },
    {
        struggleTopic: 'Entropy',
        topicOrWeekId: 'tw-2',
        topicOrWeekTitle: 'Week 2',
        itemTitle: 'Lecture C'
    },
    {
        struggleTopic: 'Enthalpy',
        topicOrWeekId: 'tw-2',
        topicOrWeekTitle: 'Week 2',
        itemTitle: 'Lecture D'
    }
];

const baseEntry = {
    name: 'Student',
    userId: 'u-1',
    role: 'Student' as const,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02')
};

describe('struggle-chapter-normalize', () => {
    it('isGarbageStruggleLabel detects memory-agent error strings', () => {
        expect(isGarbageStruggleLabel('[memory-agent] error parsing json')).toBe(true);
        expect(isGarbageStruggleLabel('Enthalpy')).toBe(false);
    });

    it('buildLabelToChapterMap uses first catalog match for duplicate labels', () => {
        const map = buildLabelToChapterMap(catalog);
        expect(map.get('Enthalpy')).toEqual({
            topicOrWeekId: 'tw-1',
            topicOrWeekTitle: 'Week 1'
        });
    });

    it('assignLabelsToChapters groups labels and omits unmapped', () => {
        const chapters = assignLabelsToChapters(['Enthalpy', 'Entropy', 'Unknown label'], catalog);
        expect(chapters).toEqual([
            {
                topicOrWeekId: 'tw-1',
                topicOrWeekTitle: 'Week 1',
                struggleTopics: ['Enthalpy']
            },
            {
                topicOrWeekId: 'tw-2',
                topicOrWeekTitle: 'Week 2',
                struggleTopics: ['Entropy']
            }
        ]);
    });

    it('assignLabelsToChapters dedupes within chapter', () => {
        const chapters = assignLabelsToChapters(['Enthalpy', 'Enthalpy'], catalog);
        expect(chapters[0].struggleTopics).toEqual(['Enthalpy']);
    });

    it('mergeChapterStruggles appends and dedupes per chapter', () => {
        const existing = [
            {
                topicOrWeekId: 'tw-1',
                topicOrWeekTitle: 'Week 1',
                struggleTopics: ['Enthalpy']
            }
        ];
        const incoming = assignLabelsToChapters(['Phase diagrams', 'Entropy'], catalog);
        const merged = mergeChapterStruggles(existing, incoming);
        expect(merged).toEqual([
            {
                topicOrWeekId: 'tw-1',
                topicOrWeekTitle: 'Week 1',
                struggleTopics: ['Enthalpy', 'Phase diagrams']
            },
            {
                topicOrWeekId: 'tw-2',
                topicOrWeekTitle: 'Week 2',
                struggleTopics: ['Entropy']
            }
        ]);
    });

    it('flattenChapterStruggles returns distinct labels across chapters', () => {
        const flat = flattenChapterStruggles([
            { topicOrWeekId: 'tw-1', topicOrWeekTitle: 'W1', struggleTopics: ['A', 'B'] },
            { topicOrWeekId: 'tw-2', topicOrWeekTitle: 'W2', struggleTopics: ['B', 'C'] }
        ]);
        expect(flat).toEqual(['A', 'B', 'C']);
    });

    it('countDistinctStruggleLabels matches flatten length', () => {
        const chapters = assignLabelsToChapters(['Enthalpy', 'Entropy'], catalog);
        expect(countDistinctStruggleLabels(chapters)).toBe(2);
    });

    it('coerceFlatStruggleTopicsFromRaw merges flat and legacy chapter labels', () => {
        const labels = coerceFlatStruggleTopicsFromRaw({
            ...baseEntry,
            struggleTopics: ['legacy'],
            struggleTopicsByChapter: [
                {
                    topicOrWeekId: 'tw-1',
                    topicOrWeekTitle: 'Week 1',
                    struggleTopics: ['Enthalpy']
                }
            ]
        });
        expect(labels).toEqual(['legacy', 'Enthalpy']);
    });

    it('parseMemoryAgentEntry returns flat canonical shape', () => {
        const parsed = parseMemoryAgentEntry({
            ...baseEntry,
            struggleTopics: ['Enthalpy', 'Entropy']
        });
        expect(parsed.struggleTopics).toEqual(['Enthalpy', 'Entropy']);
        expect(getStruggleLabelsFromEntry(parsed)).toEqual(['Enthalpy', 'Entropy']);
    });

    it('removeLabelFromChapters removes from matching chapter buckets', () => {
        const chapters = assignLabelsToChapters(['Enthalpy', 'Entropy'], catalog);
        const remaining = removeLabelFromChapters(chapters, 'Enthalpy');
        expect(remaining).toEqual([
            {
                topicOrWeekId: 'tw-2',
                topicOrWeekTitle: 'Week 2',
                struggleTopics: ['Entropy']
            }
        ]);
    });

    it('countUnmappedLabels counts labels with no catalog chapter', () => {
        expect(countUnmappedLabels(['Enthalpy', 'made up'], catalog)).toBe(1);
    });

    it('filters garbage labels during assignment', () => {
        const chapters = assignLabelsToChapters(
            ['Enthalpy', '[memory-agent] error parsing json'],
            catalog
        );
        expect(chapters[0].struggleTopics).toEqual(['Enthalpy']);
    });
});

import {
    buildLabelChapterNumberMap,
    filterPdfLegendItems,
    formatChapterTopicsList,
    formatPdfStruggleLine,
    formatPdfStudentStruggleLine
} from '../report-data';
import type { CourseSummaryStackedBar, StruggleStatsLegendItem } from '../../types/shared';

const stackedBar: CourseSummaryStackedBar = {
    xAxisLabel: 'Course Topic',
    yAxisLabel: 'Students',
    categories: [
        { id: 'tw-1', label: 'Topic 1', order: 0 },
        { id: 'tw-2', label: 'Topic 2', order: 1 }
    ],
    series: [
        {
            topic: 'Label A',
            color: '#111111',
            values: [
                { categoryId: 'tw-1', studentCount: 2, tooltip: '' },
                { categoryId: 'tw-2', studentCount: 0, tooltip: '' }
            ]
        },
        {
            topic: 'Label B',
            color: '#222222',
            values: [
                { categoryId: 'tw-1', studentCount: 0, tooltip: '' },
                { categoryId: 'tw-2', studentCount: 1, tooltip: '' }
            ]
        }
    ]
};

describe('pdf-legend-format', () => {
    it('filters out zero-count legend rows', () => {
        const legend: StruggleStatsLegendItem[] = [
            { topic: 'Label A', color: '#111111', studentCount: 2 },
            { topic: 'Label B', color: '#222222', studentCount: 0 }
        ];

        expect(filterPdfLegendItems(legend)).toEqual([legend[0]]);
    });

    it('maps labels to chapter numbers from stacked bar series', () => {
        const chapterByLabel = buildLabelChapterNumberMap(stackedBar);

        expect(chapterByLabel.get('Label A')).toBe(1);
        expect(chapterByLabel.get('Label B')).toBe(2);
    });

    it('formats lines as chapter N : topic – count', () => {
        expect(formatPdfStruggleLine('entropy', 3, 2)).toBe('chapter 2 : entropy – 3');
        expect(formatPdfStruggleLine('entropy', 3, undefined)).toBe('entropy – 3');
    });

    it('formats per-student appendix lines without counts', () => {
        expect(formatPdfStudentStruggleLine('enthalpy', 2)).toBe('chapter 2 : enthalpy');
        expect(formatPdfStudentStruggleLine('entropy', undefined)).toBe('entropy');
    });

    it('formats comma-separated topic lists for chapter groups', () => {
        expect(formatChapterTopicsList(['enthalpy', 'entropy'])).toBe('enthalpy, entropy');
        expect(formatChapterTopicsList([])).toBe('');
    });
});

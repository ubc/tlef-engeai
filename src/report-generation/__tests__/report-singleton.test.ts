import { ChartJsStackedBarRenderer } from '../report-chart';
import { ReportDataService } from '../report-data';
import { ReportDocumentService } from '../report-document';
import type { CourseSummaryStackedBar } from '../../types/shared';

const minimalStackedBar: CourseSummaryStackedBar = {
    xAxisLabel: 'Course Topic',
    yAxisLabel: 'Students',
    categories: [{ id: 'tw-1', label: 'Topic 1', order: 0 }],
    series: [
        {
            topic: 'Label A',
            color: '#4D7A2F',
            values: [{ categoryId: 'tw-1', studentCount: 2, tooltip: 'Label A: 2 students' }]
        }
    ]
};

describe('ChartJsStackedBarRenderer.getInstance', () => {
    it('returns the same reference on repeated calls', () => {
        const first = ChartJsStackedBarRenderer.getInstance();
        const second = ChartJsStackedBarRenderer.getInstance();
        expect(first).toBe(second);
    });

    it('completes concurrent render() calls without throwing', async () => {
        const renderer = ChartJsStackedBarRenderer.getInstance();
        const results = await Promise.all([
            renderer.render(minimalStackedBar),
            renderer.render(minimalStackedBar)
        ]);

        expect(results).toHaveLength(2);
        for (const buffer of results) {
            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
        }
    });
});

describe('ReportDataService.getInstance', () => {
    it('returns the same reference on repeated calls', () => {
        const first = ReportDataService.getInstance();
        const second = ReportDataService.getInstance();
        expect(first).toBe(second);
    });
});

describe('ReportDocumentService.getInstance', () => {
    it('returns the same reference on repeated calls', () => {
        const first = ReportDocumentService.getInstance();
        const second = ReportDocumentService.getInstance();
        expect(first).toBe(second);
    });

    it('parseReportPdfPhase delegates consistently via singleton', () => {
        const instance = ReportDocumentService.getInstance();
        expect(instance.parseReportPdfPhase('full')).toBe('full');
        expect(instance.parseReportPdfPhase('prototype')).toBe('prototype');
        expect(instance.parseReportPdfPhase(undefined)).toBe('prototype');
    });
});

import { mapCourseSummaryStackedBarToChartSpec } from '../chart/chart-spec-mapper';
import type { CourseSummaryStackedBar } from '../../types/shared';

describe('mapCourseSummaryStackedBarToChartSpec', () => {
    const stackedBar: CourseSummaryStackedBar = {
        xAxisLabel: 'Course Topic',
        yAxisLabel: 'Students',
        categories: [
            { id: 'tw-1', label: 'Thermo', order: 0 },
            { id: 'tw-2', label: 'Fluids', order: 1 }
        ],
        series: [
            {
                topic: 'Enthalpy',
                color: '#4D7A2F',
                values: [
                    { categoryId: 'tw-1', studentCount: 3, tooltip: 'Enthalpy: 3 students' },
                    { categoryId: 'tw-2', studentCount: 0, tooltip: 'Enthalpy: 0 students' }
                ]
            }
        ]
    };

    it('maps categories in order and series values by categoryId', () => {
        const spec = mapCourseSummaryStackedBarToChartSpec(stackedBar);
        expect(spec.categories.map((c) => c.label)).toEqual(['Thermo', 'Fluids']);
        expect(spec.series[0].label).toBe('Enthalpy');
        expect(spec.series[0].data[0].value).toBe(3);
        expect(spec.series[0].data[1].value).toBe(0);
    });
});

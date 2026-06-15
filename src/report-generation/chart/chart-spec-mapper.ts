/**
 * chart-spec-mapper.ts
 * @description Maps CourseSummaryStackedBar API shape to Chart.js configuration for server render.
 * Mirrors public/scripts/ui/charts.ts mapCourseSummaryStackedBarToChartSpec (backend-only).
 */

import type { ChartConfiguration } from 'chart.js';
import type { CourseSummaryStackedBar } from '../../types/shared';

const PALETTE_FALLBACK = [
    '#4D7A2F',
    '#2F5F8F',
    '#C9822B',
    '#8B0000',
    '#6F5AA7',
    '#2F7D7E'
] as const;

export interface StackedBarChartSpec {
    categories: Array<{ id: string; label: string; order: number }>;
    series: Array<{
        label: string;
        color: string;
        data: Array<{ categoryId: string; value: number; tooltip: string }>;
    }>;
    xAxisLabel: string;
    yAxisLabel: string;
    stackId: string;
}

function resolveSeriesColor(providedColor: string, paletteIndex: number): string {
    const trimmed = (providedColor || '').trim();
    if (trimmed) {
        return trimmed;
    }
    return PALETTE_FALLBACK[paletteIndex % PALETTE_FALLBACK.length] ?? PALETTE_FALLBACK[0];
}

/** Converts struggle-stats stackedBar payload into a neutral chart spec. */
export function mapCourseSummaryStackedBarToChartSpec(stackedBar: CourseSummaryStackedBar): StackedBarChartSpec {
    const categories = [...(stackedBar.categories ?? [])].sort((a, b) => a.order - b.order);

    return {
        xAxisLabel: stackedBar.xAxisLabel,
        yAxisLabel: stackedBar.yAxisLabel,
        stackId: 'struggle-topics',
        categories: categories.map((c) => ({
            id: c.id,
            label: c.label,
            order: c.order
        })),
        series: (stackedBar.series ?? []).map((series) => ({
            label: series.topic,
            color: series.color,
            data: categories.map((category) => {
                const cell = series.values.find((v) => v.categoryId === category.id);
                const value = cell?.studentCount ?? 0;
                return {
                    categoryId: category.id,
                    value,
                    tooltip: cell?.tooltip ?? `${series.topic}: ${value} student${value === 1 ? '' : 's'}`
                };
            })
        }))
    };
}

/** Builds Chart.js v4 configuration object for chartjs-node-canvas. */
export function buildChartJsConfiguration(spec: StackedBarChartSpec): ChartConfiguration<'bar'> {
    const categories = [...spec.categories].sort((a, b) => a.order - b.order);
    const labels = categories.map((c) => c.label);
    const stackId = spec.stackId;

    const datasets = spec.series.map((series, index) => ({
        label: series.label,
        data: categories.map((category) => {
            const cell = series.data.find((d) => d.categoryId === category.id);
            return cell?.value ?? 0;
        }),
        backgroundColor: resolveSeriesColor(series.color, index),
        borderColor: '#ffffff',
        borderWidth: 1.5,
        borderRadius: 5,
        borderSkipped: false,
        barPercentage: 0.72,
        categoryPercentage: 0.78,
        stack: stackId
    }));

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: false,
            animation: false as const,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: {
                        color: '#333333',
                        font: { size: 11, weight: 'bold' }
                    },
                    title: {
                        display: true,
                        text: spec.xAxisLabel,
                        color: '#333333',
                        font: { size: 12, weight: 'bold' }
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.08)' },
                    ticks: {
                        precision: 0,
                        color: '#333333',
                        font: { size: 11, weight: 'bold' }
                    },
                    title: {
                        display: true,
                        text: spec.yAxisLabel,
                        color: '#333333',
                        font: { size: 12, weight: 'bold' }
                    }
                }
            }
        }
    };
}

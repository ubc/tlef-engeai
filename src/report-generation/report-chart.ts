/**
 * report-chart.ts
 * @author: @gatahcha
 * @date: 2026-06-15
 * @description: Server-side stacked bar chart spec mapping and Chart.js PNG rendering for PDF embed.
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration } from 'chart.js';
import type { CourseSummaryStackedBar } from '../types/shared';
import type { IStackedBarChartRenderer } from './report-contracts';

const PALETTE_FALLBACK = [
    '#4D7A2F',
    '#2F5F8F',
    '#C9822B',
    '#8B0000',
    '#6F5AA7',
    '#2F7D7E'
] as const;

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 360;

/** Neutral chart spec produced from course struggle stacked-bar stats. */
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

/** Optional canvas dimensions for ChartJsStackedBarRenderer (defaults 720×360). */
export interface ChartJsStackedBarRendererOptions {
    width?: number;
    height?: number;
}

function resolveSeriesColor(providedColor: string, paletteIndex: number): string {
    const trimmed = (providedColor || '').trim();
    if (trimmed) {
        return trimmed;
    }
    return PALETTE_FALLBACK[paletteIndex % PALETTE_FALLBACK.length] ?? PALETTE_FALLBACK[0];
}

/**
 * Converts struggle-stats stackedBar payload into a neutral chart spec.
 *
 * @param stackedBar - Course-wide struggle distribution from Mongo aggregation
 * @returns Spec suitable for {@link buildChartJsConfiguration}
 */
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

/**
 * Builds Chart.js v4 configuration object for chartjs-node-canvas.
 *
 * @param spec - Neutral stacked-bar chart spec
 * @returns Chart.js bar chart configuration (non-responsive, animation off)
 */
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

/**
 * Chart.js canvas adapter: renders struggle-topic stacked bar as PNG for PDF embedding.
 *
 * Reuse via {@link getInstance}; concurrent {@link render} calls are serialized on one canvas.
 *
 * Key methods: {@link getInstance}, {@link render}.
 */
export class ChartJsStackedBarRenderer implements IStackedBarChartRenderer {
    private static instance: ChartJsStackedBarRenderer | null = null;

    private readonly canvas: ChartJSNodeCanvas;
    private renderQueue: Promise<unknown> = Promise.resolve();

    private constructor(options: ChartJsStackedBarRendererOptions = {}) {
        const width = options.width ?? DEFAULT_WIDTH;
        const height = options.height ?? DEFAULT_HEIGHT;
        this.canvas = new ChartJSNodeCanvas({
            width,
            height,
            backgroundColour: 'white'
        });
    }

    /**
     * Shared renderer; one ChartJSNodeCanvas per process.
     *
     * @returns ChartJsStackedBarRenderer singleton instance
     */
    public static getInstance(): ChartJsStackedBarRenderer {
        if (!ChartJsStackedBarRenderer.instance) {
            ChartJsStackedBarRenderer.instance = new ChartJsStackedBarRenderer();
        }
        return ChartJsStackedBarRenderer.instance;
    }

    /**
     * Renders stacked-bar stats to a PNG buffer (mutex-serialized on shared canvas).
     *
     * @param stackedBar - Course-wide struggle distribution payload
     * @returns PNG image buffer for PDFKit embed
     */
    async render(stackedBar: CourseSummaryStackedBar): Promise<Buffer> {
        return this.runExclusive(() => this.renderInternal(stackedBar));
    }


    /**
     * Runs a function exclusively on the shared canvas.
     *
     * @param fn - The function to run
     * @returns The result of the function
     */
    private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
        const next = this.renderQueue.then(fn, fn);
        this.renderQueue = next.then(() => undefined, () => undefined);
        return next;
    }

    /**
     * Renders the stacked-bar stats to a PNG buffer.
     *
     * @param stackedBar - Course-wide struggle distribution payload
     * @returns PNG image buffer for PDFKit embed
     */
    private async renderInternal(stackedBar: CourseSummaryStackedBar): Promise<Buffer> {
        const categories = stackedBar.categories ?? [];
        const series = stackedBar.series ?? [];

        if (categories.length === 0 || series.length === 0) {
            return this.renderEmptyPlaceholder();
        }

        const spec = mapCourseSummaryStackedBarToChartSpec(stackedBar);
        const configuration = buildChartJsConfiguration(spec) as ChartConfiguration<'bar'>;
        return this.canvas.renderToBuffer(configuration);
    }

    /**
     * Renders an empty placeholder for the stacked-bar chart.
     *
     * @returns PNG image buffer for PDFKit embed
     */
    private async renderEmptyPlaceholder(): Promise<Buffer> {
        const configuration: ChartConfiguration<'bar'> = {
            type: 'bar',
            data: {
                labels: ['No data'],
                datasets: [{ label: 'No struggle data', data: [0], backgroundColor: '#E5E7EB' }]
            },
            options: {
                responsive: false,
                animation: false as const,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: true },
                    y: { beginAtZero: true, max: 1 }
                }
            }
        };
        return this.canvas.renderToBuffer(configuration);
    }
}

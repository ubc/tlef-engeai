/**
 * chartjs-stacked-bar-renderer.ts
 * @description Server-side stacked bar chart PNG via chartjs-node-canvas (same spec as monitor Chart.js).
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration } from 'chart.js';
import type { CourseSummaryStackedBar } from '../../types/shared';
import type { IStackedBarChartRenderer } from '../interfaces';
import { buildChartJsConfiguration, mapCourseSummaryStackedBarToChartSpec } from './chart-spec-mapper';

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 360;

export interface ChartJsStackedBarRendererOptions {
    width?: number;
    height?: number;
}

/**
 * Renders struggle-topic stacked bar as PNG buffer for PDF embedding.
 */
export class ChartJsStackedBarRenderer implements IStackedBarChartRenderer {
    private readonly canvas: ChartJSNodeCanvas;

    constructor(options: ChartJsStackedBarRendererOptions = {}) {
        const width = options.width ?? DEFAULT_WIDTH;
        const height = options.height ?? DEFAULT_HEIGHT;
        this.canvas = new ChartJSNodeCanvas({
            width,
            height,
            backgroundColour: 'white'
        });
    }

    async render(stackedBar: CourseSummaryStackedBar): Promise<Buffer> {
        const categories = stackedBar.categories ?? [];
        const series = stackedBar.series ?? [];

        if (categories.length === 0 || series.length === 0) {
            return this.renderEmptyPlaceholder();
        }

        const spec = mapCourseSummaryStackedBarToChartSpec(stackedBar);
        const configuration = buildChartJsConfiguration(spec) as ChartConfiguration<'bar'>;
        return this.canvas.renderToBuffer(configuration);
    }

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

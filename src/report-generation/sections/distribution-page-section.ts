/**
 * distribution-page-section.ts
 * @description PDF page 3 — course-wide stacked bar chart + single-column legend.
 */

import type { IReportSection, IStackedBarChartRenderer } from '../interfaces';
import {
    buildLabelChapterNumberMap,
    filterPdfLegendItems,
    formatPdfStruggleLine
} from '../pdf-legend-format';
import type { ReportRenderContext } from '../types';
import type { StruggleStatsLegendItem } from '../../types/shared';

const LEGEND_SWATCH_SIZE = 10;
const LEGEND_ROW_HEIGHT = 14;
const LEGEND_FONT_SIZE = 9;

export class DistributionPageSection implements IReportSection {
    constructor(private readonly chartRenderer: IStackedBarChartRenderer) {}

    async render(context: ReportRenderContext): Promise<void> {
        const { doc, input } = context;
        const { struggleTopics } = input.stats;
        const margin = doc.page.margins.left;
        const contentWidth = doc.page.width - margin * 2;
        let y = doc.page.margins.top;

        doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000');
        doc.text('Struggle Topic Distribution', margin, y, { width: contentWidth });
        y = doc.y + 16;

        const chartBuffer = await this.chartRenderer.render(struggleTopics.stackedBar);
        const chartWidth = contentWidth;
        const chartHeight = 220;
        doc.image(chartBuffer, margin, y, { width: chartWidth, height: chartHeight });
        y += chartHeight + 24;

        this.renderLegend(doc, struggleTopics.legend, struggleTopics.stackedBar, margin, y, contentWidth);
    }

    private renderLegend(
        doc: ReportRenderContext['doc'],
        legend: StruggleStatsLegendItem[],
        stackedBar: ReportRenderContext['input']['stats']['struggleTopics']['stackedBar'],
        x: number,
        startY: number,
        contentWidth: number
    ): void {
        const visibleLegend = filterPdfLegendItems(legend);
        if (!visibleLegend.length) {
            doc.font('Helvetica').fontSize(11).fillColor('#666666');
            doc.text('No struggle topic data recorded.', x, startY);
            doc.fillColor('#000000');
            return;
        }

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
        doc.text('Legend (course-wide unique students per label)', x, startY);
        const legendStartY = doc.y + 10;

        this.renderLegendList(doc, visibleLegend, stackedBar, x, legendStartY, contentWidth);
    }

    private renderLegendList(
        doc: ReportRenderContext['doc'],
        items: StruggleStatsLegendItem[],
        stackedBar: ReportRenderContext['input']['stats']['struggleTopics']['stackedBar'],
        x: number,
        startY: number,
        contentWidth: number
    ): void {
        const chapterByLabel = buildLabelChapterNumberMap(stackedBar);
        let y = startY;
        doc.font('Helvetica').fontSize(LEGEND_FONT_SIZE);

        for (const item of items) {
            doc.save();
            doc.rect(x, y + 2, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE).fill(item.color);
            doc.restore();

            const labelText = formatPdfStruggleLine(
                item.topic,
                item.studentCount,
                chapterByLabel.get(item.topic)
            );
            doc.fillColor('#333333').text(labelText, x + LEGEND_SWATCH_SIZE + 6, y, {
                width: contentWidth - LEGEND_SWATCH_SIZE - 6
            });

            y += LEGEND_ROW_HEIGHT;
        }

        doc.fillColor('#000000');
    }
}

/**
 * prototype-report-pdf-builder.ts
 * @description D3 prototype PDF — pages 1–3 (title, outline, distribution chart).
 */

import type { IReportPdfBuilder, IReportSection, IStackedBarChartRenderer } from '../interfaces';
import { deriveAcademicPeriod } from '../report-academic-period';
import { buildReportPdfFilename } from '../report-filename';
import { renderReportPdfDocument } from '../report-pdf-render';
import { DistributionPageSection } from '../sections/distribution-page-section';
import { OutlinePageSection } from '../sections/outline-page-section';
import { TitlePageSection } from '../sections/title-page-section';
import type { ReportBuildInput, ReportPdfOutput } from '../types';
import { ChartJsStackedBarRenderer } from '../chart/chartjs-stacked-bar-renderer';

export class PrototypeReportPdfBuilder implements IReportPdfBuilder {
    private readonly sections: IReportSection[];

    constructor(chartRenderer?: IStackedBarChartRenderer) {
        const renderer = chartRenderer ?? new ChartJsStackedBarRenderer();
        this.sections = [
            new TitlePageSection(),
            new OutlinePageSection(),
            new DistributionPageSection(renderer)
        ];
    }

    getSections(): IReportSection[] {
        return this.sections;
    }

    async build(input: ReportBuildInput): Promise<ReportPdfOutput> {
        const academicPeriod = deriveAcademicPeriod(input.course.date);
        const filename = buildReportPdfFilename(input.course.courseName, academicPeriod);
        const buffer = await renderReportPdfDocument(this.sections, input);

        return { buffer, filename };
    }
}

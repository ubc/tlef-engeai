/**
 * full-report-pdf-builder.ts
 * @description Full PDF — prototype pages plus per-student struggle appendix (students only).
 */

import type { IReportPdfBuilder, IReportSection, IStackedBarChartRenderer } from '../interfaces';
import { deriveAcademicPeriod } from '../report-academic-period';
import { buildReportPdfFilename } from '../report-filename';
import { renderReportPdfDocument } from '../report-pdf-render';
import { StudentAppendixSection } from '../sections/student-appendix-section';
import { selectStudentsForAppendix } from '../student-appendix-select';
import type { ReportBuildInput, ReportPdfOutput } from '../types';
import { PrototypeReportPdfBuilder } from './prototype-report-pdf-builder';

export class FullReportPdfBuilder implements IReportPdfBuilder {
    private readonly prototypeSections: IReportSection[];

    constructor(chartRenderer?: IStackedBarChartRenderer) {
        this.prototypeSections = new PrototypeReportPdfBuilder(chartRenderer).getSections();
    }

    async build(input: ReportBuildInput): Promise<ReportPdfOutput> {
        const academicPeriod = deriveAcademicPeriod(input.course.date);
        const filename = buildReportPdfFilename(input.course.courseName, academicPeriod);
        const sections = [...this.prototypeSections];
        if (selectStudentsForAppendix(input.stats.users).length > 0) {
            sections.push(new StudentAppendixSection());
        }
        const buffer = await renderReportPdfDocument(sections, input);

        return { buffer, filename };
    }
}

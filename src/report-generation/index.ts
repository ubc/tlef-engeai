/**
 * index.ts
 * @author: @gatahcha
 * @date: 2026-06-15
 * @description: Public barrel exports for struggle-topic PDF report generation.
 */

export { ReportDocumentService, buildReportPdf, parseReportPdfPhase } from './report-document';
export { ReportDataService, buildStudentAppendixPdfRows } from './report-data';
export { ChartJsStackedBarRenderer } from './report-chart';
export { contentDispositionAttachmentPdf } from './report-contracts';
export type {
    ReportPdfOutput,
    ReportPdfPhase,
    ReportBuildInput,
    IStackedBarChartRenderer,
    IReportDataService,
    IReportSection
} from './report-contracts';

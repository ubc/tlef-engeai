/**
 * index.ts
 * @author: @gatahcha
 * @contributor: @rdschrs - Added Writing Feedback PDF report exports.
 * @date: 2026-06-15
 * @description: Public barrel exports for application PDF report generation.
 */

export { ReportDocumentService, buildReportPdf, parseReportPdfPhase } from './report-document';
export { ReportDataService, buildStudentAppendixPdfRows } from './report-data';
export { ChartJsStackedBarRenderer } from './report-chart';
export { StudentWritingFeedbackPdfService } from './writing-feedback-report';
export { layoutVerifiedText, highlightRectsForSpan } from './writing-feedback-layout';
export { contentDispositionAttachmentPdf, deriveAcademicPeriod, academicPeriodFromDocument } from './report-contracts';
export type {
    AnnotatedLayoutLine,
    AnnotatedLayoutOptions,
    HighlightRect,
    MeasureFn
} from './writing-feedback-layout';
export type {
    ReportPdfOutput,
    ReportPdfPhase,
    ReportBuildInput,
    IStackedBarChartRenderer,
    IReportDataService,
    IReportSection
} from './report-contracts';

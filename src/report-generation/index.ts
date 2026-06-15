/**
 * index.ts
 * @description Public exports for struggle-topic PDF report generation (D3+).
 */

export { buildReportPdf, parseReportPdfPhase } from './report-pdf-orchestrator';
export { deriveAcademicPeriod, formatReportGeneratedAt } from './report-academic-period';
export { buildReportPdfFilename, contentDispositionAttachmentPdf } from './report-filename';
export type {
    AcademicPeriod,
    ReportBuildInput,
    ReportPdfOutput,
    ReportPdfPhase,
    ReportRenderContext
} from './types';
export type { IReportPdfBuilder, IReportSection, IStackedBarChartRenderer } from './interfaces';

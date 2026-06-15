/**
 * interfaces.ts
 * @description Contracts for composable PDF report sections and builders (D3 prototype, D4 full).
 */

import type { CourseSummaryStackedBar } from '../types/shared';
import type { ReportBuildInput, ReportPdfOutput, ReportRenderContext } from './types';

/** Renders one logical section (usually one page) onto the shared PDF document. */
export interface IReportSection {
    render(context: ReportRenderContext): Promise<void>;
}

/** Builds a complete PDF from aggregated report inputs. */
export interface IReportPdfBuilder {
    build(input: ReportBuildInput): Promise<ReportPdfOutput>;
}

/** Server-side stacked bar chart renderer (Chart.js canvas or test mock). */
export interface IStackedBarChartRenderer {
    render(stackedBar: CourseSummaryStackedBar): Promise<Buffer>;
}

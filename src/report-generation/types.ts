/**
 * types.ts
 * @description Domain types for struggle-topic PDF report generation (D3+).
 */

import type PDFDocument from 'pdfkit';
import type { activeCourse, CourseSummaryStruggleTopics, StruggleStatsResult } from '../types/shared';

/** UBC-style academic period derived from course start date. */
export interface AcademicPeriod {
    /** e.g. "2025-2026" */
    academicYear: string;
    /** e.g. "Winter-T1", "Winter-T2", "Summer" */
    termLabel: string;
    /** Human-readable line for title page, e.g. "Winter Term 1, 2025–2026" */
    displayLabel: string;
}

export type ReportPdfPhase = 'prototype' | 'full';

/** Inputs assembled by the Mongo delegate before PDF build. */
export interface ReportBuildInput {
    course: activeCourse;
    stats: StruggleStatsResult;
    generatedAt: Date;
    phase: ReportPdfPhase;
}

/** Mutable PDFKit document context passed to each section renderer. */
export interface ReportRenderContext {
    doc: InstanceType<typeof PDFDocument>;
    input: ReportBuildInput;
    academicPeriod: AcademicPeriod;
}

/** Result of a successful PDF build. */
export interface ReportPdfOutput {
    buffer: Buffer;
    filename: string;
}

/** Convenience alias for struggle chart + legend on distribution page. */
export type ReportStruggleTopics = CourseSummaryStruggleTopics;

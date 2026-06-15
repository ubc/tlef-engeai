/**
 * report-contracts.ts
 * @author: @gatahcha
 * @date: 2026-06-15
 * @description: Types, interfaces, brand constants, academic period, and filename helpers for PDF reports.
 */

import type PDFDocument from 'pdfkit';
import type {
    CourseSummaryStackedBar,
    MonitorStruggleUserRow,
    StruggleStatsLegendItem
} from '../types/shared';
import type { activeCourse, StruggleStatsResult } from '../types/shared';
import { sanitizeZipPathSegment } from '../helpers/conversation-export-path';

/** UBC-style academic period derived from course start date. */
export interface AcademicPeriod {
    /** e.g. "2025-2026" */
    academicYear: string;
    /** e.g. "Winter-T1", "Winter-T2", "Summer" */
    termLabel: string;
    /** Human-readable line for title page, e.g. "Winter Term 1, 2025–2026" */
    displayLabel: string;
}

/** Report phase: prototype (3 pages) or full (+ student appendix when rows exist). */
export type ReportPdfPhase = 'prototype' | 'full';

/** Struggle topics grouped by course chapter for appendix column 2. */
export interface StudentAppendixChapterGroup {
    chapterNum: number | undefined;
    topics: string[];
}

/** One row in the per-student PDF appendix table (count-free struggle labels). */
export interface StudentAppendixPdfRow {
    userName: string;
    chapterGroups: StudentAppendixChapterGroup[];
}

/** Inputs assembled by the Mongo delegate before PDF build. */
export interface ReportBuildInput {
    course: activeCourse;
    stats: StruggleStatsResult;
    generatedAt: Date;
    phase: ReportPdfPhase;
    /** Pre-built appendix rows; full report only. */
    studentAppendix?: StudentAppendixPdfRow[];
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

/** One PDF page or logical section; implemented by section classes in report-document.ts. */
export interface IReportSection {
    /**
     * Draws this section onto the shared PDF document.
     *
     * @param context - Mutable PDFKit doc, build input, and derived academic period
     */
    render(context: ReportRenderContext): Promise<void>;
}

/**
 * @deprecated Use IReportSection classes instead.
 */
export type SectionRenderer = (context: ReportRenderContext) => Promise<void>;

/** Server-side stacked bar chart renderer (Chart.js canvas or test mock). */
export interface IStackedBarChartRenderer {
    /**
     * Renders course struggle stacked-bar stats to a PNG buffer.
     *
     * @param stackedBar - Course-wide struggle distribution payload
     * @returns PNG image buffer for PDF embed
     */
    render(stackedBar: CourseSummaryStackedBar): Promise<Buffer>;
}

/**
 * Port for appendix row shaping and PDF legend/chapter formatting.
 * Implemented by {@link ReportDataService} in report-data.ts.
 */
export interface IReportDataService {
    /** @see ReportDataService.buildChapterNumberByTopicOrWeekId */
    buildChapterNumberByTopicOrWeekId(stackedBar: CourseSummaryStackedBar): Map<string, number>;

    /** @see ReportDataService.buildLabelChapterNumberMap */
    buildLabelChapterNumberMap(stackedBar: CourseSummaryStackedBar): Map<string, number>;

    /** @see ReportDataService.filterPdfLegendItems */
    filterPdfLegendItems(legend: StruggleStatsLegendItem[]): StruggleStatsLegendItem[];

    /** @see ReportDataService.formatPdfStruggleLine */
    formatPdfStruggleLine(
        topic: string,
        studentCount: number,
        chapterNum: number | undefined
    ): string;

    /** @see ReportDataService.formatChapterTopicsList */
    formatChapterTopicsList(topics: string[]): string;
    
    /** @see ReportDataService.formatPdfStudentStruggleLine */
    formatPdfStudentStruggleLine(topic: string, chapterNum: number | undefined): string;

    /** @see ReportDataService.selectAllStudentsForAppendix */
    selectAllStudentsForAppendix(users: MonitorStruggleUserRow[]): MonitorStruggleUserRow[];

    /** @see ReportDataService.buildStudentAppendixPdfRows */
    buildStudentAppendixPdfRows(
        users: MonitorStruggleUserRow[],
        stackedBar: CourseSummaryStackedBar
    ): StudentAppendixPdfRow[];
    
}

/** CHBE green — title page background. */
export const PDF_CHBE_GREEN = '#4d7a2f';

/** Title page text on green background. */
export const PDF_TITLE_TEXT = '#ffffff';

/** Zebra stripe — odd rows (white). */
export const PDF_ZEBRA_STRIPE_A = '#ffffff';

/** Zebra stripe — even rows (subtle green-tinted gray). */
export const PDF_ZEBRA_STRIPE_B = '#f0f4ec';

/** Appendix table body text. */
export const PDF_TABLE_TEXT = '#333333';

/**
 * Maps a course start date to academic year + term buckets:
 * Sep–Dec → Winter T1, Jan–Apr → Winter T2, May–Aug → Summer.
 *
 * @param courseDate - Course start date as Date or ISO-parseable string
 * @returns Academic year, term label, and title-page display label
 */
export function deriveAcademicPeriod(courseDate: Date | string): AcademicPeriod {
    const date = courseDate instanceof Date ? courseDate : new Date(courseDate);
    const month = date.getMonth() + 1; // 1–12
    const year = date.getFullYear();

    let academicYear: string;
    let termLabel: string;
    let displayLabel: string;

    if (month >= 9) {
        academicYear = `${year}-${year + 1}`;
        termLabel = 'Winter-T1';
        displayLabel = `Winter Term 1, ${year}–${year + 1}`;
    } else if (month >= 5) {
        academicYear = `${year - 1}-${year}`;
        termLabel = 'Summer';
        displayLabel = `Summer, ${year - 1}–${year}`;
    } else {
        academicYear = `${year - 1}-${year}`;
        termLabel = 'Winter-T2';
        displayLabel = `Winter Term 2, ${year - 1}–${year}`;
    }

    return { academicYear, termLabel, displayLabel };
}

/**
 * ISO-style local date/time for title page footer.
 *
 * @param generatedAt - Timestamp when the PDF was built
 * @returns Locale-formatted date/time string (en-CA)
 */
export function formatReportGeneratedAt(generatedAt: Date): string {
    return generatedAt.toLocaleString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });
}

/**
 * Builds attachment basename: EngE-AI-{courseName}-{academicYear}-{term}-report.pdf
 *
 * @param courseName - Raw course name (sanitized for filesystem safety)
 * @param period - Academic period from {@link deriveAcademicPeriod}
 * @returns Safe PDF filename without path
 */
export function buildReportPdfFilename(courseName: string, period: AcademicPeriod): string {
    const safeCourse = sanitizeZipPathSegment(courseName);
    return `EngE-AI-${safeCourse}-${period.academicYear}-${period.termLabel}-report.pdf`;
}

/**
 * RFC 5987-friendly Content-Disposition for PDF downloads (ASCII fallback + UTF-8 filename*).
 *
 * @param filename - UTF-8 attachment basename
 * @returns `Content-Disposition` header value for `attachment`
 */
export function contentDispositionAttachmentPdf(filename: string): string {
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'report.pdf';
    const encoded = encodeURIComponent(filename).replace(/'/g, '%27');
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

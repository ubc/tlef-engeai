/**
 * report-filename.ts
 * @description PDF download filename and Content-Disposition for struggle-topic reports.
 */

import { sanitizeZipPathSegment } from '../helpers/conversation-export-path';
import type { AcademicPeriod } from './types';

/**
 * Builds attachment basename: EngE-AI-{courseName}-{academicYear}-{term}-report.pdf
 */
export function buildReportPdfFilename(courseName: string, period: AcademicPeriod): string {
    const safeCourse = sanitizeZipPathSegment(courseName);
    return `EngE-AI-${safeCourse}-${period.academicYear}-${period.termLabel}-report.pdf`;
}

/**
 * RFC 5987-friendly Content-Disposition for PDF downloads (ASCII fallback + UTF-8 filename*).
 */
export function contentDispositionAttachmentPdf(filename: string): string {
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'report.pdf';
    const encoded = encodeURIComponent(filename).replace(/'/g, '%27');
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

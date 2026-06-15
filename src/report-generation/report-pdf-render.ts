/**
 * report-pdf-render.ts
 * @description Shared PDFKit document render loop for report builders.
 */

import PDFDocument from 'pdfkit';
import type { IReportSection } from './interfaces';
import { deriveAcademicPeriod } from './report-academic-period';
import type { ReportBuildInput, ReportRenderContext } from './types';

/** Renders ordered sections into a single PDF buffer. */
export function renderReportPdfDocument(
    sections: IReportSection[],
    input: ReportBuildInput
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 54, autoFirstPage: true });
        const academicPeriod = deriveAcademicPeriod(input.course.date);
        const context: ReportRenderContext = { doc, input, academicPeriod };
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        void (async () => {
            try {
                for (let i = 0; i < sections.length; i += 1) {
                    if (i > 0) {
                        doc.addPage();
                    }
                    await sections[i].render(context);
                }
                doc.end();
            } catch (err) {
                reject(err);
            }
        })();
    });
}

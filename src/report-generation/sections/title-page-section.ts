/**
 * title-page-section.ts
 * @description PDF page 1 — course title, academic period, generation timestamp.
 */

import type { IReportSection } from '../interfaces';
import { formatReportGeneratedAt } from '../report-academic-period';
import type { ReportRenderContext } from '../types';

export class TitlePageSection implements IReportSection {
    async render(context: ReportRenderContext): Promise<void> {
        const { doc, input, academicPeriod } = context;
        const { course, generatedAt } = input;
        const pageWidth = doc.page.width;
        const margin = doc.page.margins.left;

        doc.font('Helvetica-Bold').fontSize(28);
        doc.text(course.courseName, margin, 200, {
            width: pageWidth - margin * 2,
            align: 'center'
        });

        doc.moveDown(2);
        doc.font('Helvetica').fontSize(16);
        doc.text('EngE-AI Struggle Topic Report', {
            width: pageWidth - margin * 2,
            align: 'center'
        });

        doc.moveDown(1.5);
        doc.fontSize(14);
        doc.text(academicPeriod.displayLabel, {
            width: pageWidth - margin * 2,
            align: 'center'
        });

        doc.moveDown(3);
        doc.fontSize(11).fillColor('#555555');
        doc.text(`Generated: ${formatReportGeneratedAt(generatedAt)}`, {
            width: pageWidth - margin * 2,
            align: 'center'
        });

        doc.fillColor('#000000');
    }
}

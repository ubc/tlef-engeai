/**
 * outline-page-section.ts
 * @description PDF page 2 — report outline; phase-aware section availability notes.
 */

import type { IReportSection } from '../interfaces';
import type { ReportRenderContext } from '../types';

const OUTLINE_ITEMS: Array<{ title: string; description: string; fullReportOnly?: boolean }> = [
    {
        title: 'Executive summary',
        description: 'Course-wide struggle topic distribution and key statistics.'
    },
    {
        title: 'Chapter breakdown',
        description: 'Per-chapter charts and student rosters by struggle label.',
        fullReportOnly: true
    },
    {
        title: 'Per-student appendix',
        description: 'Individual struggle topic profiles grouped by course chapter (students only).',
        fullReportOnly: true
    }
];

export class OutlinePageSection implements IReportSection {
    async render(context: ReportRenderContext): Promise<void> {
        const { doc, input } = context;
        const isFullReport = input.phase === 'full';
        const margin = doc.page.margins.left;
        const contentWidth = doc.page.width - margin * 2;

        doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000');
        doc.text('Report Outline', margin, doc.page.margins.top);

        doc.moveDown(1.5);
        doc.font('Helvetica').fontSize(12);

        OUTLINE_ITEMS.forEach((item, index) => {
            const includedInFull = item.fullReportOnly && isFullReport;
            const pendingFull = item.fullReportOnly && !isFullReport;
            const suffix = includedInFull
                ? ' (included)'
                : pendingFull
                  ? ' (included in full report)'
                  : '';
            doc.font('Helvetica-Bold').text(`${index + 1}. ${item.title}${suffix}`, {
                width: contentWidth,
                continued: false
            });
            doc.font('Helvetica').fillColor('#444444');
            doc.text(item.description, {
                width: contentWidth,
                indent: 16
            });
            doc.fillColor('#000000');
            doc.moveDown(0.8);
        });

        doc.moveDown(1);
        doc.fontSize(10).fillColor('#666666');
        if (isFullReport) {
            doc.text(
                'This report includes the executive summary and per-student appendix. ' +
                    'Chapter breakdown sections follow in a future release.',
                { width: contentWidth }
            );
        } else {
            doc.text(
                'This prototype includes the executive summary (course-wide distribution chart). ' +
                    'Chapter breakdown and per-student appendix follow in the full report.',
                { width: contentWidth }
            );
        }
        doc.fillColor('#000000');
    }
}

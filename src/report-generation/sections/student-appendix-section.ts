/**
 * student-appendix-section.ts
 * @description Per-student appendix — one student per page start, chapter-grouped labels.
 */

import type { IReportSection } from '../interfaces';
import {
    buildChapterNumberByTopicOrWeekId,
    formatPdfStruggleLine
} from '../pdf-legend-format';
import { ensureVerticalSpace, startStudentPage } from '../pdf-layout-helpers';
import { selectStudentsForAppendix } from '../student-appendix-select';
import type { ReportRenderContext } from '../types';
import type { MonitorStruggleUserRow } from '../../types/shared';

const SECTION_TITLE = 'Per-Student Struggle Topics';
const LABEL_FONT_SIZE = 10;
const LABEL_ROW_HEIGHT = 14;

export class StudentAppendixSection implements IReportSection {
    async render(context: ReportRenderContext): Promise<void> {
        const students = selectStudentsForAppendix(context.input.stats.users);
        if (!students.length) {
            return;
        }

        students.forEach((student, index) => {
            startStudentPage(context.doc, index === 0);
            this.renderStudentPage(context, student);
        });
    }

    private renderStudentPage(context: ReportRenderContext, student: MonitorStruggleUserRow): void {
        const { doc } = context;
        const margin = doc.page.margins.left;
        const contentWidth = doc.page.width - margin * 2;

        doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000');
        doc.text(SECTION_TITLE, margin, doc.page.margins.top, { width: contentWidth });
        doc.moveDown(0.8);

        doc.font('Helvetica-Bold').fontSize(18);
        doc.text(student.userName, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.4);

        doc.font('Helvetica').fontSize(10).fillColor('#555555');
        doc.text('Role: Student', margin, doc.y, { width: contentWidth });
        doc.moveDown(1);
        doc.fillColor('#000000');

        const chapterNumById = buildChapterNumberByTopicOrWeekId(
            context.input.stats.struggleTopics.stackedBar
        );
        const courseWideCountByLabel = new Map(
            context.input.stats.struggleTopics.legend
                .filter((item) => item.studentCount > 0)
                .map((item) => [item.topic, item.studentCount])
        );

        for (const chapter of student.struggleTopicsByChapter) {
            const chapterNum = chapterNumById.get(chapter.topicOrWeekId);
            for (const label of chapter.struggleTopics) {
                const studentCount = courseWideCountByLabel.get(label);
                if (studentCount === undefined || studentCount <= 0) {
                    continue;
                }
                ensureVerticalSpace(doc, LABEL_ROW_HEIGHT);
                doc.font('Helvetica').fontSize(LABEL_FONT_SIZE).fillColor('#333333');
                doc.text(
                    formatPdfStruggleLine(label, studentCount, chapterNum),
                    margin,
                    doc.y,
                    { width: contentWidth }
                );
            }
        }

        doc.fillColor('#000000');
    }
}

/**
 * report-pdf-mongo.ts
 * @description Loads course + struggle stats and delegates PDF assembly to report-generation module.
 */

import {
    buildReportPdf,
    buildStudentAppendixPdfRows,
    parseReportPdfPhase,
    type ReportPdfOutput,
    type ReportPdfPhase
} from '../../report-generation';
import type { activeCourse } from '../../types/shared';
import { getActiveCourse } from './course-mongo';
import type { MongoDalContext } from './mongo-context';
import { getCourseStruggleStats } from './struggle-stats-mongo';

/**
 * Builds struggle-topic PDF for a course using shared D2 stats aggregation.
 *
 * @throws When the course is not found.
 */
export async function buildCourseReportPdf(
    ctx: MongoDalContext,
    courseId: string,
    phaseRaw?: string
): Promise<ReportPdfOutput> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error('Course not found');
    }

    const courseData = course as activeCourse;
    const phase: ReportPdfPhase = parseReportPdfPhase(phaseRaw);
    const stats = await getCourseStruggleStats(ctx, courseId);
    const studentAppendix = buildStudentAppendixPdfRows(
        stats.users,
        stats.struggleTopics.stackedBar
    );

    return buildReportPdf({
        course: courseData,
        stats,
        generatedAt: new Date(),
        phase,
        studentAppendix
    });
}

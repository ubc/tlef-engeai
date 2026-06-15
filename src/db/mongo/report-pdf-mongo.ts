/**
 * report-pdf-mongo.ts
 * @description Loads course + struggle stats and delegates PDF assembly to report-generation module.
 */

import { buildReportPdf, parseReportPdfPhase } from '../../report-generation';
import type { ReportPdfOutput, ReportPdfPhase } from '../../report-generation/types';
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

    return buildReportPdf({
        course: courseData,
        stats,
        generatedAt: new Date(),
        phase
    });
}

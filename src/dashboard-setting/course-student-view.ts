/**
 * course-student-view.ts
 *
 * Role-projected course payloads for non-staff clients. Omits Extra Feature and
 * LLM settings so students cannot read instructor capability / model config from
 * DevTools on course GET.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-06
 * @version: 1.1.0
 * @description: Student-safe activeCourse projection and capability helpers.
 */

import type { activeCourse, GlobalUser } from '../types/shared';
import { isCourseStaff } from '../utils/course-staff';
import { isCourseFeatureEnabled } from './course-features';

/** Student-safe Extra Feature flags (booleans only; no staff-only capabilities). */
export interface StudentCourseCapabilities {
    scenarioGeneration: boolean;
}

/**
 * toStudentCoursePayload - strip staff-only Extra Feature and LLM settings.
 *
 * Does not mutate the input. Staff callers should return the full course instead.
 *
 * @param course - Full active course document
 * @returns Shallow copy without `features` or `llmSettings`
 */
export function toStudentCoursePayload(course: activeCourse): activeCourse {
    const { features: _features, llmSettings: _llmSettings, ...rest } = course;
    return { ...rest };
}

/**
 * coursePayloadForViewer - full course for course staff; student projection otherwise.
 *
 * @param course - Full active course document
 * @param globalUser - Authenticated global user, or null/undefined when unknown
 * @returns Course payload safe for the viewer
 */
export function coursePayloadForViewer(
    course: activeCourse,
    globalUser: GlobalUser | null | undefined
): activeCourse {
    return isCourseStaff(course, globalUser) ? course : toStudentCoursePayload(course);
}

/**
 * getStudentCapabilities - booleans students may need for shell UI (on demand).
 *
 * Never includes guidedPathway, writingFeedback, provenance, or llmSettings.
 *
 * @param course - Full active course document
 * @returns Student-safe capability flags
 */
export function getStudentCapabilities(course: activeCourse): StudentCourseCapabilities {
    return {
        scenarioGeneration: isCourseFeatureEnabled(course, 'scenarioGeneration'),
    };
}

/**
 * Student course payload projection tests.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-06
 * @version: 1.0.0
 * @description: Ensures Extra Features and llmSettings are omitted for non-staff viewers.
 */

import {
    coursePayloadForViewer,
    getStudentCapabilities,
    toStudentCoursePayload,
} from '../course-student-view';
import type { activeCourse, GlobalUser } from '../../types/shared';

function baseCourse(overrides: Partial<activeCourse> = {}): activeCourse {
    return {
        id: 'course-1',
        courseName: 'Test Course',
        features: {
            writingFeedback: { enabled: true, enabledBy: 'staff-1' },
            memoryAgent: { enabled: true },
            guidedPathway: { enabled: true },
            scenarioGeneration: { enabled: false },
        },
        llmSettings: {
            chat: { modelId: 'gpt-5.6-luna', reasoningLevel: 'none' },
            scenarioGeneration: { modelId: 'gpt-5.6-luna', reasoningLevel: 'none' },
            writingFeedback: { modelId: 'gpt-5.6-luna', reasoningLevel: 'none' },
            guidedPathway: { modelId: 'gpt-5.6-luna', reasoningLevel: 'none' },
            memoryAgent: { modelId: 'gpt-5.6-luna', reasoningLevel: 'none' },
        },
        ...overrides,
    } as activeCourse;
}

describe('toStudentCoursePayload', () => {
    it('omits features and llmSettings without mutating input', () => {
        const course = baseCourse();
        const projected = toStudentCoursePayload(course);

        expect(projected.features).toBeUndefined();
        expect(projected.llmSettings).toBeUndefined();
        expect(projected.id).toBe('course-1');
        expect(course.features?.guidedPathway?.enabled).toBe(true);
        expect(course.llmSettings?.chat.modelId).toBe('gpt-5.6-luna');
    });
});

describe('coursePayloadForViewer', () => {
    it('returns full course for faculty instructor on the roster', () => {
        const course = baseCourse({
            instructors: [{ userId: 'inst-1', name: 'Instructor' }],
        });
        const globalUser = {
            userId: 'inst-1',
            affiliation: 'faculty',
            puid: 'p1',
        } as GlobalUser;

        const payload = coursePayloadForViewer(course, globalUser);
        expect(payload.features?.guidedPathway?.enabled).toBe(true);
        expect(payload.llmSettings).toBeDefined();
        expect(payload).toBe(course);
    });

    it('projects for students and missing users', () => {
        const course = baseCourse({
            instructors: [{ userId: 'inst-1', name: 'Instructor' }],
        });
        const student = {
            userId: 'stu-1',
            affiliation: 'student',
            puid: 'p2',
        } as GlobalUser;

        expect(coursePayloadForViewer(course, student).features).toBeUndefined();
        expect(coursePayloadForViewer(course, null).llmSettings).toBeUndefined();
        expect(coursePayloadForViewer(course, undefined).features).toBeUndefined();
    });
});

describe('getStudentCapabilities', () => {
    it('returns only scenarioGeneration boolean from course features', () => {
        expect(getStudentCapabilities(baseCourse())).toEqual({ scenarioGeneration: false });
        expect(
            getStudentCapabilities(
                baseCourse({
                    features: {
                        scenarioGeneration: { enabled: true },
                    },
                })
            )
        ).toEqual({ scenarioGeneration: true });
    });
});

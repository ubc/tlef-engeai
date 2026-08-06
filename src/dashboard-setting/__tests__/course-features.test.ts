/**
 * Course feature capability tests — defaults, normalize, backfill, and audit metadata.
 *
 * @author: @rdschrs
 * @date: 2026-07-12
 * @version: 1.2.0
 * @description: Regression coverage for Extra Feature policy helpers.
 */

import {
    COURSE_FEATURE_DEFINITIONS,
    COURSE_FEATURE_LABELS,
    buildNewCourseFeatures,
    isCourseFeatureEnabled,
    normalizeCourseFeaturesInput,
    updateCourseCapability,
    type CourseFeatureId,
} from '../course-features';

describe('course Extra Feature capabilities', () => {
    it('treats legacy courses without feature configuration as disabled', () => {
        expect(isCourseFeatureEnabled({ features: undefined }, 'writingFeedback')).toBe(false);
        expect(isCourseFeatureEnabled({ features: undefined }, 'memoryAgent')).toBe(false);
        expect(isCourseFeatureEnabled({ features: undefined }, 'guidedPathway')).toBe(false);
        expect(isCourseFeatureEnabled({ features: undefined }, 'scenarioGeneration')).toBe(false);
    });

    it('enables writing feedback with an auditable actor and timestamp', () => {
        const now = new Date('2026-07-12T00:00:00.000Z');
        expect(updateCourseCapability(undefined, 'writingFeedback', true, 'staff-1', now)).toEqual({
            writingFeedback: { enabled: true, enabledAt: now, enabledBy: 'staff-1' },
        });
    });

    it('disables without deleting prior capability audit data', () => {
        const enabledAt = new Date('2026-01-01T00:00:00.000Z');
        const result = updateCourseCapability(
            { writingFeedback: { enabled: true, enabledAt, enabledBy: 'faculty-1' } },
            'writingFeedback',
            false,
            'faculty-1'
        );
        expect(result.writingFeedback).toEqual({
            enabled: false,
            enabledAt,
            enabledBy: 'faculty-1',
        });
    });

    it('updates scenarioGeneration without clearing writingFeedback', () => {
        const now = new Date('2026-08-06T00:00:00.000Z');
        const result = updateCourseCapability(
            { writingFeedback: { enabled: true, enabledAt: now, enabledBy: 'staff-1' } },
            'scenarioGeneration',
            true,
            'staff-2',
            now
        );
        expect(result.writingFeedback?.enabled).toBe(true);
        expect(result.scenarioGeneration).toEqual({
            enabled: true,
            enabledAt: now,
            enabledBy: 'staff-2',
        });
    });

    it('buildNewCourseFeatures includes every registry key as disabled', () => {
        const features = buildNewCourseFeatures();
        for (const def of COURSE_FEATURE_DEFINITIONS) {
            expect(features[def.id]).toEqual({ enabled: false });
        }
        expect(Object.keys(features).sort()).toEqual(
            COURSE_FEATURE_DEFINITIONS.map((d) => d.id).slice().sort()
        );
    });

    it('normalizeCourseFeaturesInput enables only requested trues and fills the rest', () => {
        const now = new Date('2026-08-06T12:00:00.000Z');
        const features = normalizeCourseFeaturesInput(
            {
                memoryAgent: { enabled: true },
                writingFeedback: { enabled: false },
            },
            'creator-1',
            now
        );

        expect(features.memoryAgent).toEqual({
            enabled: true,
            enabledAt: now,
            enabledBy: 'creator-1',
        });
        expect(features.writingFeedback).toEqual({ enabled: false });
        expect(features.guidedPathway).toEqual({ enabled: false });
        expect(features.scenarioGeneration).toEqual({ enabled: false });
    });

    it('COURSE_FEATURE_LABELS covers every CourseFeatureId from the registry', () => {
        for (const def of COURSE_FEATURE_DEFINITIONS) {
            const id: CourseFeatureId = def.id;
            expect(COURSE_FEATURE_LABELS[id]).toBe(def.label);
        }
        expect(Object.keys(COURSE_FEATURE_LABELS).sort()).toEqual(
            COURSE_FEATURE_DEFINITIONS.map((d) => d.id).slice().sort()
        );
    });
});

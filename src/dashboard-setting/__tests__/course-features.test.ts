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
    it('treats missing feature configuration as the registry default', () => {
        expect(isCourseFeatureEnabled({ features: undefined }, 'writingFeedback')).toBe(true);
        expect(isCourseFeatureEnabled({ features: undefined }, 'memoryAgent')).toBe(true);
        expect(isCourseFeatureEnabled({ features: undefined }, 'guidedPathway')).toBe(true);
        expect(isCourseFeatureEnabled({ features: undefined }, 'scenarioGeneration')).toBe(true);
    });

    it('honours explicit opt-outs over the registry default', () => {
        expect(
            isCourseFeatureEnabled({ features: { writingFeedback: { enabled: false } } }, 'writingFeedback')
        ).toBe(false);
        expect(
            isCourseFeatureEnabled({ features: { memoryAgent: { enabled: false } } }, 'memoryAgent')
        ).toBe(false);
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

    it('buildNewCourseFeatures includes every registry key as enabled', () => {
        const features = buildNewCourseFeatures();
        for (const def of COURSE_FEATURE_DEFINITIONS) {
            expect(features[def.id]).toEqual({ enabled: true });
        }
        expect(Object.keys(features).sort()).toEqual(
            COURSE_FEATURE_DEFINITIONS.map((d) => d.id).slice().sort()
        );
    });

    it('normalizeCourseFeaturesInput honours explicit values and defaults the rest on', () => {
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
        // Explicitly unchecked stays off.
        expect(features.writingFeedback).toEqual({ enabled: false });
        // Omitted keys now inherit the registry default rather than staying off.
        expect(features.guidedPathway).toEqual({
            enabled: true,
            enabledAt: now,
            enabledBy: 'creator-1',
        });
        expect(features.scenarioGeneration).toEqual({
            enabled: true,
            enabledAt: now,
            enabledBy: 'creator-1',
        });
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

describe('new-course capability policy', () => {
    it('enables every capability on a brand-new course', () => {
        const features = buildNewCourseFeatures();
        for (const def of COURSE_FEATURE_DEFINITIONS) {
            expect(features[def.id]?.enabled).toBe(true);
        }
    });

    it('inherits the default when the request body omits a capability', () => {
        // The old implementation read `input?.[id]?.enabled === true`, which
        // re-derived every key from the body and never consulted the registry,
        // so the default was inert for create and course-setup alike.
        const features = normalizeCourseFeaturesInput(undefined, 'user-1');
        for (const def of COURSE_FEATURE_DEFINITIONS) {
            expect(features[def.id]?.enabled).toBe(def.defaultEnabledForNewCourse);
        }
    });

    it('still disables a capability the instructor explicitly unchecked', () => {
        const features = normalizeCourseFeaturesInput(
            { writingFeedback: { enabled: false } } as any,
            'user-1'
        );
        expect(features.writingFeedback?.enabled).toBe(false);
        expect(features.memoryAgent?.enabled).toBe(true);
    });

    it('records provenance for a capability enabled by default', () => {
        const now = new Date('2026-08-31T00:00:00.000Z');
        const features = normalizeCourseFeaturesInput(undefined, 'user-1', now);
        expect(features.writingFeedback?.enabledBy).toBe('user-1');
        expect(features.writingFeedback?.enabledAt).toEqual(now);
    });
});

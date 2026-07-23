/**
 * Course feature capability tests — legacy defaults and audit metadata
 *
 * Verifies that optional course capabilities fail closed for legacy records and
 * retain the original enablement audit trail when staff later disable a feature.
 *
 * @author: @rdschrs
 * @date: 2026-07-12
 * @version: 1.0.0
 * @description: Regression coverage for Writing Feedback course capability state.
 */

import { isCourseFeatureEnabled, updateWritingFeedbackCapability } from '../course-features';

describe('writing feedback course capability', () => {
    it('treats legacy courses without feature configuration as disabled', () => {
        expect(isCourseFeatureEnabled({ features: undefined }, 'writingFeedback')).toBe(false);
    });

    it('enables writing feedback with an auditable actor and timestamp', () => {
        const now = new Date('2026-07-12T00:00:00.000Z');
        expect(updateWritingFeedbackCapability(undefined, true, 'staff-1', now)).toEqual({
            writingFeedback: { enabled: true, enabledAt: now, enabledBy: 'staff-1' }
        });
    });

    it('disables without deleting prior capability audit data', () => {
        const enabledAt = new Date('2026-01-01T00:00:00.000Z');
        const result = updateWritingFeedbackCapability(
            { writingFeedback: { enabled: true, enabledAt, enabledBy: 'faculty-1' } },
            false,
            'faculty-1'
        );
        expect(result.writingFeedback).toEqual({ enabled: false, enabledAt, enabledBy: 'faculty-1' });
    });
});

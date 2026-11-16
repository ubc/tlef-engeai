/**
 * @fileoverview Pins the per-assignment analysis mode: an assignment's stored choice, SFL for
 * one created before the choice existed, general for a new one, and the generation-time
 * profile gate applied only in SFL mode.
 */

import { analysisModeOf, draftForValidation, isAnalysisMode, requireAnalysisProfile } from '../analysis-mode';
import { buildDefaultSflContextProfile, buildDefaultWritingAssignment } from '../../rubric/default-rubric-profile';

describe('analysisModeOf', () => {
    it('returns the mode staff chose', () => {
        expect(analysisModeOf({ analysisMode: 'general' })).toBe('general');
        expect(analysisModeOf({ analysisMode: 'sfl' })).toBe('sfl');
    });

    it('keeps the SFL analysis for an assignment created before the choice existed', () => {
        expect(analysisModeOf({})).toBe('sfl');
        expect(analysisModeOf(undefined)).toBe('sfl');
    });

    it('starts a new assignment in general', () => {
        expect(analysisModeOf(buildDefaultWritingAssignment('course-1', 'a1', 'Essay'))).toBe('general');
    });
});

describe('isAnalysisMode', () => {
    it('accepts only the two modes', () => {
        expect(isAnalysisMode('general')).toBe(true);
        expect(isAnalysisMode('sfl')).toBe(true);
        expect(isAnalysisMode('lab_report')).toBe(false);
        expect(isAnalysisMode(undefined)).toBe(false);
    });
});

describe('requireAnalysisProfile', () => {
    it('ignores a missing profile in general mode', () => {
        expect(() => requireAnalysisProfile(undefined, 'general')).not.toThrow();
    });

    it('keeps the SFL profile gate in sfl mode', () => {
        expect(() => requireAnalysisProfile(undefined, 'sfl'))
            .toThrow('Complete "Describe the writing" before approving the writing rubric');
    });
});

describe('draftForValidation', () => {
    it('leaves the profile out, without changing the draft', () => {
        const draft = { title: 'Essay', sflContext: buildDefaultSflContextProfile() };
        expect(draftForValidation(draft).sflContext).toBeUndefined();
        expect(draft.sflContext).toBeDefined();
    });
});

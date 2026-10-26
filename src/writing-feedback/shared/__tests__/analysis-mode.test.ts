/**
 * @fileoverview Pins the global analysis-mode switch: general by default, SFL only on the
 * exact opt-in value, and the SFL profile gate applied only in SFL mode.
 */

import { carriedSflProfile, getAnalysisMode, requireAnalysisProfile } from '../analysis-mode';
import { buildDefaultSflContextProfile } from '../../rubric/default-rubric-profile';

describe('getAnalysisMode', () => {
    it('defaults to general when the variable is unset', () => {
        expect(getAnalysisMode({})).toBe('general');
    });

    it('returns sfl only for the sfl value, ignoring case and spaces', () => {
        expect(getAnalysisMode({ WRITING_FEEDBACK_ANALYSIS_MODE: 'sfl' })).toBe('sfl');
        expect(getAnalysisMode({ WRITING_FEEDBACK_ANALYSIS_MODE: ' SFL ' })).toBe('sfl');
    });

    it('falls back to general for any other value', () => {
        expect(getAnalysisMode({ WRITING_FEEDBACK_ANALYSIS_MODE: 'general' })).toBe('general');
        expect(getAnalysisMode({ WRITING_FEEDBACK_ANALYSIS_MODE: 'slf' })).toBe('general');
    });
});

describe('requireAnalysisProfile', () => {
    it('ignores a missing profile in general mode', () => {
        expect(() => requireAnalysisProfile(undefined, 'general')).not.toThrow();
    });

    it('keeps the SFL profile gate in sfl mode', () => {
        expect(() => requireAnalysisProfile(undefined, 'sfl'))
            .toThrow('Complete the genre and register profile before approving the writing rubric');
    });
});

describe('carriedSflProfile', () => {
    it('keeps a blank default profile as stored, unvalidated, so it cannot block a general save', () => {
        const blank = buildDefaultSflContextProfile();
        expect(carriedSflProfile(blank)).toEqual(blank);
    });

    it('drops the glossary, which now lives in the rubric course terms', () => {
        const profile = { ...buildDefaultSflContextProfile(), approvedGlossaryTerms: ['hypothesis'] };
        expect(carriedSflProfile(profile)).not.toHaveProperty('approvedGlossaryTerms');
    });

    it('returns nothing when there is no stored profile', () => {
        expect(carriedSflProfile(undefined)).toBeUndefined();
    });
});

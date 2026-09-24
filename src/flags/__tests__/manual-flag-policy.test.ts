import {
    isManualFlagType,
    MANUAL_FLAG_TYPES,
    validateManualFlagStatusTransition
} from '../manual-flag-policy';

describe('manual flag policy', () => {
    it('recognizes every inherited manual flag category', () => {
        for (const flagType of MANUAL_FLAG_TYPES) {
            expect(isManualFlagType(flagType)).toBe(true);
        }
        expect(isManualFlagType('guided-pathway')).toBe(false);
        expect(isManualFlagType(null)).toBe(false);
    });

    it('allows unresolved to resolved', () => {
        expect(validateManualFlagStatusTransition('unresolved', 'resolved')).toEqual({ isValid: true });
    });

    it('allows resolved to unresolved', () => {
        expect(validateManualFlagStatusTransition('resolved', 'unresolved')).toEqual({ isValid: true });
    });

    it('rejects same-status transitions', () => {
        expect(validateManualFlagStatusTransition('unresolved', 'unresolved').isValid).toBe(false);
    });

    it('rejects unknown statuses', () => {
        expect(validateManualFlagStatusTransition('unresolved', 'pending').isValid).toBe(false);
    });
});

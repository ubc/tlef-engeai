import { validateStatusTransition } from '../flag-mongo';

describe('flag-mongo validateStatusTransition', () => {
    it('allows unresolved → resolved', () => {
        expect(validateStatusTransition('unresolved', 'resolved')).toEqual({ isValid: true });
    });

    it('allows resolved → unresolved', () => {
        expect(validateStatusTransition('resolved', 'unresolved')).toEqual({ isValid: true });
    });

    it('rejects unresolved → unresolved', () => {
        expect(validateStatusTransition('unresolved', 'unresolved').isValid).toBe(false);
    });

    it('rejects invalid new status', () => {
        expect(validateStatusTransition('unresolved', 'pending').isValid).toBe(false);
    });
});

import { resolveAffiliation } from '../affiliation';

describe('resolveAffiliation', () => {
    it('new user (no DB record) uses CWL affiliation as-is', () => {
        const result = resolveAffiliation('staff', undefined);
        expect(result).toEqual({ affiliation: 'staff', needsDbUpdate: false });
    });

    it('existing user with matching DB/CWL affiliation needs no update', () => {
        const result = resolveAffiliation('faculty', 'faculty');
        expect(result).toEqual({ affiliation: 'faculty', needsDbUpdate: false });
    });

    it('existing user with DB/CWL mismatch uses CWL and flags DB update', () => {
        const result = resolveAffiliation('student', 'faculty');
        expect(result).toEqual({ affiliation: 'student', needsDbUpdate: true });
    });

    it('never special-cases any affiliation value — admin status is granted via isAdminUser, not by forcing faculty', () => {
        // A platform admin whose real CWL affiliation is 'staff' resolves to 'staff', not 'faculty'.
        const result = resolveAffiliation('staff', 'staff');
        expect(result.affiliation).toBe('staff');
    });
});

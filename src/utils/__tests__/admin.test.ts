import { isAdminUser } from '../admin';
import type { GlobalUser } from '../../types/shared';

describe('admin utils', () => {
    it('isAdminUser is true only when isAdmin is true', () => {
        const admin: GlobalUser = {
            name: 'A',
            puid: 'p1',
            userId: 'u1',
            coursesEnrolled: [],
            affiliation: 'faculty',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            isAdmin: true
        };
        const faculty: GlobalUser = { ...admin, isAdmin: false };
        expect(isAdminUser(admin)).toBe(true);
        expect(isAdminUser(faculty)).toBe(false);
        expect(isAdminUser(null)).toBe(false);
    });
});

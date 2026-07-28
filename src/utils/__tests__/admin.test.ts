import { isAdminName, isAdminUser } from '../admin';
import type { GlobalUser } from '../../types/shared';

describe('admin utils', () => {
    const originalAdmins = process.env.ADMINS;

    afterEach(() => {
        if (originalAdmins === undefined) {
            delete process.env.ADMINS;
        } else {
            process.env.ADMINS = originalAdmins;
        }
    });

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
        const missingFlag: GlobalUser = { ...admin };
        delete missingFlag.isAdmin;
        expect(isAdminUser(admin)).toBe(true);
        expect(isAdminUser(faculty)).toBe(false);
        expect(isAdminUser(missingFlag)).toBe(false);
        expect(isAdminUser(null)).toBe(false);
    });

    it('isAdminName matches names in ADMINS allowlist', () => {
        process.env.ADMINS = 'Kathleen Tom,Example Admin';
        expect(isAdminName('Kathleen Tom')).toBe(true);
        expect(isAdminName('Example Admin')).toBe(true);
        expect(isAdminName('Someone Else')).toBe(false);
        expect(isAdminName('')).toBe(false);
        expect(isAdminName(undefined)).toBe(false);
    });

    it('isAdminName trims ADMINS entries and supports fuzzy match', () => {
        process.env.ADMINS = ' Kathleen Tom , Example Admin ';
        expect(isAdminName('Kathleen M Tom')).toBe(true);
    });

    it('isAdminName returns false when ADMINS is unset', () => {
        delete process.env.ADMINS;
        expect(isAdminName('Kathleen Tom')).toBe(false);
    });
});

import { getAdminSeedPuids, isAdminUser } from '../admin';
import type { GlobalUser } from '../../types/shared';

describe('admin utils', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('getAdminSeedPuids returns configured PUIDs', () => {
        process.env.CHARISMA_RUSDIYANTO_PUID = 'puid-charisma';
        process.env.RICHARD_TAPE_PUID = 'puid-richard';
        expect(getAdminSeedPuids()).toEqual(['puid-charisma', 'puid-richard']);
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
        expect(isAdminUser(admin)).toBe(true);
        expect(isAdminUser(faculty)).toBe(false);
        expect(isAdminUser(null)).toBe(false);
    });
});

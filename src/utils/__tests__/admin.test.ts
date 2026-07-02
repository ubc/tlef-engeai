import {
    ensurePlatformAdminGlobalUser,
    getPlatformAdminPuids,
    isAdminUser,
    isPlatformAdminPuid
} from '../admin';
import type { GlobalUser } from '../../types/shared';

describe('admin utils', () => {
    const originalCharisma = process.env.CHARISMA_RUSDIYANTO_PUID;
    const originalRichard = process.env.RICHARD_TAPE_PUID;

    afterEach(() => {
        if (originalCharisma === undefined) {
            delete process.env.CHARISMA_RUSDIYANTO_PUID;
        } else {
            process.env.CHARISMA_RUSDIYANTO_PUID = originalCharisma;
        }
        if (originalRichard === undefined) {
            delete process.env.RICHARD_TAPE_PUID;
        } else {
            process.env.RICHARD_TAPE_PUID = originalRichard;
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

    it('getPlatformAdminPuids reads env vars', () => {
        process.env.CHARISMA_RUSDIYANTO_PUID = ' 99999999 ';
        process.env.RICHARD_TAPE_PUID = '88888888';
        expect(getPlatformAdminPuids()).toEqual(['99999999', '88888888']);
    });

    it('isPlatformAdminPuid matches configured PUIDs only', () => {
        process.env.CHARISMA_RUSDIYANTO_PUID = '99999999';
        process.env.RICHARD_TAPE_PUID = '88888888';
        expect(isPlatformAdminPuid('99999999')).toBe(true);
        expect(isPlatformAdminPuid('44332211')).toBe(false);
        expect(isPlatformAdminPuid('')).toBe(false);
    });

    it('ensurePlatformAdminGlobalUser promotes env PUID when isAdmin missing', async () => {
        process.env.CHARISMA_RUSDIYANTO_PUID = '99999999';
        const base: GlobalUser = {
            name: 'Charisma Rusdiyanto',
            puid: '99999999',
            userId: 'u-charisma',
            coursesEnrolled: [],
            affiliation: 'faculty',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const updated: GlobalUser = { ...base, isAdmin: true };
        const updateGlobalUser = jest.fn().mockResolvedValue(updated);
        const mongoDB = { updateGlobalUser } as never;

        const result = await ensurePlatformAdminGlobalUser(mongoDB, base, '99999999');

        expect(updateGlobalUser).toHaveBeenCalledWith('99999999', { isAdmin: true });
        expect(result.isAdmin).toBe(true);
    });

    it('ensurePlatformAdminGlobalUser is no-op for non-admin PUID', async () => {
        process.env.CHARISMA_RUSDIYANTO_PUID = '99999999';
        const user: GlobalUser = {
            name: 'Student',
            puid: '44332211',
            userId: 'u-stu',
            coursesEnrolled: [],
            affiliation: 'student',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const updateGlobalUser = jest.fn();
        const mongoDB = { updateGlobalUser } as never;

        const result = await ensurePlatformAdminGlobalUser(mongoDB, user, '44332211');

        expect(updateGlobalUser).not.toHaveBeenCalled();
        expect(result).toBe(user);
    });

    it('ensurePlatformAdminGlobalUser is no-op when already admin', async () => {
        process.env.CHARISMA_RUSDIYANTO_PUID = '99999999';
        const user: GlobalUser = {
            name: 'Charisma Rusdiyanto',
            puid: '99999999',
            userId: 'u-charisma',
            coursesEnrolled: [],
            affiliation: 'faculty',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            isAdmin: true
        };
        const updateGlobalUser = jest.fn();
        const mongoDB = { updateGlobalUser } as never;

        const result = await ensurePlatformAdminGlobalUser(mongoDB, user, '99999999');

        expect(updateGlobalUser).not.toHaveBeenCalled();
        expect(result).toBe(user);
    });
});

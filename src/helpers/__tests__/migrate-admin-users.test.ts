import { migrateAdminUsers } from '../migrate-admin-users';

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: jest.fn()
    }
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';

describe('migrateAdminUsers', () => {
    const originalEnv = process.env;
    let updateOne: jest.Mock;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            CHARISMA_RUSDIYANTO_PUID: 'puid-c',
            RICHARD_TAPE_PUID: 'puid-r'
        };
        updateOne = jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            db: {
                collection: jest.fn().mockReturnValue({ updateOne })
            }
        });
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('sets isAdmin for each seed PUID', async () => {
        await migrateAdminUsers();

        expect(updateOne).toHaveBeenCalledTimes(2);
        expect(updateOne).toHaveBeenCalledWith(
            { puid: 'puid-c' },
            expect.objectContaining({ $set: expect.objectContaining({ isAdmin: true }) })
        );
        expect(updateOne).toHaveBeenCalledWith(
            { puid: 'puid-r' },
            expect.objectContaining({ $set: expect.objectContaining({ isAdmin: true }) })
        );
    });

    it('skips when no seed PUIDs configured', async () => {
        delete process.env.CHARISMA_RUSDIYANTO_PUID;
        delete process.env.RICHARD_TAPE_PUID;

        await migrateAdminUsers();

        expect(updateOne).not.toHaveBeenCalled();
    });
});

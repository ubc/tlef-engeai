/**
 * OB-002: seeding GlobalUser.instructorOnboarding from instructorOnboardingCompleted.
 */

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: { getInstance: jest.fn() },
}));

jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { migrateInstructorOnboardingStages } from '../migrate-instructor-onboarding-stages';

type PendingUser = {
    puid: string;
    affiliation?: 'student' | 'faculty' | 'staff' | 'empty';
    instructorOnboardingCompleted?: boolean;
};

function mockInstance(pending: PendingUser[]) {
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const find = jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(pending) });
    const collection = jest.fn().mockReturnValue({ find, updateOne });

    (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({ db: { collection } });
    return { collection, find, updateOne };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('migrateInstructorOnboardingStages', () => {
    it('seeds all three stages true for an onboarded faculty user', async () => {
            const { updateOne } = mockInstance([
                { puid: 'p-veteran', affiliation: 'faculty', instructorOnboardingCompleted: true },
            ]);

            await migrateInstructorOnboardingStages();

            expect(updateOne).toHaveBeenCalledTimes(1);
            const [filter, update] = updateOne.mock.calls[0];
            expect(filter).toMatchObject({ puid: 'p-veteran', instructorOnboarding: { $exists: false } });
            expect(update.$set.instructorOnboarding).toEqual({
                contentSetup: true,
                flagSetup: true,
                monitorSetup: true,
            });
        }
    );

    // instructorOnboardingCompleted is not trustworthy on students: earlier versions of
    // OB-001 and the roster role endpoint set it on students who never saw a tutorial.
    // A student escalated to TA must be taught, so they always start incomplete.
    it.each(['student', 'staff', 'empty'] as const)(
        'seeds a %s user incomplete even when instructorOnboardingCompleted is true',
        async (affiliation) => {
            const { updateOne } = mockInstance([
                { puid: 'p-student', affiliation, instructorOnboardingCompleted: true },
            ]);

            await migrateInstructorOnboardingStages();

            expect(updateOne.mock.calls[0][1].$set.instructorOnboarding).toEqual({
                contentSetup: false,
                flagSetup: false,
                monitorSetup: false,
            });
        }
    );

    // The point of the change: a user who has never been onboarded gets taught.
    it('seeds all three stages false for a user who has never been onboarded', async () => {
        const { updateOne } = mockInstance([
            { puid: 'p-new', affiliation: 'faculty' },
            { puid: 'p-explicit-false', affiliation: 'faculty', instructorOnboardingCompleted: false },
        ]);

        await migrateInstructorOnboardingStages();

        expect(updateOne).toHaveBeenCalledTimes(2);
        for (const [, update] of updateOne.mock.calls) {
            expect(update.$set.instructorOnboarding).toEqual({
                contentSetup: false,
                flagSetup: false,
                monitorSetup: false,
            });
        }
    });

    it('only queries users that lack the field, so a rerun writes nothing', async () => {
        const { find, updateOne } = mockInstance([]);

        await migrateInstructorOnboardingStages();

        expect(find).toHaveBeenCalledWith({ instructorOnboarding: { $exists: false } });
        expect(updateOne).not.toHaveBeenCalled();
    });

    it('skips records with no puid rather than writing an unkeyed update', async () => {
        const { updateOne } = mockInstance([{ puid: '', affiliation: 'faculty', instructorOnboardingCompleted: true }]);

        await migrateInstructorOnboardingStages();

        expect(updateOne).not.toHaveBeenCalled();
    });

    it('reads and writes only the active-users collection', async () => {
        const { collection } = mockInstance([{ puid: 'p-1', affiliation: 'student' }]);

        await migrateInstructorOnboardingStages();

        for (const [name] of collection.mock.calls) {
            expect(name).toBe('active-users');
        }
    });
});

/**
 * completeInstructorOnboardingStage: dotted $set so sibling stages survive the write.
 */

import type { MongoDalContext } from '../mongo-context';

jest.mock('../mongo-collections', () => ({
    activeUsersMongoCollection: jest.fn(),
}));

import { activeUsersMongoCollection } from '../mongo-collections';
import { completeInstructorOnboardingStage, createGlobalUser } from '../global-user-mongo';

function makeCtx(): MongoDalContext {
    return { db: {}, idGenerator: {} } as unknown as MongoDalContext;
}

function mockCollection(result: unknown) {
    const findOneAndUpdate = jest.fn().mockResolvedValue(result);
    (activeUsersMongoCollection as jest.Mock).mockReturnValue({ findOneAndUpdate });
    return findOneAndUpdate;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('completeInstructorOnboardingStage', () => {
    it.each(['contentSetup', 'flagSetup', 'monitorSetup'] as const)(
        'sets only the %s path, leaving sibling stages untouched',
        async (stage) => {
            const findOneAndUpdate = mockCollection({ puid: 'p-1' });

            await completeInstructorOnboardingStage(makeCtx(), 'p-1', stage);

            const [filter, update, options] = findOneAndUpdate.mock.calls[0];
            expect(filter).toEqual({ puid: 'p-1' });
            expect(update.$set[`instructorOnboarding.${stage}`]).toBe(true);
            expect(update.$set.updatedAt).toBeInstanceOf(Date);
            // A whole-object $set would clobber the other two stages.
            expect(update.$set).not.toHaveProperty('instructorOnboarding');
            expect(Object.keys(update.$set)).toHaveLength(2);
            expect(options).toEqual({ returnDocument: 'after' });
        }
    );

    it('only ever writes true, so a stage is never un-completed', async () => {
        const findOneAndUpdate = mockCollection({ puid: 'p-1' });

        await completeInstructorOnboardingStage(makeCtx(), 'p-1', 'flagSetup');

        const [, update] = findOneAndUpdate.mock.calls[0];
        expect(update).not.toHaveProperty('$unset');
        expect(update.$set['instructorOnboarding.flagSetup']).toBe(true);
    });

    it('returns null when no user matches the puid', async () => {
        mockCollection(null);

        await expect(
            completeInstructorOnboardingStage(makeCtx(), 'p-missing', 'contentSetup')
        ).resolves.toBeNull();
    });
});

describe('createGlobalUser', () => {
    // A student promoted to TA is new to the instructor side, so nobody may start taught.
    it.each(['student', 'faculty', 'staff', 'empty'] as const)(
        'starts a new %s user owing all three instructor tutorials',
        async (affiliation) => {
            const insertOne = jest.fn().mockResolvedValue({ insertedId: 'x' });
            (activeUsersMongoCollection as jest.Mock).mockReturnValue({ insertOne });

            const user = await createGlobalUser(makeCtx(), {
                name: 'Test Person',
                puid: 'p-new',
                userId: 'u-new',
                affiliation,
            });

            expect(user.instructorOnboarding).toEqual({
                contentSetup: false,
                flagSetup: false,
                monitorSetup: false,
            });
            expect(insertOne.mock.calls[0][0].instructorOnboarding).toEqual({
                contentSetup: false,
                flagSetup: false,
                monitorSetup: false,
            });
        }
    );
});

/**
 * completeInstructorOnboardingStage: dotted $set so sibling stages survive the write.
 */

import type { MongoDalContext } from '../mongo-context';

jest.mock('../mongo-collections', () => ({
    activeUsersMongoCollection: jest.fn(),
}));

import { activeUsersMongoCollection } from '../mongo-collections';
import {
    INSTRUCTOR_ONBOARDING_TUTORIAL_STAGES,
    completeInstructorOnboardingStage,
    createGlobalUser,
    skipRemainingInstructorOnboardingStages
} from '../global-user-mongo';

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

/**
 * skipRemainingInstructorOnboardingStages: one write, six dotted paths, no course state.
 *
 * Skipping is recorded exactly like being taught, so it follows the person across
 * courses. `courseSetup` is course configuration and must never appear here.
 */
describe('skipRemainingInstructorOnboardingStages', () => {
    it('sets every tutorial stage true in one update and returns the post-image', async () => {
        const instructorOnboarding = {
            contentSetup: true,
            flagSetup: true,
            monitorSetup: true,
            scenarioGeneration: true,
            writingFeedback: true,
            guidedPathway: true
        };
        const findOneAndUpdate = mockCollection({ puid: 'p-1', instructorOnboarding });

        const result = await skipRemainingInstructorOnboardingStages(makeCtx(), 'p-1');

        expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
        const [filter, update, options] = findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ puid: 'p-1' });
        expect(Object.keys(update.$set).sort()).toEqual(
            [
                'instructorOnboarding.contentSetup',
                'instructorOnboarding.flagSetup',
                'instructorOnboarding.guidedPathway',
                'instructorOnboarding.monitorSetup',
                'instructorOnboarding.scenarioGeneration',
                'instructorOnboarding.writingFeedback',
                'updatedAt'
            ].sort()
        );
        expect(update.$set['instructorOnboarding.writingFeedback']).toBe(true);
        expect(update.$set.updatedAt).toBeInstanceOf(Date);
        // Course state stays on the course document, and a whole-object $set would clobber siblings.
        expect(update.$set['instructorOnboarding.courseSetup']).toBeUndefined();
        expect(update.$set).not.toHaveProperty('instructorOnboarding');
        expect(update).not.toHaveProperty('$unset');
        expect(options).toEqual({ returnDocument: 'after' });
        expect(result?.instructorOnboarding?.monitorSetup).toBe(true);
    });

    it('covers exactly the six per-user tutorial keys', () => {
        expect([...INSTRUCTOR_ONBOARDING_TUTORIAL_STAGES].sort()).toEqual([
            'contentSetup',
            'flagSetup',
            'guidedPathway',
            'monitorSetup',
            'scenarioGeneration',
            'writingFeedback'
        ]);
    });

    it('returns null when no user matches the puid', async () => {
        mockCollection(null);

        await expect(skipRemainingInstructorOnboardingStages(makeCtx(), 'p-missing')).resolves.toBeNull();
    });
});

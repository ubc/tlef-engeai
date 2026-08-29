/**
 * Instructor Onboarding Stages Migration (OB-002)
 *
 * Seeds `GlobalUser.instructorOnboarding` for users who predate the field.
 *
 * Instructor tutorial progress used to live on the course document
 * (`activeCourse.contentSetup` / `flagSetup` / `monitorSetup`), which meant a second
 * instructor joining an already-set-up course could never reach the tutorials. Progress
 * now lives on the user, so it follows the person across courses.
 *
 * Seed rule: a user is seeded complete only when they hold an instructor-side affiliation
 * (`faculty` or `staff`) *and* `instructorOnboardingCompleted` is true. Instructors who have
 * completed onboarding keep skipping; everyone else — including an instructor sitting on a
 * course a colleague set up — is taught.
 *
 * Students are always seeded incomplete, whatever `instructorOnboardingCompleted` says. That
 * flag is not trustworthy for them: earlier versions of OB-001 and of the roster role endpoint
 * set it on students who had never seen an instructor tutorial. More importantly, a student
 * escalated to TA is new to the instructor side and should be taught, so `false` is the only
 * correct starting point for them.
 *
 * Pre:  GlobalUser may have no `instructorOnboarding` field.
 * Post: every GlobalUser has `instructorOnboarding` with all three stages set.
 *
 * Idempotent: users that already carry the field are skipped without a write, so a
 * later CLI apply cannot overwrite progress made since the first run.
 *
 * Rollback: revert the code; the field is additive and ignored by the previous version.
 * `activeCourse.contentSetup` / `flagSetup` / `monitorSetup` are left in place (deprecated,
 * not `$unset`) so a revert restores the old behaviour without data loss.
 *
 * @author: EngE-AI Team
 * @since: 2026-08-25
 */

import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { GlobalUser, InstructorOnboardingProgress } from '../types/shared';
import { appLogger } from '../utils/logger';

/**
 * Seeds per-user instructor tutorial progress for every GlobalUser missing it.
 */
export async function migrateInstructorOnboardingStages(): Promise<void> {
    const instance = await EngEAI_MongoDB.getInstance();
    const collection = instance.db.collection('active-users');

    const pending = (await collection
        .find({ instructorOnboarding: { $exists: false } })
        .toArray()) as unknown as GlobalUser[];

    let seededCount = 0;

    for (const globalUser of pending) {
        const { puid } = globalUser;
        if (!puid) continue;

        // 'faculty' is the instructor-side affiliation; 'student', 'staff', and 'empty' start owing tutorials.
        const isInstructorAffiliation = globalUser.affiliation === 'faculty';
        const seed = isInstructorAffiliation && globalUser.instructorOnboardingCompleted === true;
        const progress: InstructorOnboardingProgress = {
            contentSetup: seed,
            flagSetup: seed,
            monitorSetup: seed
        };

        await collection.updateOne(
            { puid, instructorOnboarding: { $exists: false } },
            { $set: { instructorOnboarding: progress, updatedAt: new Date() } }
        );
        seededCount++;
    }

    appLogger.log(`[OB-002] Seeded instructorOnboarding for ${seededCount} of ${pending.length} pending users`);
}

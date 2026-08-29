/**
 * USER MANAGEMENT API
 * 
 * Handles user-related API endpoints for the new user management system
 */

import express, { Request, Response } from 'express';
import { appLogger } from '../utils/logger';
import { asyncHandlerWithAuth } from '../middleware/async-handler';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { sanitizeGlobalUserForFrontend } from '../utils/user-utils';
import { respondWithSessionIdleStatus } from '../middleware/session-activity';

const router = express.Router();

/**
 * GET /current
 * Returns current CourseUser, sanitized GlobalUser, and current course from session.
 *
 * @route GET /api/user/current
 * @returns {object} { courseUser?: object, globalUser?: object, currentCourse?: object, error?: string }
 * @response 200 - Success
 * @response 404 - No current course or user, or CourseUser not found
 * @response 500 - Failed to get current user
 */
router.get('/current', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const currentCourse = (req.session as any).currentCourse;
        const globalUser = (req.session as any).globalUser;
        
        if (!currentCourse || !globalUser) {
            return res.status(404).json({ error: 'No current course or user found' });
        }
        
        // Get CourseUser from course-specific collection using userId (not PUID)
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const courseUser = await mongoDB.findStudentByUserId(currentCourse.courseName, globalUser.userId);
        
        if (!courseUser) {
            return res.status(404).json({ error: 'CourseUser not found' });
        }
        
        // Fetch fresh GlobalUser from DB for up-to-date onboarding flags
        const freshGlobalUser = await mongoDB.findGlobalUserByUserId(globalUser.userId);
        
        // Sanitize globalUser to remove PUID before sending to frontend
        // PUID is stored in session/backend but must NEVER be exposed to frontend
        return res.json({
            courseUser,
            globalUser: sanitizeGlobalUserForFrontend(freshGlobalUser ?? globalUser),
            currentCourse
        });
        
    } catch (error) {
        appLogger.error('[USER-CURRENT] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to get current user'
        });
    }
}));

/**
 * POST /update-onboarding
 * Updates CourseUser onboarding status in the course-specific users collection.
 *
 * @route POST /api/user/update-onboarding
 * @param {string} userId - User ID (body)
 * @param {string} courseName - Course name (body)
 * @param {boolean} userOnboarding - Onboarding completion status (body)
 * @returns {object} { success: boolean, courseUser?: object, error?: string }
 * @response 200 - Success
 * @response 400 - userId and courseName required
 * @response 404 - User not found
 * @response 500 - Failed to update onboarding status
 */
router.post('/update-onboarding', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { userId, courseName, userOnboarding } = req.body;
        
        if (!userId || !courseName) {
            return res.status(400).json({
                success: false,
                error: 'userId and courseName are required'
            });
        }
        
        appLogger.log(`[UPDATE-ONBOARDING] Updating user ${userId} in course ${courseName}`);
        
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const userCollection = mongoDB.db.collection(`${courseName}_users`);
        
        const result = await userCollection.findOneAndUpdate(
            { userId: userId },
            { 
                $set: { 
                    userOnboarding: userOnboarding,
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );
        
        if (result) {
            // When student completes onboarding, set studentOnboardingCompleted on GlobalUser
            if (userOnboarding === true) {
                const globalUser = (req.session as any).globalUser;
                if (globalUser?.puid) {
                    try {
                        await mongoDB.updateGlobalUser(globalUser.puid, { studentOnboardingCompleted: true });
                        appLogger.log(`[UPDATE-ONBOARDING] Set studentOnboardingCompleted for user ${globalUser.userId}`);
                    } catch (globalUserError) {
                        appLogger.error('[UPDATE-ONBOARDING] Failed to set studentOnboardingCompleted:', globalUserError);
                        // Don't fail the request - CourseUser was updated successfully
                    }
                }
            }
            appLogger.log(`[UPDATE-ONBOARDING] ✅ Onboarding status updated`);
            return res.json({
                success: true,
                courseUser: result
            });
        } else {
            appLogger.error(`[UPDATE-ONBOARDING] ❌ User not found`);
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
    } catch (error) {
        appLogger.error('[UPDATE-ONBOARDING] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update onboarding status'
        });
    }
}));

/**
 * PATCH /onboarding/instructor-completed
 * Sets instructorOnboardingCompleted=true on GlobalUser when instructor completes monitor setup.
 *
 * @route PATCH /api/user/onboarding/instructor-completed
 * @returns {object} { success: boolean, error?: string }
 * @response 200 - Success
 * @response 401 - User not authenticated
 * @response 500 - Failed to update
 */
router.patch('/onboarding/instructor-completed', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser?.puid) {
            return res.status(401).json({ success: false, error: 'User not authenticated' });
        }

        const mongoDB = await EngEAI_MongoDB.getInstance();
        await mongoDB.updateGlobalUser(globalUser.puid, { instructorOnboardingCompleted: true });

        appLogger.log(`[INSTRUCTOR-ONBOARDING] Set instructorOnboardingCompleted for user ${globalUser.userId}`);
        return res.json({ success: true });
    } catch (error) {
        appLogger.error('[INSTRUCTOR-ONBOARDING] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update instructor onboarding status'
        });
    }
}));

/**
 * PATCH /onboarding/instructor-stage
 * Marks one instructor tutorial stage complete on the calling user's GlobalUser record.
 *
 * Tutorial progress lives on the user rather than the course so a second instructor joining
 * an already-set-up course is still taught. `courseSetup` is deliberately not accepted here:
 * it writes real course configuration and stays on the course document.
 *
 * The three feature tutorials are recorded here too. Whether one is owed is decided by
 * `resolveNextOnboardingStage`, which gates each on its course capability; this endpoint
 * only records that the caller has been taught it, so no course id is needed.
 *
 * Writes only the caller's own record, so no course-scoped RBAC applies.
 *
 * @route PATCH /api/user/onboarding/instructor-stage
 * @param {('contentSetup'|'flagSetup'|'monitorSetup'|'scenarioGeneration'|'writingFeedback'|'guidedPathway')} stage - Completed tutorial stage (body)
 * @returns {object} { success: boolean, error?: string }
 * @response 200 - Success
 * @response 400 - Invalid or missing stage
 * @response 401 - User not authenticated
 * @response 404 - GlobalUser not found
 * @response 500 - Failed to update
 */
const INSTRUCTOR_ONBOARDING_STAGES = [
    'contentSetup',
    'flagSetup',
    'monitorSetup',
    'scenarioGeneration',
    'writingFeedback',
    'guidedPathway'
] as const;
type InstructorOnboardingStage = (typeof INSTRUCTOR_ONBOARDING_STAGES)[number];

router.patch('/onboarding/instructor-stage', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser?.puid) {
            return res.status(401).json({ success: false, error: 'User not authenticated' });
        }

        const { stage } = req.body ?? {};
        if (!INSTRUCTOR_ONBOARDING_STAGES.includes(stage)) {
            return res.status(400).json({
                success: false,
                error: `stage must be one of: ${INSTRUCTOR_ONBOARDING_STAGES.join(', ')}`
            });
        }

        const mongoDB = await EngEAI_MongoDB.getInstance();
        const updated = await mongoDB.completeInstructorOnboardingStage(
            globalUser.puid,
            stage as InstructorOnboardingStage
        );

        if (!updated) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Keep the session copy in step so a later read in the same session is not stale.
        (req.session as any).globalUser = {
            ...globalUser,
            instructorOnboarding: updated.instructorOnboarding
        };

        appLogger.log(`[INSTRUCTOR-ONBOARDING] Completed stage ${stage} for user ${globalUser.userId}`);
        return res.json({ success: true });
    } catch (error) {
        appLogger.error('[INSTRUCTOR-ONBOARDING] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update instructor onboarding stage'
        });
    }
}));

/**
 * GET /activity
 * Read-only idle poll. Does not bump lastActivityAt.
 *
 * @route GET /api/user/activity
 * @returns {SessionIdleStatusResponse} { success, idle, client }
 * @response 200 - Success
 * @response 401 - INACTIVITY_EXPIRED
 */
router.get('/activity', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    respondWithSessionIdleStatus(req, res, false);
}));

/**
 * POST /activity
 * Bumps lastActivityAt when body.userActivity === true; returns idle + client directive.
 *
 * @route POST /api/user/activity
 * @param {boolean} [userActivity] - When true, records user activity on the session
 * @returns {SessionIdleStatusResponse} { success, idle, client }
 * @response 200 - Success
 * @response 401 - INACTIVITY_EXPIRED
 */
router.post('/activity', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const bump = req.body?.userActivity === true;
        respondWithSessionIdleStatus(req, res, bump);
    } catch (error) {
        appLogger.error('[USER-ACTIVITY] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update activity timestamp',
        });
    }
}));

export default router;


/**
 * USER MANAGEMENT API
 * 
 * Handles user-related API endpoints for the new user management system
 */

import express, { Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../middleware/asyncHandler';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { sanitizeGlobalUserForFrontend } from '../functions/user-utils';

const router = express.Router();

/**
 * GET /api/user/current
 * 
 * Get current CourseUser from session
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
        
        // Sanitize globalUser to remove PUID before sending to frontend
        // PUID is stored in session/backend but must NEVER be exposed to frontend
        return res.json({
            courseUser,
            globalUser: sanitizeGlobalUserForFrontend(globalUser),
            currentCourse
        });
        
    } catch (error) {
        console.error('[USER-CURRENT] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to get current user'
        });
    }
}));

/**
 * POST /api/user/update-onboarding
 * 
 * Updates CourseUser's onboarding status
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
        
        console.log(`[UPDATE-ONBOARDING] Updating user ${userId} in course ${courseName}`);
        
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
            console.log(`[UPDATE-ONBOARDING] ✅ Onboarding status updated`);
            return res.json({
                success: true,
                courseUser: result
            });
        } else {
            console.error(`[UPDATE-ONBOARDING] ❌ User not found`);
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
    } catch (error) {
        console.error('[UPDATE-ONBOARDING] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update onboarding status'
        });
    }
}));

export default router;


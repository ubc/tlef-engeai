/**
 * USER MANAGEMENT API
 * 
 * Handles user-related API endpoints for the new user management system
 */

import express, { Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../middleware/asyncHandler';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';

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
        
        // Get CourseUser from course-specific collection
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const courseUser = await mongoDB.findStudentByPUID(currentCourse.courseName, globalUser.puid);
        
        if (!courseUser) {
            return res.status(404).json({ error: 'CourseUser not found' });
        }
        
        return res.json({
            courseUser,
            globalUser,
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
        const { puid, courseName, userOnboarding } = req.body;
        
        console.log(`[UPDATE-ONBOARDING] Updating user ${puid} in course ${courseName}`);
        
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const userCollection = mongoDB.db.collection(`${courseName}_users`);
        
        const result = await userCollection.findOneAndUpdate(
            { puid: puid },
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


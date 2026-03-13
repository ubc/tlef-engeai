/**
 * USER MANAGEMENT API
 * 
 * Handles user-related API endpoints for the new user management system
 */

import express, { Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../middleware/async-handler';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { sanitizeGlobalUserForFrontend } from '../utils/user-utils';

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

/**
 * POST /activity
 * Updates server-side last activity timestamp for cross-tab synchronization. Used by InactivityTracker.
 *
 * @route POST /api/user/activity
 * @param {number} [lastActivityTime] - Client timestamp (body, optional)
 * @returns {object} { success: boolean, currentTime?: number, serverLastActivityTime?: number, lastActivityTime?: number, error?: string }
 * @response 200 - Success
 * @response 500 - Failed to update activity timestamp
 */
router.post('/activity', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { lastActivityTime } = req.body;
        const currentTime = Date.now();
        
        // Update session with last activity time
        // Use the client's lastActivityTime if provided and recent, otherwise use current server time
        let serverLastActivityTime: number;
        
        if (lastActivityTime && typeof lastActivityTime === 'number') {
            // Use client's timestamp if it's reasonable (within last 10 minutes)
            const timeDiff = Math.abs(currentTime - lastActivityTime);
            if (timeDiff < 10 * 60 * 1000) {
                serverLastActivityTime = lastActivityTime;
            } else {
                // Client timestamp seems off, use server time
                serverLastActivityTime = currentTime;
            }
        } else {
            // No client timestamp provided, use server time
            serverLastActivityTime = currentTime;
        }
        
        // Store in session for cross-tab synchronization
        (req.session as any).lastActivityTime = serverLastActivityTime;
        
        // Return current server time and last activity time for client sync
        return res.json({
            success: true,
            currentTime: currentTime,
            serverLastActivityTime: serverLastActivityTime,
            lastActivityTime: serverLastActivityTime // Alias for compatibility
        });
        
    } catch (error) {
        console.error('[USER-ACTIVITY] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update activity timestamp'
        });
    }
}));

export default router;


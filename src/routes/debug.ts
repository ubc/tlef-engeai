import { Router, Request, Response } from 'express';
import {asyncHandler} from '../middleware/asyncHandler';
import { getDummyCourses, resetDummyCourses, registerCurrentUserToCHBE241 } from '../debug/dummy-courses';

const router = Router();

// ===========================================
// DUMMY COURSES DEBUG ENDPOINTS
// ===========================================

// GET /api/debug/courses - Get dummy courses
router.get('/courses', asyncHandler(async (req: Request, res: Response) => {
    try {
        const courses = await getDummyCourses();
        
        res.status(200).json({
            success: true,
            data: courses,
            message: 'Dummy courses retrieved successfully'
        });
    } catch (error) {
        console.error('Error getting dummy courses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get dummy courses'
        });
    }
}));

// POST /api/debug/reset - Reset dummy courses
router.post('/reset', asyncHandler(async (req: Request, res: Response) => {
    try {
        const result = await resetDummyCourses();
        
        if (result.success) {
            // After successful reset, attempt to register current user to CHBE 241
            let userRegistrationMsg = '';
            const globalUser = (req.session as any).globalUser;
            
            if (globalUser) {
                try {
                    const registrationResult = await registerCurrentUserToCHBE241(globalUser);
                    if (registrationResult.success) {
                        userRegistrationMsg = ` ${registrationResult.message || 'User registered to CHBE 241'}`;
                    } else {
                        console.warn(`[DEBUG-RESET] ⚠️ User registration failed: ${registrationResult.message}`);
                        userRegistrationMsg = ` (User registration skipped: ${registrationResult.message})`;
                    }
                } catch (registrationError) {
                    console.error('[DEBUG-RESET] ⚠️ Error during user registration:', registrationError);
                    userRegistrationMsg = ' (User registration failed - see server logs)';
                    // Continue - don't fail the reset operation
                }
            } else {
                console.log('[DEBUG-RESET] ℹ️ No user in session, skipping user registration');
            }
            
            if (result.skipped) {
                res.status(200).json({
                    success: true,
                    skipped: true,
                    message: (result.message || 'Reset skipped - collection already exists with data') + userRegistrationMsg
                });
            } else {
                res.status(200).json({
                    success: true,
                    skipped: false,
                    message: (result.message || 'Dummy courses reset successfully') + userRegistrationMsg
                });
            }
        } else {
            res.status(500).json({
                success: false,
                error: result.message || 'Failed to reset dummy courses'
            });
        }
    } catch (error) {
        console.error('Error resetting dummy courses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset dummy courses'
        });
    }
}));

export default router;

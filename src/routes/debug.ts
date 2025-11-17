import { Router, Request, Response } from 'express';
import {asyncHandler} from '../middleware/asyncHandler';
import { getDummyCourses, resetDummyCourses } from '../debug/dummy-courses';

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
            if (result.skipped) {
                res.status(200).json({
                    success: true,
                    skipped: true,
                    message: result.message || 'Reset skipped - collection already exists with data'
                });
            } else {
                res.status(200).json({
                    success: true,
                    skipped: false,
                    message: result.message || 'Dummy courses reset successfully'
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

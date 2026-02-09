import { Router, Request, Response } from 'express';
import {asyncHandler} from '../middleware/asyncHandler';
import { getDummyCourses, registerCurrentUserToCHBE241 } from '../debug/dummy-courses';
// COMMENTED OUT: resetDummyCourses has been replaced with per-course removal
// import { resetDummyCourses } from '../debug/dummy-courses';

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

export default router;

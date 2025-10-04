import { Request, Response, NextFunction } from 'express';

// Async error handler middleware
export const asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Combined async handler with authentication requirement
export const asyncHandlerWithAuth = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // DEMO MODE: Always treat user as authenticated
        console.log('[ASYNC-AUTH] 🎭 DEMO MODE: Treating user as authenticated for route:', req.path);
        
        // Set demo user in request object for compatibility
        (req as any).user = {
            username: 'demo_instructor',
            firstName: 'Demo',
            lastName: 'Instructor',
            affiliation: 'instructor',
            puid: 'demo123',
            activeCourseName: 'APSC 099: Engineering for Kindergarten'
        };
        
        // Proceed with async handler
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

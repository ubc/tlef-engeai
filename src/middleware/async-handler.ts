import { Request, Response, NextFunction } from 'express';
import { appLogger } from '../utils/logger';
import { runDueScheduledPublishTasksThrottled } from '../jobs/scheduled-publish-runner';

// Async error handler middleware
export const asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Combined async handler with authentication requirement
export const asyncHandlerWithAuth = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Check authentication first
        if (!(req as any).isAuthenticated()) {
            //START DEBUG LOG : DEBUG-CODE(ASYNC-AUTH-CHECK)
            //console.log('[ASYNC-AUTH] ❌ Authentication required but user not authenticated for route:', req.path);
            //END DEBUG LOG : DEBUG-CODE(ASYNC-AUTH-CHECK)
            
            // For API routes, return JSON error
            if (req.path.startsWith('/api/')) {
                res.status(401).json({ 
                    error: 'Authentication required',
                    message: 'Please log in to access this resource'
                });
                return;
            }
            
            // For page routes, redirect to login
            res.redirect('/');
            return;
        }
        
        appLogger.log('[ASYNC-AUTH] ✅ User authenticated, proceeding with async handler for route:', req.path);

        // check for scheduled tasks
        const run = async () => {
            try {
                await runDueScheduledPublishTasksThrottled();
            } catch (e) {
                appLogger.error('[scheduled-publish] Throttled runner failed:', e);
            }
            await Promise.resolve(fn(req, res, next));
        };
        run().catch(next);
    };
};

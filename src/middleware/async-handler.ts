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
        // Check authentication first
        if (!(req as any).isAuthenticated()) {
            //START DEBUG LOG : DEBUG-CODE(ASYNC-AUTH-CHECK)
            console.log('[ASYNC-AUTH] ❌ Authentication required but user not authenticated for route:', req.path);
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
        
        //START DEBUG LOG : DEBUG-CODE(ASYNC-AUTH-SUCCESS)
        console.log('[ASYNC-AUTH] ✅ User authenticated, proceeding with async handler for route:', req.path);
        //END DEBUG LOG : DEBUG-CODE(ASYNC-AUTH-SUCCESS)
        
        // User is authenticated, proceed with async handler
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

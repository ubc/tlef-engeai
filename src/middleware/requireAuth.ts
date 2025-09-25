/**
 * Authentication Middleware
 *
 * Middleware to protect routes that require authentication.
 * Redirects unauthenticated users to login page.
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to require authentication for protected routes
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    //START DEBUG LOG : DEBUG-CODE(REQUIRE-AUTH)
    console.log('[AUTH] Checking authentication for route:', req.path);
    console.log('[AUTH] User authenticated:', (req as any).isAuthenticated());
    console.log('[AUTH] User data:', (req as any).user ? 'Present' : 'Not present');
    //END DEBUG LOG : DEBUG-CODE(REQUIRE-AUTH)

    if ((req as any).isAuthenticated()) {
        // User is authenticated, proceed to next middleware/route
        return next();
    } else {
        // User is not authenticated
        //START DEBUG LOG : DEBUG-CODE(REQUIRE-AUTH-FAIL)
        console.log('[AUTH] ❌ Authentication required but user not authenticated');
        //END DEBUG LOG : DEBUG-CODE(REQUIRE-AUTH-FAIL)
        
        // For API routes, return JSON error
        if (req.path.startsWith('/api/')) {
            res.status(401).json({ 
                error: 'Authentication required',
                message: 'Please log in to access this resource'
            });
            return;
        }
        
        // For page routes, redirect to login
        res.redirect('/auth/login');
        return;
    }
};

/**
 * Middleware to require authentication for API routes only
 * Returns JSON error instead of redirecting
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const requireAuthAPI = (req: Request, res: Response, next: NextFunction): void => {
    //START DEBUG LOG : DEBUG-CODE(REQUIRE-AUTH-API)
    console.log('[AUTH-API] Checking authentication for API route:', req.path);
    //END DEBUG LOG : DEBUG-CODE(REQUIRE-AUTH-API)

    if ((req as any).isAuthenticated()) {
        return next();
    } else {
        //START DEBUG LOG : DEBUG-CODE(REQUIRE-AUTH-API-FAIL)
        console.log('[AUTH-API] ❌ API authentication required but user not authenticated');
        //END DEBUG LOG : DEBUG-CODE(REQUIRE-AUTH-API-FAIL)
        
        res.status(401).json({ 
            error: 'Authentication required',
            message: 'Please log in to access this API endpoint'
        });
        return;
    }
};

/**
 * Optional authentication middleware
 * Sets req.user but doesn't block unauthenticated users
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
    //START DEBUG LOG : DEBUG-CODE(OPTIONAL-AUTH)
    console.log('[AUTH-OPTIONAL] Checking optional authentication for route:', req.path);
    //END DEBUG LOG : DEBUG-CODE(OPTIONAL-AUTH)
    
    // Always proceed, authentication is optional
    return next();
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandlerWithAuth = exports.asyncHandler = void 0;
// Async error handler middleware
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
// Combined async handler with authentication requirement
const asyncHandlerWithAuth = (fn) => {
    return (req, res, next) => {
        // Check authentication first
        if (!req.isAuthenticated()) {
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
            res.redirect('/auth/login');
            return;
        }
        //START DEBUG LOG : DEBUG-CODE(ASYNC-AUTH-SUCCESS)
        console.log('[ASYNC-AUTH] ✅ User authenticated, proceeding with async handler for route:', req.path);
        //END DEBUG LOG : DEBUG-CODE(ASYNC-AUTH-SUCCESS)
        // User is authenticated, proceed with async handler
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandlerWithAuth = asyncHandlerWithAuth;

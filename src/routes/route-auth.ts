/**
 * Authentication Routes
 *
 * Handles both SAML and local authentication depending on SAML_AVAILABLE flag
 * - When SAML_AVAILABLE=false: Uses local username/password authentication
 * - When SAML_AVAILABLE=true: Uses SAML authentication with CWL
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 */

import express from 'express';
import path from 'path';
import { appLogger } from '../utils/logger';
import { passport, ubcShibStrategy, isSamlAvailable } from '../middleware/passport';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { sanitizeGlobalUserForFrontend } from '../utils/user-utils';
import { resolveAffiliation, isFacultyOverridePuid } from '../utils/affiliation';

const router = express.Router();

/**
 * GET /login
 * Initiates authentication. When SAML is available, redirects to IdP; otherwise serves local login page.
 *
 * @route GET /auth/login
 * @returns {void} Redirects or serves HTML
 * @response 200 - Local login page (HTML) when SAML_AVAILABLE=false
 * @response 302 - Redirect to IdP or success redirect when SAML_AVAILABLE=true
 */
router.get('/login', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (isSamlAvailable) {
        // SAML authentication flow
        appLogger.log('[AUTH] Initiating SAML authentication...');

        passport.authenticate('ubcshib', {
            failureRedirect: '/auth/login-failed',
            successRedirect: '/'
        })(req, res, next);
    } else {
        // Local authentication - serve login page
        appLogger.log('[AUTH] Serving local login page (Development Mode)');

        const loginPagePath = path.join(__dirname, '../../public/pages/local-login.html');
        res.sendFile(loginPagePath);
    }
});

// SAML callback handler (shared between both callback routes)
const samlCallbackHandler = [
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
        appLogger.log('[AUTH] SAML callback received at:', req.path);

        passport.authenticate('ubcshib', {
            failureRedirect: '/auth/login-failed',
            failureFlash: false
        })(req, res, next);
    },
    async (req: express.Request, res: express.Response) => {
    try {
        // Extract user data from SAML profile
        const puid = (req.user as any).puid;
        const firstName = (req.user as any).firstName || '';
        const lastName = (req.user as any).lastName || '';
        const name = `${firstName} ${lastName}`.trim();
        const cwlAffiliation = (req.user as any).affiliation; // From Passport (mapAffiliation)

        // Get MongoDB instance
        const mongoDB = await EngEAI_MongoDB.getInstance();

        // Check if GlobalUser exists in active-users collection
        let globalUser = await mongoDB.findGlobalUserByPUID(puid);

        // Resolve affiliation: CWL takes precedence over DB when they differ (except PUID overrides)
        const resolution = resolveAffiliation(cwlAffiliation, globalUser?.affiliation, puid);
        const affiliation = resolution.affiliation;

        if (isFacultyOverridePuid(puid) && cwlAffiliation !== affiliation) {
            appLogger.log('[AUTH] 🔄 Affiliation override: PUID', puid, 'set to faculty');
        }

        appLogger.log('[AUTH] ✅ SAML authentication successful');
        appLogger.log('[AUTH] User PUID:', puid);
        appLogger.log('[AUTH] User Name:', name);
        appLogger.log('[AUTH] Affiliation:', affiliation, '(CWL:', cwlAffiliation, ', DB:', globalUser?.affiliation ?? 'N/A', ')');

        if (!globalUser) {
            // First-time user - create GlobalUser
            appLogger.log('[AUTH] 🆕 Creating new GlobalUser');

            globalUser = await mongoDB.createGlobalUser({
                puid,
                name,
                userId: mongoDB.idGenerator.globalUserID(puid, name, affiliation),
                coursesEnrolled: [],
                affiliation: affiliation as 'student' | 'faculty' | 'staff' | 'empty',
                status: 'active'
            });

            appLogger.log('[AUTH] ✅ GlobalUser created:', globalUser.userId);
        } else {
            appLogger.log('[AUTH] ✅ GlobalUser found:', globalUser.userId);

            // Reconcile DB with CWL when DB has inconsistent data (e.g. dual student+instructor stored as faculty)
            if (resolution.needsDbUpdate && (affiliation === 'student' || affiliation === 'faculty')) {
                appLogger.log('[AUTH] 🔄 Updating GlobalUser affiliation: DB had', globalUser.affiliation, ', CWL says', affiliation);
                globalUser = await mongoDB.updateGlobalUserAffiliation(globalUser.userId, affiliation as 'student' | 'faculty');
                (req.user as any).affiliation = affiliation;
                appLogger.log('[AUTH] ✅ GlobalUser affiliation updated:', globalUser.userId);
            }
        }
        
        // Store GlobalUser in session (backend only - PUID is safe here)
        // NOTE: PUID is stored in session for backend use only
        // When sending to frontend, we MUST sanitize using sanitizeGlobalUserForFrontend()
        (req.session as any).globalUser = globalUser;

        // IMPORTANT: Save session before redirect to ensure session is persisted
        req.session.save((saveErr) => {
            if (saveErr) {
                appLogger.error('[AUTH] ❌ Session save error:', saveErr);
                return res.redirect('/');
            }

            const redirectPath = (affiliation === 'staff' || affiliation === 'empty')
                ? '/role-restricted'
                : '/course-selection';
            appLogger.log('[AUTH] 🚀 Session saved, redirecting to', redirectPath);
            appLogger.log('[AUTH] 📋 Session ID:', (req as any).sessionID);
            res.redirect(redirectPath);
        });

    } catch (error) {
        appLogger.error('[AUTH] 🚨 Error in authentication callback:', error);
        res.redirect('/');
    }
}];

/**
 * POST /saml/callback
 * Handles SAML IdP callback. Creates or updates GlobalUser, stores session, redirects to course-selection or role-restricted.
 *
 * @route POST /auth/saml/callback
 * @returns {void} Redirects on success or failure
 * @response 302 - Redirect to course-selection, role-restricted, or login-failed
 * @response 500 - Server error during callback processing
 */
router.post('/saml/callback', ...samlCallbackHandler);

/**
 * POST /login
 * Authenticates user with local username/password. Only used when SAML_AVAILABLE=false.
 *
 * @route POST /auth/login
 * @param {string} username - Username (body)
 * @param {string} password - Password (body)
 * @returns {void} Redirects on success or failure
 * @response 302 - Redirect to course-selection, role-restricted, or login with error
 * @response 404 - SAML is available; this endpoint not used
 */
router.post('/login', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!isSamlAvailable) {
        appLogger.log('[AUTH-LOCAL] 📝 Local login POST received');
        appLogger.log('[AUTH-LOCAL] Username:', req.body.username);

        // Use custom callback to handle session saving properly
        passport.authenticate('local', async (err: any, user: any, info: any) => {
            if (err) {
                appLogger.error('[AUTH-LOCAL] ❌ Authentication error:', err);
                return next(err);
            }

            if (!user) {
                appLogger.log('[AUTH-LOCAL] ❌ Authentication failed:', info?.message || 'Unknown error');
                return res.redirect('/auth/login?error=auth');
            }

            // Log the user in and WAIT for req.logIn to complete
            req.logIn(user, async (loginErr) => {
                if (loginErr) {
                    appLogger.error('[AUTH-LOCAL] ❌ Login error:', loginErr);
                    return next(loginErr);
                }

                try {
                    // Extract user data
                    const puid = user.puid;
                    const firstName = user.firstName || '';
                    const lastName = user.lastName || '';
                    const name = `${firstName} ${lastName}`.trim();
                    const cwlAffiliation = user.affiliation; // From Passport (local: FAKE_USERS)

                    // Get MongoDB instance
                    const mongoDB = await EngEAI_MongoDB.getInstance();

                    // Check if GlobalUser exists
                    let globalUser = await mongoDB.findGlobalUserByPUID(puid);

                    // Resolve affiliation: CWL/local takes precedence over DB when they differ (except PUID overrides)
                    const resolution = resolveAffiliation(cwlAffiliation, globalUser?.affiliation, puid);
                    const affiliation = resolution.affiliation;

                    if (isFacultyOverridePuid(puid) && cwlAffiliation !== affiliation) {
                        appLogger.log('[AUTH-LOCAL] 🔄 Affiliation override: PUID', puid, 'set to faculty');
                    }

                    appLogger.log('[AUTH-LOCAL] ✅ User logged in successfully');
                    appLogger.log('[AUTH-LOCAL] User PUID:', puid);
                    appLogger.log('[AUTH-LOCAL] User Name:', name);
                    appLogger.log('[AUTH-LOCAL] Affiliation:', affiliation, '(local:', cwlAffiliation, ', DB:', globalUser?.affiliation ?? 'N/A', ')');

                    if (!globalUser) {
                        appLogger.log('[AUTH-LOCAL] 🆕 Creating new GlobalUser');
                        globalUser = await mongoDB.createGlobalUser({
                            puid,
                            name,
                            userId: mongoDB.idGenerator.globalUserID(puid, name, affiliation),
                            coursesEnrolled: [],
                            affiliation: affiliation as 'student' | 'faculty' | 'staff' | 'empty',
                            status: 'active'
                        });
                        appLogger.log('[AUTH-LOCAL] ✅ GlobalUser created:', globalUser.userId);
                    } else {
                        appLogger.log('[AUTH-LOCAL] ✅ GlobalUser found:', globalUser.userId);

                        // Reconcile DB with local/CWL when DB has inconsistent data
                        if (resolution.needsDbUpdate && (affiliation === 'student' || affiliation === 'faculty')) {
                            appLogger.log('[AUTH-LOCAL] 🔄 Updating GlobalUser affiliation: DB had', globalUser.affiliation, ', local says', affiliation);
                            globalUser = await mongoDB.updateGlobalUserAffiliation(globalUser.userId, affiliation as 'student' | 'faculty');
                            (req.user as any).affiliation = affiliation;
                            appLogger.log('[AUTH-LOCAL] ✅ GlobalUser affiliation updated:', globalUser.userId);
                        }
                    }

                    // Store GlobalUser in session (backend only - PUID is safe here)
                    // NOTE: PUID is stored in session for backend use only
                    // When sending to frontend, we MUST sanitize using sanitizeGlobalUserForFrontend()
                    (req.session as any).globalUser = globalUser;

                    // CRITICAL: Save session before redirect
                    req.session.save((saveErr) => {
                        if (saveErr) {
                            appLogger.error('[AUTH-LOCAL] ❌ Session save error:', saveErr);
                            return next(saveErr);
                        }

                        const redirectPath = (affiliation === 'staff' || affiliation === 'empty')
                            ? '/role-restricted'
                            : '/course-selection';
                        appLogger.log('[AUTH-LOCAL] 🚀 Redirecting to', redirectPath);
                        res.redirect(redirectPath);
                    });
                } catch (error) {
                    appLogger.error('[AUTH-LOCAL] 🚨 Error in post-auth processing:', error);
                    res.redirect('/auth/login?error=auth');
                }
            });
        })(req, res, next);
    } else {
        // If SAML is available, this endpoint shouldn't be used
        res.status(404).send('Not Found');
    }
});

/**
 * GET /login-failed
 * Displays login failure page when SAML authentication fails.
 *
 * @route GET /auth/login-failed
 * @returns {string} HTML page with error message
 * @response 401 - Login failed page
 */
router.get('/login-failed', (req: express.Request, res: express.Response) => {
    res.status(401).send(`
        <html>
            <body>
                <h1>Login Failed</h1>
                <p>SAML authentication failed. Please check the logs for details.</p>
                <a href="/">Return to Home</a>
            </body>
        </html>
    `);
});

/**
 * GET /logout
 * Terminates session. For SAML: destroys local session and redirects to IdP logout; for local: destroys session and redirects home.
 *
 * @route GET /auth/logout
 * @returns {void} Redirects to IdP logout URL or home
 * @response 302 - Redirect to IdP or /
 */
router.get('/logout', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!(req as any).user) {
        return res.redirect('/');
    }

    if (ubcShibStrategy) {
        // SAML Single Log-Out flow
        appLogger.log('[AUTH] Initiating SAML logout...');

        ubcShibStrategy.logout(req as any, (err: any, requestUrl?: string | null) => {
            if (err) {
                appLogger.error('[AUTH] SAML logout error:', err);
                return next(err);
            }

            // 1. Terminate the local passport session
            (req as any).logout((logoutErr: any) => {
                if (logoutErr) {
                    appLogger.error('[AUTH] Passport logout error:', logoutErr);
                    return next(logoutErr);
                }
                // 2. Destroy the server-side session
                (req as any).session.destroy((sessionErr: any) => {
                    if (sessionErr) {
                        appLogger.error('[AUTH] Session destruction error:', sessionErr);
                        return next(sessionErr);
                    }
                    // 3. Redirect to the SAML IdP to terminate that session
                    if (requestUrl) {
                        res.redirect(requestUrl);
                    } else {
                        res.redirect('/');
                    }
                });
            });
        });
    } else {
        // Local authentication logout - simple session destruction
        appLogger.log('[AUTH-LOCAL] 🚪 Logging out local user...');

        (req as any).logout((logoutErr: any) => {
            if (logoutErr) {
                appLogger.error('[AUTH-LOCAL] ❌ Logout error:', logoutErr);
                return next(logoutErr);
            }

            (req as any).session.destroy((sessionErr: any) => {
                if (sessionErr) {
                    appLogger.error('[AUTH-LOCAL] ❌ Session destruction error:', sessionErr);
                    return next(sessionErr);
                }

                appLogger.log('[AUTH-LOCAL] ✅ Logout successful');
                res.redirect('/');
            });
        });
    }
});

/**
 * GET /logout/callback
 * Handles SAML IdP redirect after logout. Completes logout flow and redirects to home.
 *
 * @route GET /auth/logout/callback
 * @returns {void} Redirects to home
 * @response 302 - Redirect to /
 */
router.get('/logout/callback',
    passport.authenticate('ubcshib', { failureRedirect: '/' }),
    (req: express.Request, res: express.Response) => {
        // Successful logout callback - redirect to home page
        res.redirect('/');
    }
);

/**
 * GET /current-user
 * Returns authenticated user info from session and database. Sanitizes GlobalUser (no PUID) for frontend.
 *
 * @route GET /auth/current-user
 * @returns {object} { authenticated: boolean, user?: object, globalUser?: object, error?: string }
 * @response 200 - Success (authenticated true/false)
 * @response 403 - User data validation failed
 * @response 404 - User not found in database
 * @response 500 - Session incomplete or failed to fetch user
 */
router.get('/current-user', async (req: express.Request, res: express.Response) => {
    appLogger.log('[SERVER] 🔍 /auth/current-user endpoint called');
    appLogger.log('[SERVER] 📊 Request details:', {
        isAuthenticated: (req as any).isAuthenticated(),
        hasUser: !!(req as any).user,
        hasGlobalUser: !!(req.session as any).globalUser,
        sessionID: (req as any).sessionID,
        userAgent: req.get('User-Agent')
    });

    if ((req as any).isAuthenticated()) {
        try {
            // Get userId from session (stored during login) - frontend never has PUID
            const sessionGlobalUser = (req.session as any).globalUser;
            const userId = sessionGlobalUser?.userId;

            if (!userId) {
                appLogger.error('[SERVER] ❌ No userId found in session');
                return res.status(500).json({ authenticated: false, error: 'User session incomplete - please log in again' });
            }

            // Query MongoDB to get GlobalUser from active-users collection using userId
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const globalUser = await mongoDB.findGlobalUserByUserId(userId);

            if (!globalUser) {
                appLogger.error('[SERVER] ❌ GlobalUser not found in database');
                return res.status(404).json({ authenticated: false, error: 'User not found in database' });
            }

            // Validate that session data matches the database record
            const sessionUser = (req as any).user;
            const validationErrors: string[] = [];
            const criticalErrors: string[] = [];

            // Validate userId (required - this is what we used for lookup)
            if (globalUser.userId !== userId) {
                criticalErrors.push(`userId mismatch: session=${userId}, database=${globalUser.userId}`);
            }

            // Validate affiliation (log but don't fail - database is source of truth)
            // Bypass for faculty override PUIDs (from env: RICHARD_TAPE_PUID, CHARISMA_RUSDIYANTO_PUID)
            if (sessionUser.affiliation !== globalUser.affiliation && !isFacultyOverridePuid(globalUser.puid)) {
                validationErrors.push(`Affiliation mismatch: session=${sessionUser.affiliation}, database=${globalUser.affiliation}`);
                appLogger.warn('[SERVER] ⚠️ Affiliation mismatch detected, using database value as source of truth');
            }

            if (criticalErrors.length > 0) {
                appLogger.error('[SERVER] ❌ Critical user validation failed:', criticalErrors);
                return res.status(403).json({
                    authenticated: false,
                    error: 'User data validation failed',
                    details: criticalErrors
                });
            }

            // Log validation warnings but don't fail
            if (validationErrors.length > 0) {
                appLogger.warn('[SERVER] ⚠️ User validation warnings:', validationErrors);
            }

            // Build userData from database (source of truth)
            const userData = {
                name: globalUser.name, // From database
                affiliation: globalUser.affiliation, // From database
                userId: globalUser.userId // From database - this is the key field
            };

            appLogger.log('[SERVER] ✅ User is authenticated');
            appLogger.log('[SERVER] 👤 User data from database:', userData);
            appLogger.log('[SERVER] 🌍 GlobalUser from database:', {
                userId: globalUser.userId,
                name: globalUser.name,
                affiliation: globalUser.affiliation,
                status: globalUser.status,
                coursesEnrolled: globalUser.coursesEnrolled.length
            });

            res.json({
                authenticated: true,
                user: userData,
                globalUser: sanitizeGlobalUserForFrontend(globalUser)
            });
        } catch (error) {
            appLogger.error('[SERVER] 🚨 Error fetching user from database:', error);
            res.status(500).json({ 
                authenticated: false, 
                error: 'Failed to fetch user data from database' 
            });
        }
    } else {
        appLogger.log('[SERVER] ❌ User is not authenticated');
        res.json({ authenticated: false });
    }
});

/**
 * GET /me
 * Legacy endpoint. Returns authenticated user info from session and database. Prefer /current-user.
 *
 * @route GET /auth/me
 * @returns {object} { authenticated: boolean, user?: object, globalUser?: object, error?: string }
 * @response 200 - Success (authenticated true/false)
 * @response 403 - User data validation failed
 * @response 404 - User not found in database
 * @response 500 - Session incomplete or failed to fetch user
 */
router.get('/me', async (req: express.Request, res: express.Response) => {
    appLogger.log('[SERVER] 🔍 /auth/me endpoint called');
    appLogger.log('[SERVER] 📊 Request details:', {
        isAuthenticated: (req as any).isAuthenticated(),
        hasUser: !!(req as any).user,
        sessionID: (req as any).sessionID,
        userAgent: req.get('User-Agent')
    });
    
    if ((req as any).isAuthenticated()) {
        try {
            // Get userId from session (stored during login) - frontend never has PUID
            const sessionGlobalUser = (req.session as any).globalUser;
            const userId = sessionGlobalUser?.userId;
            
            if (!userId) {
                appLogger.error('[SERVER] ❌ No userId found in session');
                return res.status(500).json({ authenticated: false, error: 'User session incomplete - please log in again' });
            }

            // Query MongoDB to get GlobalUser from active-users collection using userId
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const globalUser = await mongoDB.findGlobalUserByUserId(userId);

            if (!globalUser) {
                appLogger.error('[SERVER] ❌ GlobalUser not found in database');
                return res.status(404).json({ authenticated: false, error: 'User not found in database' });
            }

            // Validate that session data matches the database record
            const sessionUser = (req as any).user;
            const validationErrors: string[] = [];

            // Validate userId (required - this is what we used for lookup)
            if (globalUser.userId !== userId) {
                validationErrors.push(`userId mismatch: session=${userId}, database=${globalUser.userId}`);
            }

            // Validate affiliation
            // Bypass for faculty override PUIDs (from env: RICHARD_TAPE_PUID, CHARISMA_RUSDIYANTO_PUID)
            if (sessionUser.affiliation !== globalUser.affiliation && !isFacultyOverridePuid(globalUser.puid)) {
                validationErrors.push(`Affiliation mismatch: session=${sessionUser.affiliation}, database=${globalUser.affiliation}`);
            }

            if (validationErrors.length > 0) {
                appLogger.error('[SERVER] ❌ User validation failed:', validationErrors);
                return res.status(403).json({ 
                    authenticated: false, 
                    error: 'User data validation failed',
                    details: validationErrors
                });
            }

            // Build userData from database (source of truth)
            const userData = {
                name: globalUser.name, // From database
                affiliation: globalUser.affiliation, // From database
                userId: globalUser.userId // From database - this is the key field
            };

            appLogger.log('[SERVER] ✅ User is authenticated');
            appLogger.log('[SERVER] 👤 User data from database:', userData);
            appLogger.log('[SERVER] 🌍 GlobalUser from database:', {
                userId: globalUser.userId,
                name: globalUser.name,
                affiliation: globalUser.affiliation,
                status: globalUser.status,
                coursesEnrolled: globalUser.coursesEnrolled.length
            });

            res.json({
                authenticated: true,
                user: userData,
                globalUser: sanitizeGlobalUserForFrontend(globalUser)
            });
        } catch (error) {
            appLogger.error('[SERVER] 🚨 Error fetching user from database:', error);
            res.status(500).json({ 
                authenticated: false, 
                error: 'Failed to fetch user data from database' 
            });
        }
    } else {
        appLogger.log('[SERVER] ❌ User is not authenticated');
        res.json({ authenticated: false });
    }
});

/**
 * GET /config
 * Returns authentication configuration (SAML availability) for frontend.
 *
 * @route GET /auth/config
 * @returns {object} { samlAvailable: boolean }
 * @response 200 - Success
 */
router.get('/config', (req: express.Request, res: express.Response) => {
    appLogger.log('[SERVER] 🔍 /auth/config endpoint called');
    
    res.json({
        samlAvailable: isSamlAvailable
    });
});

/**
 * GET /login/cwl
 * Forces CWL/SAML login. Redirects to IdP when SAML is configured; returns 503 when not configured.
 *
 * @route GET /auth/login/cwl
 * @returns {void} Redirects to IdP or serves HTML error
 * @response 302 - Redirect to IdP or success
 * @response 503 - SAML not configured
 */
router.get('/login/cwl', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    appLogger.log('[AUTH] Initiating CWL login (forced SAML)...');
    
    if (ubcShibStrategy) {
        // SAML strategy is available - proceed with SAML authentication
        passport.authenticate('ubcshib', {
            failureRedirect: '/auth/login-failed',
            successRedirect: '/'
        })(req, res, next);
    } else {
        // SAML strategy not configured - return error
        appLogger.error('[AUTH] ❌ CWL login requested but SAML strategy is not configured');
        res.status(503).send(`
            <html>
                <body>
                    <h1>CWL Login Unavailable</h1>
                    <p>SAML authentication is not configured. Please use the regular login button.</p>
                    <a href="/">Return to Home</a>
                </body>
            </html>
        `);
    }
});

export default router;

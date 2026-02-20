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
import { passport, ubcShibStrategy, isSamlAvailable } from '../middleware/passport';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { sanitizeGlobalUserForFrontend } from '../functions/user-utils';

const router = express.Router();

// Login route - conditional based on SAML availability
router.get('/login', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (isSamlAvailable) {
        // SAML authentication flow
        //START DEBUG LOG : DEBUG-CODE(SAML-LOGIN)
        console.log('[AUTH] Initiating SAML authentication...');
        //END DEBUG LOG : DEBUG-CODE(SAML-LOGIN)

        passport.authenticate('ubcshib', {
            failureRedirect: '/auth/login-failed',
            successRedirect: '/'
        })(req, res, next);
    } else {
        // Local authentication - serve login page
        //START DEBUG LOG : DEBUG-CODE(LOCAL-LOGIN-PAGE)
        console.log('[AUTH] Serving local login page (Development Mode)');
        //END DEBUG LOG : DEBUG-CODE(LOCAL-LOGIN-PAGE)

        const loginPagePath = path.join(__dirname, '../../public/pages/local-login.html');
        res.sendFile(loginPagePath);
    }
});

// SAML callback handler (shared between both callback routes)
const samlCallbackHandler = [
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
        //START DEBUG LOG : DEBUG-CODE(SAML-CALLBACK)
        console.log('[AUTH] SAML callback received at:', req.path);
        //END DEBUG LOG : DEBUG-CODE(SAML-CALLBACK)

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
        let affiliation = (req.user as any).affiliation; // 'student' or 'faculty'

        // Special override: Always set Charisma Rusdiyanto as faculty
        if (name === 'Charisma Rusdiyanto') {
            affiliation = 'faculty';
            console.log('[AUTH] 🔄 Affiliation override: Charisma Rusdiyanto set to faculty');
        }
        
        console.log('[AUTH] ✅ SAML authentication successful');
        console.log('[AUTH] User PUID:', puid);
        console.log('[AUTH] User Name:', name);
        console.log('[AUTH] Affiliation:', affiliation);
        
        // Get MongoDB instance
                const mongoDB = await EngEAI_MongoDB.getInstance();
                
        // Check if GlobalUser exists in active-users collection
        let globalUser = await mongoDB.findGlobalUserByPUID(puid);
        
        if (!globalUser) {
            // First-time user - create GlobalUser
            console.log('[AUTH] 🆕 Creating new GlobalUser');

            globalUser = await mongoDB.createGlobalUser({
                puid,
                name,
                userId: mongoDB.idGenerator.globalUserID(puid, name, affiliation),
                coursesEnrolled: [],
                affiliation,
                status: 'active'
            });

            console.log('[AUTH] ✅ GlobalUser created:', globalUser.userId);
        } else {
            console.log('[AUTH] ✅ GlobalUser found:', globalUser.userId);

            // Check if we need to update affiliation for special users
            if (name === 'Charisma Rusdiyanto' && globalUser.affiliation !== 'faculty') {
                console.log('[AUTH] 🔄 Updating existing GlobalUser affiliation to faculty');
                globalUser = await mongoDB.updateGlobalUserAffiliation(globalUser.userId, 'faculty');

                // Update the Passport user object to match the new affiliation
                (req.user as any).affiliation = 'faculty';

                console.log('[AUTH] ✅ GlobalUser affiliation updated:', globalUser.userId);
            }
        }
        
        // Store GlobalUser in session (backend only - PUID is safe here)
        // NOTE: PUID is stored in session for backend use only
        // When sending to frontend, we MUST sanitize using sanitizeGlobalUserForFrontend()
        (req.session as any).globalUser = globalUser;

        // IMPORTANT: Save session before redirect to ensure session is persisted
        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('[AUTH] ❌ Session save error:', saveErr);
                return res.redirect('/');
            }

            // Redirect to course selection page
            console.log('[AUTH] 🚀 Session saved, redirecting to course selection');
            console.log('[AUTH] 📋 Session ID:', (req as any).sessionID);
            res.redirect('/course-selection');
        });

    } catch (error) {
        console.error('[AUTH] 🚨 Error in authentication callback:', error);
        res.redirect('/');
    }
}];

// SAML callback endpoint - legacy path for compatibility
router.post('/saml/callback', ...samlCallbackHandler);

// Local login POST endpoint (for local authentication only)
router.post('/login', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!isSamlAvailable) {
        //START DEBUG LOG : DEBUG-CODE(LOCAL-LOGIN-POST)
        console.log('[AUTH-LOCAL] 📝 Local login POST received');
        console.log('[AUTH-LOCAL] Username:', req.body.username);
        //END DEBUG LOG : DEBUG-CODE(LOCAL-LOGIN-POST)

        // Use custom callback to handle session saving properly
        passport.authenticate('local', async (err: any, user: any, info: any) => {
            if (err) {
                console.error('[AUTH-LOCAL] ❌ Authentication error:', err);
                return next(err);
            }

            if (!user) {
                console.log('[AUTH-LOCAL] ❌ Authentication failed:', info?.message || 'Unknown error');
                return res.redirect('/auth/login?error=auth');
            }

            // Log the user in and WAIT for req.logIn to complete
            req.logIn(user, async (loginErr) => {
                if (loginErr) {
                    console.error('[AUTH-LOCAL] ❌ Login error:', loginErr);
                    return next(loginErr);
                }

                try {
                    // Extract user data
                    const puid = user.puid;
                    const firstName = user.firstName || '';
                    const lastName = user.lastName || '';
                    const name = `${firstName} ${lastName}`.trim();
                    let affiliation = user.affiliation;

                    // Special override: Always set Charisma Rusdiyanto as faculty
                    if (name === 'Charisma Rusdiyanto') {
                        affiliation = 'faculty';
                        console.log('[AUTH-LOCAL] 🔄 Affiliation override: Charisma Rusdiyanto set to faculty');
                    }

                    console.log('[AUTH-LOCAL] ✅ User logged in successfully');
                    console.log('[AUTH-LOCAL] User PUID:', puid);
                    console.log('[AUTH-LOCAL] User Name:', name);
                    console.log('[AUTH-LOCAL] Affiliation:', affiliation);

                    // Get MongoDB instance
                    const mongoDB = await EngEAI_MongoDB.getInstance();

                    // Check if GlobalUser exists
                    let globalUser = await mongoDB.findGlobalUserByPUID(puid);

                    if (!globalUser) {
                        console.log('[AUTH-LOCAL] 🆕 Creating new GlobalUser');
                        globalUser = await mongoDB.createGlobalUser({
                            puid,
                            name,
                            userId: mongoDB.idGenerator.globalUserID(puid, name, affiliation),
                            coursesEnrolled: [],
                            affiliation,
                            status: 'active'
                        });
                        console.log('[AUTH-LOCAL] ✅ GlobalUser created:', globalUser.userId);
                    } else {
                        console.log('[AUTH-LOCAL] ✅ GlobalUser found:', globalUser.userId);

                        // Check if we need to update affiliation for special users
                        if (name === 'Charisma Rusdiyanto' && globalUser.affiliation !== 'faculty') {
                            console.log('[AUTH-LOCAL] 🔄 Updating existing GlobalUser affiliation to faculty');
                            globalUser = await mongoDB.updateGlobalUserAffiliation(globalUser.userId, 'faculty');

                            // Update the Passport user object to match the new affiliation
                            (req.user as any).affiliation = 'faculty';

                            console.log('[AUTH-LOCAL] ✅ GlobalUser affiliation updated:', globalUser.userId);
                        }
                    }

                    // Store GlobalUser in session (backend only - PUID is safe here)
                    // NOTE: PUID is stored in session for backend use only
                    // When sending to frontend, we MUST sanitize using sanitizeGlobalUserForFrontend()
                    (req.session as any).globalUser = globalUser;

                    // CRITICAL: Save session before redirect
                    req.session.save((saveErr) => {
                        if (saveErr) {
                            console.error('[AUTH-LOCAL] ❌ Session save error:', saveErr);
                            return next(saveErr);
                        }

                        console.log('[AUTH-LOCAL] 🚀 Redirecting to course selection');
                        res.redirect('/course-selection');
                    });
                } catch (error) {
                    console.error('[AUTH-LOCAL] 🚨 Error in post-auth processing:', error);
                    res.redirect('/auth/login?error=auth');
                }
            });
        })(req, res, next);
    } else {
        // If SAML is available, this endpoint shouldn't be used
        res.status(404).send('Not Found');
    }
});

// Login failed endpoint
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

// Logout endpoint - handles both SAML and local logout
router.get('/logout', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!(req as any).user) {
        return res.redirect('/');
    }

    if (ubcShibStrategy) {
        // SAML Single Log-Out flow
        //START DEBUG LOG : DEBUG-CODE(SAML-LOGOUT)
        console.log('[AUTH] Initiating SAML logout...');
        //END DEBUG LOG : DEBUG-CODE(SAML-LOGOUT)

        ubcShibStrategy.logout(req as any, (err: any, requestUrl?: string | null) => {
            if (err) {
                //START DEBUG LOG : DEBUG-CODE(SAML-LOGOUT-ERROR)
                console.error('[AUTH] SAML logout error:', err);
                //END DEBUG LOG : DEBUG-CODE(SAML-LOGOUT-ERROR)
                return next(err);
            }

            // 1. Terminate the local passport session
            (req as any).logout((logoutErr: any) => {
                if (logoutErr) {
                    //START DEBUG LOG : DEBUG-CODE(SAML-PASSPORT-LOGOUT-ERROR)
                    console.error('[AUTH] Passport logout error:', logoutErr);
                    //END DEBUG LOG : DEBUG-CODE(SAML-PASSPORT-LOGOUT-ERROR)
                    return next(logoutErr);
                }
                // 2. Destroy the server-side session
                (req as any).session.destroy((sessionErr: any) => {
                    if (sessionErr) {
                        //START DEBUG LOG : DEBUG-CODE(SAML-SESSION-DESTROY-ERROR)
                        console.error('[AUTH] Session destruction error:', sessionErr);
                        //END DEBUG LOG : DEBUG-CODE(SAML-SESSION-DESTROY-ERROR)
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
        //START DEBUG LOG : DEBUG-CODE(LOCAL-LOGOUT)
        console.log('[AUTH-LOCAL] 🚪 Logging out local user...');

        //END DEBUG LOG : DEBUG-CODE(LOCAL-LOGOUT)

        (req as any).logout((logoutErr: any) => {
            if (logoutErr) {
                console.error('[AUTH-LOCAL] ❌ Logout error:', logoutErr);
                return next(logoutErr);
            }

            (req as any).session.destroy((sessionErr: any) => {
                if (sessionErr) {
                    console.error('[AUTH-LOCAL] ❌ Session destruction error:', sessionErr);
                    return next(sessionErr);
                }

                console.log('[AUTH-LOCAL] ✅ Logout successful');
                res.redirect('/');
            });
        });
    }
});

// Logout callback - IdP redirects here after logout
// This endpoint handles the SAML logout response from the IdP
// Note: In the reference implementation, this is at /auth/logout, but since our routes
// are mounted at /auth, we use /logout/callback to avoid conflict with the main logout route
router.get('/logout/callback',
    passport.authenticate('ubcshib', { failureRedirect: '/' }),
    (req: express.Request, res: express.Response) => {
        // Successful logout callback - redirect to home page
        res.redirect('/');
    }
);

// Get current user info (API endpoint)
router.get('/current-user', async (req: express.Request, res: express.Response) => {
    //START DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER)
    console.log('[SERVER] 🔍 /auth/current-user endpoint called');
    console.log('[SERVER] 📊 Request details:', {
        isAuthenticated: (req as any).isAuthenticated(),
        hasUser: !!(req as any).user,
        hasGlobalUser: !!(req.session as any).globalUser,
        sessionID: (req as any).sessionID,
        userAgent: req.get('User-Agent')
    });
    //END DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER)

    if ((req as any).isAuthenticated()) {
        try {
            // Get userId from session (stored during login) - frontend never has PUID
            const sessionGlobalUser = (req.session as any).globalUser;
            const userId = sessionGlobalUser?.userId;

            if (!userId) {
                console.error('[SERVER] ❌ No userId found in session');
                return res.status(500).json({ authenticated: false, error: 'User session incomplete - please log in again' });
            }

            // Query MongoDB to get GlobalUser from active-users collection using userId
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const globalUser = await mongoDB.findGlobalUserByUserId(userId);

            if (!globalUser) {
                console.error('[SERVER] ❌ GlobalUser not found in database');
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
            // Bypass for Charisma Rusdiyanto (developer privilege)
            if (sessionUser.affiliation !== globalUser.affiliation && globalUser.name !== 'Charisma Rusdiyanto') {
                validationErrors.push(`Affiliation mismatch: session=${sessionUser.affiliation}, database=${globalUser.affiliation}`);
                console.warn('[SERVER] ⚠️ Affiliation mismatch detected, using database value as source of truth');
            }

            if (criticalErrors.length > 0) {
                console.error('[SERVER] ❌ Critical user validation failed:', criticalErrors);
                return res.status(403).json({
                    authenticated: false,
                    error: 'User data validation failed',
                    details: criticalErrors
                });
            }

            // Log validation warnings but don't fail
            if (validationErrors.length > 0) {
                console.warn('[SERVER] ⚠️ User validation warnings:', validationErrors);
            }

            // Build userData from database (source of truth)
            const userData = {
                name: globalUser.name, // From database
                affiliation: globalUser.affiliation, // From database
                userId: globalUser.userId // From database - this is the key field
            };

            //START DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER-SUCCESS)
            console.log('[SERVER] ✅ User is authenticated');
            console.log('[SERVER] 👤 User data from database:', userData);
            console.log('[SERVER] 🌍 GlobalUser from database:', {
                userId: globalUser.userId,
                name: globalUser.name,
                affiliation: globalUser.affiliation,
                status: globalUser.status,
                coursesEnrolled: globalUser.coursesEnrolled.length
            });
            //END DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER-SUCCESS)

            res.json({
                authenticated: true,
                user: userData,
                globalUser: sanitizeGlobalUserForFrontend(globalUser)
            });
        } catch (error) {
            console.error('[SERVER] 🚨 Error fetching user from database:', error);
            res.status(500).json({ 
                authenticated: false, 
                error: 'Failed to fetch user data from database' 
            });
        }
    } else {
        //START DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER-FAIL)
        console.log('[SERVER] ❌ User is not authenticated');
        //END DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER-FAIL)
        res.json({ authenticated: false });
    }
});

// Get current user info (API endpoint) - Legacy endpoint
router.get('/me', async (req: express.Request, res: express.Response) => {
    //START DEBUG LOG : DEBUG-CODE(AUTH-ME)
    console.log('[SERVER] 🔍 /auth/me endpoint called');
    console.log('[SERVER] 📊 Request details:', {
        isAuthenticated: (req as any).isAuthenticated(),
        hasUser: !!(req as any).user,
        sessionID: (req as any).sessionID,
        userAgent: req.get('User-Agent')
    });
    //END DEBUG LOG : DEBUG-CODE(AUTH-ME)
    
    if ((req as any).isAuthenticated()) {
        try {
            // Get userId from session (stored during login) - frontend never has PUID
            const sessionGlobalUser = (req.session as any).globalUser;
            const userId = sessionGlobalUser?.userId;
            
            if (!userId) {
                console.error('[SERVER] ❌ No userId found in session');
                return res.status(500).json({ authenticated: false, error: 'User session incomplete - please log in again' });
            }

            // Query MongoDB to get GlobalUser from active-users collection using userId
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const globalUser = await mongoDB.findGlobalUserByUserId(userId);

            if (!globalUser) {
                console.error('[SERVER] ❌ GlobalUser not found in database');
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
            // Bypass for Charisma Rusdiyanto (developer privilege)
            if (sessionUser.affiliation !== globalUser.affiliation && globalUser.name !== 'Charisma Rusdiyanto') {
                validationErrors.push(`Affiliation mismatch: session=${sessionUser.affiliation}, database=${globalUser.affiliation}`);
            }

            if (validationErrors.length > 0) {
                console.error('[SERVER] ❌ User validation failed:', validationErrors);
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

            //START DEBUG LOG : DEBUG-CODE(AUTH-ME-SUCCESS)
            console.log('[SERVER] ✅ User is authenticated');
            console.log('[SERVER] 👤 User data from database:', userData);
            console.log('[SERVER] 🌍 GlobalUser from database:', {
                userId: globalUser.userId,
                name: globalUser.name,
                affiliation: globalUser.affiliation,
                status: globalUser.status,
                coursesEnrolled: globalUser.coursesEnrolled.length
            });
            //END DEBUG LOG : DEBUG-CODE(AUTH-ME-SUCCESS)

            res.json({
                authenticated: true,
                user: userData,
                globalUser: sanitizeGlobalUserForFrontend(globalUser)
            });
        } catch (error) {
            console.error('[SERVER] 🚨 Error fetching user from database:', error);
            res.status(500).json({ 
                authenticated: false, 
                error: 'Failed to fetch user data from database' 
            });
        }
    } else {
        //START DEBUG LOG : DEBUG-CODE(AUTH-ME-FAIL)
        console.log('[SERVER] ❌ User is not authenticated');
        //END DEBUG LOG : DEBUG-CODE(AUTH-ME-FAIL)
        res.json({ authenticated: false });
    }
});

// Get authentication configuration (API endpoint)
router.get('/config', (req: express.Request, res: express.Response) => {
    //START DEBUG LOG : DEBUG-CODE(AUTH-CONFIG)
    console.log('[SERVER] 🔍 /auth/config endpoint called');
    //END DEBUG LOG : DEBUG-CODE(AUTH-CONFIG)
    
    res.json({
        samlAvailable: isSamlAvailable
    });
});

// CWL login route - always attempts SAML/CWL login if SAML is configured
// Works even when SAML_AVAILABLE=false, as long as SAML environment variables are present
router.get('/login/cwl', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    //START DEBUG LOG : DEBUG-CODE(CWL-LOGIN)
    console.log('[AUTH] Initiating CWL login (forced SAML)...');
    //END DEBUG LOG : DEBUG-CODE(CWL-LOGIN)
    
    if (ubcShibStrategy) {
        // SAML strategy is available - proceed with SAML authentication
        passport.authenticate('ubcshib', {
            failureRedirect: '/auth/login-failed',
            successRedirect: '/'
        })(req, res, next);
    } else {
        // SAML strategy not configured - return error
        console.error('[AUTH] ❌ CWL login requested but SAML strategy is not configured');
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

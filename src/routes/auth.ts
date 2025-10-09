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
import { passport, samlStrategy, isSamlAvailable } from '../middleware/passport';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { GlobalUser } from '../functions/types';
import { IDGenerator } from '../functions/unique-id-generator';

const router = express.Router();

// Login route - conditional based on SAML availability
router.get('/login', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (isSamlAvailable) {
        // SAML authentication flow
        //START DEBUG LOG : DEBUG-CODE(SAML-LOGIN)
        console.log('[AUTH] Initiating SAML authentication...');
        //END DEBUG LOG : DEBUG-CODE(SAML-LOGIN)

        passport.authenticate('saml', {
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

// SAML callback endpoint
router.post('/saml/callback', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    //START DEBUG LOG : DEBUG-CODE(SAML-CALLBACK)
    console.log('SAML callback received');
    //END DEBUG LOG : DEBUG-CODE(SAML-CALLBACK)
    
    passport.authenticate('saml', {
        failureRedirect: '/auth/login-failed',
        failureFlash: false
    })(req, res, next);
}, async (req: express.Request, res: express.Response) => {
    try {
        // Extract user data from SAML profile
        const puid = (req.user as any).puid;
        const firstName = (req.user as any).firstName || '';
        const lastName = (req.user as any).lastName || '';
        const name = `${firstName} ${lastName}`.trim();
        const affiliation = (req.user as any).affiliation; // 'student' or 'faculty'
        
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
                userId: parseInt(mongoDB.idGenerator.uniqueIDGenerator(`${puid}-${name}-${affiliation}-global`).substring(0, 8), 16),
                coursesEnrolled: [],
                affiliation,
                status: 'active'
            });
            
            console.log('[AUTH] ✅ GlobalUser created:', globalUser.userId);
        } else {
            console.log('[AUTH] ✅ GlobalUser found:', globalUser.userId);
        }
        
        // Store GlobalUser in session
        (req.session as any).globalUser = globalUser;
        
        // Redirect to course selection page
        console.log('[AUTH] 🚀 Redirecting to course selection');
        res.redirect('/pages/course-selection.html');
        
    } catch (error) {
        console.error('[AUTH] 🚨 Error in authentication callback:', error);
        res.redirect('/');
    }
});

// Local login POST endpoint (for local authentication only)
router.post('/login', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!isSamlAvailable) {
        //START DEBUG LOG : DEBUG-CODE(LOCAL-LOGIN-POST)
        console.log('[AUTH-LOCAL] 📝 Local login POST received');
        console.log('[AUTH-LOCAL] Username:', req.body.username);
        //END DEBUG LOG : DEBUG-CODE(LOCAL-LOGIN-POST)

        passport.authenticate('local', (err: any, user: any, info: any) => {
            if (err) {
                console.error('[AUTH-LOCAL] ❌ Authentication error:', err);
                return next(err);
            }

            if (!user) {
                //START DEBUG LOG : DEBUG-CODE(LOCAL-LOGIN-FAILED)
                console.log('[AUTH-LOCAL] ❌ Authentication failed:', info?.message || 'Unknown error');
                //END DEBUG LOG : DEBUG-CODE(LOCAL-LOGIN-FAILED)

                // Redirect back to login with error parameter
                return res.redirect('/auth/login?error=auth');
            }

            // Log the user in (establish session)
            req.logIn(user, async (loginErr) => {
                if (loginErr) {
                    console.error('[AUTH-LOCAL] ❌ Session establishment error:', loginErr);
                    return next(loginErr);
                }

                try {
                    // Extract user data
                    const puid = user.puid;
                    const firstName = user.firstName || '';
                    const lastName = user.lastName || '';
                    const name = `${firstName} ${lastName}`.trim();
                    const affiliation = user.affiliation;

                    console.log('[AUTH-LOCAL] ✅ Local authentication successful');
                    console.log('[AUTH-LOCAL] User PUID:', puid);
                    console.log('[AUTH-LOCAL] User Name:', name);
                    console.log('[AUTH-LOCAL] Affiliation:', affiliation);

                    // Get MongoDB instance
                    const mongoDB = await EngEAI_MongoDB.getInstance();

                    // Check if GlobalUser exists in active-users collection
                    let globalUser = await mongoDB.findGlobalUserByPUID(puid);

                    if (!globalUser) {
                        // First-time user - create GlobalUser
                        console.log('[AUTH-LOCAL] 🆕 Creating new GlobalUser');

                        globalUser = await mongoDB.createGlobalUser({
                            puid,
                            name,
                            userId: parseInt(mongoDB.idGenerator.uniqueIDGenerator(`${puid}-${name}-${affiliation}-global`).substring(0, 8), 16),
                            coursesEnrolled: [],
                            affiliation,
                            status: 'active'
                        });

                        console.log('[AUTH-LOCAL] ✅ GlobalUser created:', globalUser.userId);
                    } else {
                        console.log('[AUTH-LOCAL] ✅ GlobalUser found:', globalUser.userId);
                    }

                    // Store GlobalUser in session
                    (req.session as any).globalUser = globalUser;

                    // Redirect to course selection page
                    console.log('[AUTH-LOCAL] 🚀 Redirecting to course selection');
                    res.redirect('/pages/course-selection.html');

                } catch (error) {
                    console.error('[AUTH-LOCAL] 🚨 Error in authentication callback:', error);
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

    if (isSamlAvailable && samlStrategy) {
        // SAML Single Log-Out flow
        //START DEBUG LOG : DEBUG-CODE(SAML-LOGOUT)
        console.log('[AUTH] Initiating SAML logout...');
        //END DEBUG LOG : DEBUG-CODE(SAML-LOGOUT)

        samlStrategy.logout(req as any, (err: any, requestUrl?: string | null) => {
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

// The SAML IdP will redirect the user back to this URL after a successful logout.
// This endpoint can be configured in your IdP's settings and should match SAML_LOGOUT_CALLBACK_URL.
router.get('/logout/callback', (req: express.Request, res: express.Response) => {
    // The local session is already destroyed.
    // We can perform any additional cleanup here if needed.
    // For now, just redirect to the home page.
    res.redirect('/');
});

// Get current user info (API endpoint)
router.get('/current-user', (req: express.Request, res: express.Response) => {
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
        const userData = {
            username: (req as any).user.username,
            firstName: (req as any).user.firstName,
            lastName: (req as any).user.lastName,
            affiliation: (req as any).user.affiliation,
            puid: (req as any).user.puid
        };
        
        const globalUser = (req.session as any).globalUser;
        
        //START DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER-SUCCESS)
        console.log('[SERVER] ✅ User is authenticated');
        console.log('[SERVER] 👤 Sending user data to frontend:', userData);
        console.log('[SERVER] 🌍 GlobalUser:', globalUser);
        //END DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER-SUCCESS)
        
        res.json({
            authenticated: true,
            user: userData,
            globalUser: globalUser
        });
    } else {
        //START DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER-FAIL)
        console.log('[SERVER] ❌ User is not authenticated');
        //END DEBUG LOG : DEBUG-CODE(AUTH-CURRENT-USER-FAIL)
        res.json({ authenticated: false });
    }
});

// Get current user info (API endpoint) - Legacy endpoint
router.get('/me', (req: express.Request, res: express.Response) => {
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
        const userData = {
            username: (req as any).user.username,
            firstName: (req as any).user.firstName,
            lastName: (req as any).user.lastName,
            affiliation: (req as any).user.affiliation,
            puid: (req as any).user.puid
        };
        
        //START DEBUG LOG : DEBUG-CODE(AUTH-ME-SUCCESS)
        console.log('[SERVER] ✅ User is authenticated');
        console.log('[SERVER] 👤 Sending user data to frontend:', userData);
        console.log('[SERVER] 📋 Complete req.user object:', (req as any).user);
        //END DEBUG LOG : DEBUG-CODE(AUTH-ME-SUCCESS)
        
        res.json({
            authenticated: true,
            user: userData
        });
    } else {
        //START DEBUG LOG : DEBUG-CODE(AUTH-ME-FAIL)
        console.log('[SERVER] ❌ User is not authenticated');
        //END DEBUG LOG : DEBUG-CODE(AUTH-ME-FAIL)
        res.json({ authenticated: false });
    }
});

export default router;

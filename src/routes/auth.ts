/**
 * Authentication Routes
 *
 * Handles SAML login, logout, and callback routes
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 */

import express from 'express';
import { passport, samlStrategy } from '../middleware/passport';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { User } from '../functions/types';
import { IDGenerator } from '../functions/unique-id-generator';

const router = express.Router();

// Initiate SAML login
router.get('/login', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    //START DEBUG LOG : DEBUG-CODE(SAML-LOGIN)
    console.log('Initiating SAML authentication...');
    //END DEBUG LOG : DEBUG-CODE(SAML-LOGIN)
    
    passport.authenticate('saml', {
        failureRedirect: '/auth/login-failed',
        successRedirect: '/'
    })(req, res, next);
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
    //START DEBUG LOG : DEBUG-CODE(SAML-SUCCESS)
    console.log('Authentication successful for user:', (req as any).user?.username);
    console.log('User data:', (req as any).user);
    //END DEBUG LOG : DEBUG-CODE(SAML-SUCCESS)
    
    try {
        const user = (req as any).user;
        const affiliation = user?.affiliation;
        const puid = user?.puid;
        
        //START DEBUG LOG : DEBUG-CODE(STUDENT-CHECK)
        console.log(`[AUTH] 🔍 Checking user affiliation: ${affiliation}`);
        console.log(`[AUTH] 🆔 User PUID: ${puid}`);
        //END DEBUG LOG : DEBUG-CODE(STUDENT-CHECK)
        
        // Check if user is a student
        if (affiliation === 'student') {
            //START DEBUG LOG : DEBUG-CODE(STUDENT-DETECTED)
            console.log('[AUTH] 🎓 Student detected, checking APSC 099 database...');
            //END DEBUG LOG : DEBUG-CODE(STUDENT-DETECTED)
            
            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                
                // Check if student exists in APSC 099: Engineering for Kindergarten
                console.log(`[AUTH] 🔍 Looking for student with PUID: ${puid} in course: APSC 099: Engineering for Kindergarten`);
                const existingStudent = await mongoDB.findStudentByPUID('APSC 099: Engineering for Kindergarten', puid);
                
                if (existingStudent) {
                    //START DEBUG LOG : DEBUG-CODE(STUDENT-FOUND)
                    console.log('[AUTH] ✅ Existing student found, redirecting to student dashboard');
                    console.log(`[AUTH] 👤 Found student: ${existingStudent.name} (ID: ${existingStudent.userId})`);
                    //END DEBUG LOG : DEBUG-CODE(STUDENT-FOUND)
                    res.redirect('/pages/student-mode.html');
                    return;
                } else {
                    //START DEBUG LOG : DEBUG-CODE(STUDENT-NOT-FOUND)
                    console.log('[AUTH] 🆕 New student detected, creating student record...');
                    //END DEBUG LOG : DEBUG-CODE(STUDENT-NOT-FOUND)
                    
                    // Create new student record
                    const tempUserData: User = {
                        id: 'temp', // Temporary ID for generation
                        name: `${user.firstName} ${user.lastName}`,
                        puid: puid,
                        userId: 0, // Will be generated
                        activeCourseId: 'apsc-099',
                        activeCourseName: 'APSC 099: Engineering for Kindergarten',
                        userOnboarding: false, // Skip onboarding for now
                        role: 'student',
                        status: 'active',
                        chats: [],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    
                    // Generate unique userId using IDGenerator
                    const idGenerator = IDGenerator.getInstance();
                    const generatedUserId = parseInt(idGenerator.userID(tempUserData).substring(0, 8), 16);
                    
                    //START DEBUG LOG : DEBUG-CODE(USER-ID-GENERATION)
                    console.log(`[AUTH] 🆔 Generated userId: ${generatedUserId} for student: ${user.firstName} ${user.lastName}`);
                    //END DEBUG LOG : DEBUG-CODE(USER-ID-GENERATION)
                    
                    const newStudentData: Partial<User> = {
                        name: `${user.firstName} ${user.lastName}`,
                        puid: puid,
                        userId: generatedUserId,
                        activeCourseId: 'apsc-099',
                        activeCourseName: 'APSC 099: Engineering for Kindergarten',
                        userOnboarding: false, // Skip onboarding for now
                        role: 'student',
                        status: 'active',
                        chats: []
                    };
                    
                    await mongoDB.createStudent('APSC 099: Engineering for Kindergarten', newStudentData);
                    
                    //START DEBUG LOG : DEBUG-CODE(STUDENT-CREATED)
                    console.log('[AUTH] ✅ New student created, redirecting to student dashboard');
                    //END DEBUG LOG : DEBUG-CODE(STUDENT-CREATED)
                    
                    res.redirect('/pages/student-mode.html');
                    return;
                }
            } catch (error) {
                //START DEBUG LOG : DEBUG-CODE(STUDENT-DB-ERROR)
                console.error('[AUTH] 🚨 Database error for student:', error);
                //END DEBUG LOG : DEBUG-CODE(STUDENT-DB-ERROR)
                
                // On database error, redirect to index.html
                res.redirect('/');
                return;
            }
        } else {
            //START DEBUG LOG : DEBUG-CODE(NON-STUDENT)
            console.log('[AUTH] 👨‍🏫 Non-student user (instructor/other), redirecting to index');
            //END DEBUG LOG : DEBUG-CODE(NON-STUDENT)
            
            // For instructors or other users, redirect to index
            res.redirect('/');
        }
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(AUTH-ERROR)
        console.error('[AUTH] 🚨 Authentication processing error:', error);
        //END DEBUG LOG : DEBUG-CODE(AUTH-ERROR)
        
        // On any error, redirect to index.html
        res.redirect('/');
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

// Logout endpoint
router.get('/logout', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!(req as any).user) {
        return res.redirect('/');
    }

    // This is the SAML Single Log-Out flow
    samlStrategy.logout(req as any, (err: any, requestUrl?: string | null) => {
        if (err) {
            //START DEBUG LOG : DEBUG-CODE(SAML-LOGOUT-ERROR)
            console.error('SAML logout error:', err);
            //END DEBUG LOG : DEBUG-CODE(SAML-LOGOUT-ERROR)
            return next(err);
        }

        // 1. Terminate the local passport session
        (req as any).logout((logoutErr: any) => {
            if (logoutErr) {
                //START DEBUG LOG : DEBUG-CODE(SAML-PASSPORT-LOGOUT-ERROR)
                console.error('Passport logout error:', logoutErr);
                //END DEBUG LOG : DEBUG-CODE(SAML-PASSPORT-LOGOUT-ERROR)
                return next(logoutErr);
            }
            // 2. Destroy the server-side session
            (req as any).session.destroy((sessionErr: any) => {
                if (sessionErr) {
                    //START DEBUG LOG : DEBUG-CODE(SAML-SESSION-DESTROY-ERROR)
                    console.error('Session destruction error:', sessionErr);
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

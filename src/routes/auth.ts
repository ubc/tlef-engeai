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
                        name: `${user.firstName} ${user.lastName}`,
                        puid: puid,
                        userId: 0, // Will be generated
                        activeCourseId: 'apsc-099',
                        activeCourseName: 'APSC 099: Engineering for Kindergarten',
                        userOnboarding: false, // Skip onboarding for now
                        affiliation: 'student',
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
                        affiliation: 'student',
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
        } else if (affiliation === 'faculty') {
            //START DEBUG LOG : DEBUG-CODE(FACULTY-001)
            console.log('[AUTH] 👨‍🏫 Faculty detected, checking database...');
            //END DEBUG LOG : DEBUG-CODE(FACULTY-001)
            
            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                const courseName = 'APSC 099: Engineering for Kindergarten';
                
                // STEP 1: Check if instructor exists in APSC 099 collection
                //START DEBUG LOG : DEBUG-CODE(FACULTY-002)
                console.log(`[AUTH] 🔍 Step 1: Looking for faculty with PUID: ${puid} in course: ${courseName}`);
                //END DEBUG LOG : DEBUG-CODE(FACULTY-002)
                
                const existingInstructor = await mongoDB.findStudentByPUID(courseName, puid);
                
                if (existingInstructor) {
                    //START DEBUG LOG : DEBUG-CODE(FACULTY-003)
                    console.log('[AUTH] ✅ Existing faculty found!');
                    console.log(`[AUTH] 👤 Faculty Name: ${existingInstructor.name}`);
                    console.log(`[AUTH] 📊 Faculty Data:`, {
                        userId: existingInstructor.userId,
                        activeCourseId: existingInstructor.activeCourseId,
                        activeCourseName: existingInstructor.activeCourseName,
                        chatCount: existingInstructor.chats?.length || 0
                    });
                    //END DEBUG LOG : DEBUG-CODE(FACULTY-003)
                    
                    res.redirect('/pages/instructor-mode.html');
                    return;
                } else {
                    //START DEBUG LOG : DEBUG-CODE(FACULTY-004)
                    console.log('[AUTH] 🆕 New faculty detected, proceeding with account creation...');
                    //END DEBUG LOG : DEBUG-CODE(FACULTY-004)
                    
                    // STEP 2: Load APSC 099 course from database by courseName
                    //START DEBUG LOG : DEBUG-CODE(FACULTY-005)
                    console.log(`[AUTH] 📚 Step 2: Loading APSC 099 course from database...`);
                    //END DEBUG LOG : DEBUG-CODE(FACULTY-005)
                    
                    const apsc099Course = await mongoDB.getCourseByName(courseName) as any;
                    
                    if (!apsc099Course) {
                        //START DEBUG LOG : DEBUG-CODE(FACULTY-006)
                        console.error('[AUTH] ❌ CRITICAL ERROR: APSC 099 course not found in database!');
                        console.error('[AUTH] 🔍 Searched for courseName:', courseName);
                        //END DEBUG LOG : DEBUG-CODE(FACULTY-006)
                        
                        res.status(500).send(`
                            <html>
                                <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
                                    <h1 style="color: #dc3545;">System Configuration Error</h1>
                                    <p>The required course was not found in the system.</p>
                                    <p>Please contact the system administrator.</p>
                                    <a href="/" style="color: #007bff;">Return to Home</a>
                                </body>
                            </html>
                        `);
                        return;
                    }
                    
                    //START DEBUG LOG : DEBUG-CODE(FACULTY-007)
                    console.log('[AUTH] ✅ APSC 099 course found!');
                    console.log(`[AUTH] 📋 Course Details:`, {
                        id: apsc099Course.id,
                        courseName: apsc099Course.courseName,
                        courseSetup: apsc099Course.courseSetup,
                        contentSetup: apsc099Course.contentSetup,
                        flagSetup: apsc099Course.flagSetup,
                        monitorSetup: apsc099Course.monitorSetup,
                        instructorCount: apsc099Course.instructors?.length || 0,
                        taCount: apsc099Course.teachingAssistants?.length || 0
                    });
                    //END DEBUG LOG : DEBUG-CODE(FACULTY-007)
                    
                    // STEP 3: Create new instructor User document
                    //START DEBUG LOG : DEBUG-CODE(FACULTY-008)
                    console.log(`[AUTH] 👤 Step 3: Creating new instructor User document...`);
                    //END DEBUG LOG : DEBUG-CODE(FACULTY-008)
                    
                    const tempUserData: User = {
                        name: `${user.firstName} ${user.lastName}`,
                        puid: puid,
                        userId: 0, // Will be generated
                        activeCourseId: apsc099Course.id,  // Use actual course ID from database
                        activeCourseName: apsc099Course.courseName,  // Use actual courseName from database
                        userOnboarding: false,
                        affiliation: 'faculty',
                        status: 'active',
                        chats: [],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    
                    // Generate unique userId
                    const idGenerator = IDGenerator.getInstance();
                    const generatedUserId = parseInt(idGenerator.userID(tempUserData).substring(0, 8), 16);
                    
                    //START DEBUG LOG : DEBUG-CODE(FACULTY-009)
                    console.log(`[AUTH] 🆔 Generated userId: ${generatedUserId} for faculty: ${user.firstName} ${user.lastName}`);
                    //END DEBUG LOG : DEBUG-CODE(FACULTY-009)
                    
                    const newInstructorData: Partial<User> = {
                        name: `${user.firstName} ${user.lastName}`,
                        puid: puid,
                        userId: generatedUserId,
                        activeCourseId: apsc099Course.id,
                        activeCourseName: apsc099Course.courseName,
                        userOnboarding: false,
                        affiliation: 'faculty',
                        status: 'active',
                        chats: []
                    };
                    
                    await mongoDB.createStudent(courseName, newInstructorData);
                    
                    //START DEBUG LOG : DEBUG-CODE(FACULTY-010)
                    console.log('[AUTH] ✅ New faculty User document created successfully!');
                    console.log(`[AUTH] 📊 Instructor Info:`, {
                        name: newInstructorData.name,
                        puid: newInstructorData.puid,
                        userId: newInstructorData.userId,
                        activeCourseId: newInstructorData.activeCourseId,
                        activeCourseName: newInstructorData.activeCourseName
                    });
                    //END DEBUG LOG : DEBUG-CODE(FACULTY-010)
                    
                    res.redirect('/pages/instructor-mode.html');
                    return;
                }
            } catch (error) {
                //START DEBUG LOG : DEBUG-CODE(FACULTY-011)
                console.error('[AUTH] 🚨 Database error for faculty:', error);
                console.error('[AUTH] 📋 Error details:', {
                    message: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                });
                //END DEBUG LOG : DEBUG-CODE(FACULTY-011)
                
                // On database error, redirect to index.html
                res.redirect('/');
                return;
            }
        } else {
            //START DEBUG LOG : DEBUG-CODE(UNKNOWN-AFFILIATION)
            console.log('[AUTH] ⚠️ Unknown affiliation, redirecting to index');
            //END DEBUG LOG : DEBUG-CODE(UNKNOWN-AFFILIATION)
            
            // For unknown affiliations, redirect to index
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

/**
 * Authentication Routes - DEMO MODE
 *
 * No authentication, no database - everyone is auto-authenticated
 */

import express from 'express';

const router = express.Router();

// DEMO MODE: No login needed, just redirect to instructor page
router.get('/login', (req: express.Request, res: express.Response) => {
    console.log('🎭 DEMO MODE: No authentication - redirecting to instructor mode');
    res.redirect('/pages/instructor-mode.html');
});

// DEMO MODE: No logout needed
router.get('/logout', (req: express.Request, res: express.Response) => {
    console.log('🎭 DEMO MODE: No authentication - redirecting home');
    res.redirect('/');
});

// DEMO MODE: Always return authenticated with demo user
router.get('/me', (req: express.Request, res: express.Response) => {
    console.log('🎭 DEMO MODE: Returning hardcoded demo user (no auth required)');

    res.json({
        authenticated: true,
        user: {
            username: 'demo_instructor',
            firstName: 'Demo',
            lastName: 'Instructor',
            affiliation: 'instructor',
            puid: 'demo123',
            activeCourseName: 'APSC 099: Engineering for Kindergarten'
        }
    });
});

export default router;

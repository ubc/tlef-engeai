/**
 * Passport and SAML Configuration
 *
 * Sets up Passport with SAML strategy for CWL authentication or local strategy for development
 * - When SAML_AVAILABLE=false: Uses local username/password authentication
 * - When SAML_AVAILABLE=true: Uses SAML authentication with CWL
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 */

import passport from 'passport';
import { Strategy as SamlStrategy } from 'passport-saml';
import { Strategy as LocalStrategy } from 'passport-local';
import fs from 'fs';
import path from 'path';

// Check if SAML is available from environment
const isSamlAvailable = process.env.SAML_AVAILABLE !== 'false';

// Hardcoded fake users for local development authentication
const FAKE_USERS = {
    student: {
        username: 'student',
        puid: 'FAKE_STUDENT_PUID_001',
        firstName: 'Test',
        lastName: 'Student',
        affiliation: 'student',
        email: 'student@test.local',
        sessionIndex: null,
        nameID: 'local-student',
        nameIDFormat: 'local'
    },
    instructor: {
        username: 'instructor',
        puid: 'FAKE_INSTRUCTOR_PUID_001',
        firstName: 'Test',
        lastName: 'Instructor',
        affiliation: 'faculty',
        email: 'instructor@test.local',
        sessionIndex: null,
        nameID: 'local-instructor',
        nameIDFormat: 'local'
    }
};

// Variable to hold strategy (either SAML or Local)
let samlStrategy: SamlStrategy | null = null;

// Configure authentication strategy based on SAML_AVAILABLE
if (isSamlAvailable) {
    // Load SAML certificate (only needed when SAML is available)
    const samlCert = fs.readFileSync(
        process.env.SAML_CERT_PATH || path.join(__dirname, '../../certs/server.crt'),
        'utf-8'
    );

    // Configure SAML strategy
    samlStrategy = new SamlStrategy({
    callbackUrl: process.env.SAML_CALLBACK_URL,
    entryPoint: process.env.SAML_ENTRY_POINT,
    logoutUrl: process.env.SAML_LOGOUT_URL, // SP-initiated SLO
    logoutCallbackUrl: process.env.SAML_LOGOUT_CALLBACK_URL, // URL to receive LogoutResponse
    issuer: process.env.SAML_ISSUER,
    cert: samlCert,
    identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
    disableRequestedAuthnContext: true,
    acceptedClockSkewMs: 5000
    }, (profile: any, done: any) => {
        // Extract user information from SAML profile
        //START DEBUG LOG : DEBUG-CODE(SAML-PROFILE)
        console.log('SAML Profile received:', JSON.stringify(profile, null, 2));
        //END DEBUG LOG : DEBUG-CODE(SAML-PROFILE)

        // Map CWL attributes to our user object
        const user = {
            username: profile.cwlLoginName || profile.nameID,
            puid: profile.cwlLoginKey,
            firstName: profile.givenName,
            lastName: profile.sn,
            affiliation: profile.eduPersonAffiliation,
            email: profile.email,
            sessionIndex: profile.sessionIndex, // Needed for logout
            nameID: profile.nameID,
            nameIDFormat: profile.nameIDFormat,
            rawProfile: profile // Keep raw profile for debugging
        };

        return done(null, user);
    });

    passport.use('saml', samlStrategy);
    console.log('[AUTH] ✅ SAML strategy configured');
} else {
    // Configure Local strategy for development
    const localStrategy = new LocalStrategy(
        (username: string, password: string, done: any) => {
            //START DEBUG LOG : DEBUG-CODE(LOCAL-AUTH-ATTEMPT)
            console.log('[AUTH-LOCAL] 🔐 Login attempt for username:', username);
            //END DEBUG LOG : DEBUG-CODE(LOCAL-AUTH-ATTEMPT)

            // Check if username is 'student' or 'instructor'
            if (username !== 'student' && username !== 'instructor') {
                //START DEBUG LOG : DEBUG-CODE(LOCAL-AUTH-INVALID-USER)
                console.log('[AUTH-LOCAL] ❌ Invalid username:', username);
                //END DEBUG LOG : DEBUG-CODE(LOCAL-AUTH-INVALID-USER)
                return done(null, false, { message: 'Invalid username or password' });
            }

            // Verify password from environment variables
            const expectedPassword = username === 'student'
                ? process.env.FAKE_STUDENT_PASSWORD
                : process.env.FAKE_INSTRUCTOR_PASSWORD;

            if (password !== expectedPassword) {
                //START DEBUG LOG : DEBUG-CODE(LOCAL-AUTH-INVALID-PASSWORD)
                console.log('[AUTH-LOCAL] ❌ Invalid password for user:', username);
                //END DEBUG LOG : DEBUG-CODE(LOCAL-AUTH-INVALID-PASSWORD)
                return done(null, false, { message: 'Invalid username or password' });
            }

            // Authentication successful - return fake user
            const user = FAKE_USERS[username as 'student' | 'instructor'];
            //START DEBUG LOG : DEBUG-CODE(LOCAL-AUTH-SUCCESS)
            console.log('[AUTH-LOCAL] ✅ Authentication successful for user:', username);
            console.log('[AUTH-LOCAL] 👤 User data:', user);
            //END DEBUG LOG : DEBUG-CODE(LOCAL-AUTH-SUCCESS)

            return done(null, user);
        }
    );

    passport.use('local', localStrategy);
    console.log('[AUTH] ✅ Local strategy configured (Development Mode)');
}

// Serialize user to session
passport.serializeUser((user: any, done: any) => {
    done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user: any, done: any) => {
    done(null, user);
});

export { passport, samlStrategy, isSamlAvailable };

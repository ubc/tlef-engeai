/**
 * Passport and SAML Configuration
 *
 * Sets up Passport with SAML strategy for CWL authentication or local strategy for development
 * - When SAML_AVAILABLE=false: Uses local username/password authentication
 * - When SAML_AVAILABLE=true: Uses SAML authentication with CWL
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 */

import passport from 'passport';
import { Strategy as UbcShibStrategy } from 'passport-ubcshib';
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

type AttributeValue = string | string[] | undefined | null;

const toString = (value: AttributeValue): string | undefined => {
    if (Array.isArray(value)) {
        return value.find((item) => typeof item === 'string');
    }
    return typeof value === 'string' ? value : undefined;
};

const toArray = (value: AttributeValue): string[] => {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [value];
};

const mapAffiliation = (value: AttributeValue): string => {
    const affiliations = toArray(value);
    if (affiliations.length === 0) {
        return 'student';
    }
    const normalized = affiliations.map((entry) => entry.toLowerCase());
    if (normalized.includes('faculty') || normalized.includes('instructor') || normalized.includes('staff')) {
        return 'faculty';
    }
    return normalized[0];
};

// Variable to hold strategy (either UBCShib or Local)
let ubcShibStrategy: UbcShibStrategy | null = null;

// Configure authentication strategy based on SAML_AVAILABLE
if (isSamlAvailable) {
    // Load certificate (only needed when SAML is available)
    const samlCert = fs.readFileSync(
        process.env.SAML_CERT_PATH || path.join(__dirname, '../../certs/server.crt'),
        'utf-8'
    );

    // Configure UBCShib strategy (SAML 2.0 under the hood)
    ubcShibStrategy = new UbcShibStrategy({
        callbackUrl: process.env.SAML_CALLBACK_URL as string,
        entryPoint: process.env.SAML_ENTRY_POINT as string,
        logoutUrl: process.env.SAML_LOGOUT_URL,
        metadataUrl: process.env.SAML_METADATA_URL,
        issuer: process.env.SAML_ISSUER as string,
        cert: samlCert
    }, (profile: any, done: any) => {
        const attributes = (profile.attributes || {}) as Record<string, AttributeValue>;

        //START DEBUG LOG : DEBUG-CODE(UBCSHIB-PROFILE)
        console.log('[AUTH] UBCShib profile received:', JSON.stringify(profile, null, 2));
        //END DEBUG LOG : DEBUG-CODE(UBCSHIB-PROFILE)

        const puid =
            toString(attributes.ubcEduCwlPuid) ||
            toString(attributes.cwlLoginKey) ||
            profile.nameID;

        if (!puid) {
            console.error('[AUTH] ❌ Missing PUID in UBCShib response');
            return done(new Error('Missing required ubcEduCwlPuid attribute'));
        }

        const firstName =
            toString(attributes.givenName) ||
            toString(attributes.firstName) ||
            '';
        const lastName =
            toString(attributes.sn) ||
            toString(attributes.lastName) ||
            '';
        const email =
            toString(attributes.email) ||
            toString(attributes.mail) ||
            toString(attributes.eduPersonPrincipalName) ||
            '';

        const user = {
            username:
                toString(attributes.cwlLoginName) ||
                toString(attributes.uid) ||
                toString(attributes.displayName) ||
                profile.nameID,
            puid,
            firstName,
            lastName,
            affiliation: mapAffiliation(attributes.eduPersonAffiliation),
            email,
            sessionIndex: profile.sessionIndex,
            nameID: profile.nameID,
            nameIDFormat: profile.nameIDFormat,
            rawProfile: profile // Keep raw profile for debugging
        };

        return done(null, user);
    });

    passport.use('ubcshib', ubcShibStrategy as any);
    console.log('[AUTH] ✅ UBCShib strategy configured');
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

export { passport, ubcShibStrategy, isSamlAvailable };

/**
 * Passport and SAML Configuration
 *
 * Sets up Passport with SAML strategy for CWL authentication and local strategy for development
 * - SAML strategy is always configured if SAML environment variables are present (regardless of SAML_AVAILABLE)
 *   This allows the CWL login button to work even when SAML_AVAILABLE=false
 * - Local strategy is always configured for fallback/development use
 * - SAML_AVAILABLE flag controls which strategy is used by default in /auth/login route
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 */

import passport from 'passport';
import { Strategy as UbcShibStrategy } from 'passport-ubcshib';
import { Strategy as LocalStrategy } from 'passport-local';
import fs from 'fs';
import path from 'path';

// Check if SAML is available from environment
const isSamlAvailable = process.env.SAML_AVAILABLE !== 'false';

// Always expose raw Shib profile to frontend console for debugging
const isDebugShibProfile = true;

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

// Check if SAML environment variables are configured (required for SAML to work)
// passport-ubcshib only needs issuer and callbackUrl - it handles entryPoint, logoutUrl, and metadataUrl automatically
const hasSamlConfig = !!(
    process.env.SAML_CALLBACK_URL &&
    process.env.SAML_ISSUER
);

// Always configure SAML strategy if SAML environment variables are present
// This allows CWL login button to work even when SAML_AVAILABLE=false
if (hasSamlConfig) {
    try {
        // Configure UBCShib strategy (SAML 2.0 under the hood)
        // The strategy automatically configures entryPoint, logoutUrl, and metadataUrl based on SAML_ENVIRONMENT
        // It will also fetch the IdP certificate from metadata automatically if not provided

        const strategyConfig: any = {
            issuer: process.env.SAML_ISSUER as string,
            callbackUrl: process.env.SAML_CALLBACK_URL as string,
            entryPoint: process.env.SAML_ENTRY_POINT as string,
            logoutUrl: process.env.SAML_LOGOUT_URL as string,
            metadataUrl: process.env.SAML_METADATA_URL as string,
            // Request specific attributes from UBC IdP
            // The library will automatically map OID names to friendly names
            attributeConfig: [
                'ubcEduCwlPuid',        // UBC Computing User ID (PUID)
                'mail',                 // Email address
                'eduPersonAffiliation', // Role (student, faculty, staff)
                'givenName',           // First name
                'sn',                  // Last name (surname)
                'displayName'          // Display name
            ]
        };

        // Optionally add privateKeyPath if provided for request signing
        if (process.env.SAML_PRIVATE_KEY_PATH) {
            strategyConfig.privateKeyPath = process.env.SAML_PRIVATE_KEY_PATH;
        }

        // Optionally load certificate if provided (otherwise fetched from metadata)
        if (process.env.SAML_CERT_PATH) {
            try {
                strategyConfig.cert = fs.readFileSync(process.env.SAML_CERT_PATH, 'utf-8');
                console.log('[AUTH] 📜 Using custom IdP certificate from:', process.env.SAML_CERT_PATH);
            } catch (certError) {
                console.warn('[AUTH] ⚠️  Failed to load certificate, will fetch from metadata:', certError);
            }
        }

        ubcShibStrategy = new UbcShibStrategy(strategyConfig, (profile: any, done: any) => {
            const attributes = (profile.attributes || {}) as Record<string, AttributeValue>;

            //START DEBUG LOG : DEBUG-CODE(UBCSHIB-PROFILE)
            console.log('[AUTH] UBCShib profile received:', JSON.stringify(profile, null, 2));
            //END DEBUG LOG : DEBUG-CODE(UBCSHIB-PROFILE)

            // Extract PUID - it may be in attributes or at the profile root level
            // The library maps most attributes but ubcEduCwlPuid might need special handling
            const puid =
                toString(attributes.ubcEduCwlPuid) ||
                toString(profile.ubcEduCwlPuid) ||
                toString(profile['urn:mace:dir:attribute-def:ubcEduCwlPuid']) ||
                toString(profile['urn:oid:1.3.6.1.4.1.60.6.1.6']);

            if (!puid) {
                console.error('[AUTH] ❌ Missing PUID in UBCShib response');
                console.error('[AUTH] Available attributes:', Object.keys(attributes));
                console.error('[AUTH] Profile keys:', Object.keys(profile));
                return done(new Error('Missing required ubcEduCwlPuid attribute'));
            }

            // Extract user attributes - library has mapped these to friendly names in profile.attributes
            const firstName = toString(attributes.givenName) || '';
            const lastName = toString(attributes.sn) || '';
            const email = toString(attributes.mail) || toString(profile.mail) || toString(profile.email) || '';
            const affiliation = mapAffiliation(attributes.eduPersonAffiliation);

            const user: Record<string, unknown> = {
                username: toString(attributes.displayName) || puid,
                puid,
                firstName,
                lastName,
                affiliation,
                email,
                sessionIndex: profile.sessionIndex,
                nameID: profile.nameID,
                nameIDFormat: profile.nameIDFormat
            };

            // DEBUG_SHB_PROFILE: Expose raw Shib profile for frontend console debugging (development only)
            if (isDebugShibProfile) {
                user._rawShibProfile = profile;
            }

            //START DEBUG LOG : DEBUG-CODE(UBCSHIB-USER-CREATED)
            console.log('[AUTH] 👤 User object created from SAML:', {
                username: user.username,
                puid: user.puid,
                firstName: user.firstName,
                lastName: user.lastName,
                affiliation: user.affiliation,
                email: user.email
            });
            //END DEBUG LOG : DEBUG-CODE(UBCSHIB-USER-CREATED)

            return done(null, user);
        });

        passport.use('ubcshib', ubcShibStrategy as any);
        console.log('[AUTH] ✅ UBCShib strategy configured (available for CWL login)');
    } catch (error) {
        console.error('[AUTH] ❌ Failed to configure UBCShib strategy:', error);
        console.log('[AUTH] ⚠️  SAML configuration found but setup failed. CWL login will not be available.');
    }
} else {
    console.log('[AUTH] ⚠️  SAML environment variables not configured. CWL login will not be available.');
}

// Always configure Local strategy (used when SAML_AVAILABLE=false or for fallback)
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
console.log('[AUTH] ✅ Local strategy configured (available for regular login)');

// Serialize user to session (strip _rawShibProfile - stored separately in session for debug)
passport.serializeUser((user: any, done: any) => {
    const { _rawShibProfile, ...userToStore } = user;
    done(null, userToStore);
});

// Deserialize user from session
passport.deserializeUser((user: any, done: any) => {
    done(null, user);
});

export { passport, ubcShibStrategy, isSamlAvailable };

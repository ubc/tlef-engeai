/**
 * Passport and SAML Configuration
 *
 * Sets up Passport with SAML strategy for CWL authentication
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 */

import passport from 'passport';
import { Strategy as SamlStrategy } from 'passport-saml';
import fs from 'fs';
import path from 'path';

// Load SAML certificate
const samlCert = fs.readFileSync(
    path.resolve(process.env.SAML_CERT_PATH || '../../certs/server.crt'),
    'utf-8'
);

// Configure SAML strategy
const samlStrategy = new SamlStrategy({
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

// Serialize user to session
passport.serializeUser((user: any, done: any) => {
    done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user: any, done: any) => {
    done(null, user);
});

export { passport, samlStrategy };

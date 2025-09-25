/**
 * Session Configuration Middleware
 *
 * Configures express-session for managing user sessions.
 * In production, consider using Redis or another session store
 * instead of the default memory store.
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 */

import session from 'express-session';

const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true, // Prevent client-side JS from accessing the cookie
        maxAge: parseInt(process.env.SESSION_TIMEOUT_MS || '7200000') // 2 hours default
    },
    name: 'engeai.sid' // Custom session ID name for TLEF EngE-AI
};

export default session(sessionConfig);

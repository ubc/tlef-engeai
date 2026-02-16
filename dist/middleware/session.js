"use strict";
/**
 * Session Configuration Middleware
 *
 * Configures express-session for managing user sessions.
 * In production, consider using Redis or another session store
 * instead of the default memory store.
 * Adapted from saml-example-app for TLEF EngE-AI TypeScript project
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_session_1 = __importDefault(require("express-session"));
// Only allow insecure (HTTP) cookies in local development
// Staging and production should always use secure (HTTPS) cookies
const isLocalDevelopment = process.env.NODE_ENV === 'development';
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: !isLocalDevelopment, // HTTPS-only in staging/production, allow HTTP in local
        httpOnly: true, // Prevent client-side JS from accessing the cookie
        maxAge: parseInt(process.env.SESSION_TIMEOUT_MS || '7200000'), // 2 hours default
        sameSite: 'lax' // Allow cookies on same-site redirects (critical for login flow)
    },
    name: 'engeai.sid' // Custom session ID name for TLEF EngE-AI
};
console.log(`[SESSION] Environment: ${process.env.NODE_ENV || 'not set'}`);
console.log(`[SESSION] Secure cookies: ${sessionConfig.cookie.secure}`);
exports.default = (0, express_session_1.default)(sessionConfig);

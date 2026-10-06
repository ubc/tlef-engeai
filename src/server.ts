import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
// import cors from 'cors';
import { loadConfig } from './utils/config';
import { appLogger } from './utils/logger';
import chatAppRoutes from './routes/route-chat-app';
import ragAppRoutes from './routes/route-rag';
import mongodbRoutes from './routes/route-mongo';
// @rdschrs: Implemented the Writing Feedback API router mount.
import writingFeedbackRoutes from './routes/route-writing-feedback';
import { startWritingFeedbackWorker } from './writing-feedback/worker';
import healthRoutes from './routes/route-health';
import versionRoutes from './routes/route-version';
import onboardingRoutes from './routes/route-onboarding';
import lmsRoutes from './routes/route-lms';  // Canvas + Moodle integration routes
import authRoutes, { samlCallbackHandler } from './routes/route-auth';  // Import authentication routes
import courseEntryRoutes from './routes/route-course-entry';  // Import course entry routes
import studentViewRoutes from './routes/route-student-view';  // Student View enter/exit/reset
import userManagementRoutes from './routes/route-user-management';  // Import user management routes
import courseRoutes from './routes/route-course';  // Import course routes
import { sendHtmlPageWithBuildComment } from './utils/build-info';
import academicPeriodRoutes from './routes/mongo/academic-period-routes';
import adminCourseRoutes from './routes/mongo/admin-course-routes';
import adminGuidedPathwayFlagRoutes from './routes/mongo/admin-guided-pathway-flag-routes';
import adminManualFlagRoutes from './routes/mongo/admin-manual-flag-routes';

// Import SAML authentication middleware
import sessionMiddleware from './middleware/session';
import { passport } from './middleware/passport';
import { studentViewImpersonation } from './middleware/student-view';
import { sessionActivityMiddleware } from './middleware/session-activity';
import { EngEAI_MongoDB } from './db/enge-ai-mongodb';
import { initAcademicPeriods } from './helpers/init-academic-periods';
import { getCourseSelectionRedirectPath } from './helpers/course-selection-redirect';
import { isAppEntryBlockedAffiliation, type AffiliationValue } from './utils/affiliation';
import { isAdminUser } from './utils/admin';

dotenv.config();

const config = loadConfig();
const logger = appLogger;

const app = express();
const port = process.env.TLEF_ENGE_AI_PORT || 8020;

// // Enable CORS for all routes
// app.use(cors());

// Body parsing middleware (needed for SAML POST)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Session middleware - must be before passport
app.use(sessionMiddleware);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Student View: while a staff member is previewing, this request carries the test student.
app.use(studentViewImpersonation);

// Session idle: bump activity on /api/* (except poll endpoint); block expired sessions
app.use(sessionActivityMiddleware);

// When running from src/server.ts, __dirname is .../src
// When running from dist/server.js, __dirname is .../dist
// The correct relative path to public is one level up, then into public.
const publicPath = path.join(__dirname, '../public');

/** Login-page bundle; must exist under public/dist after `npm run build:frontend`. */
const frontendBuildSentinel = path.join(
    publicPath,
    'dist/public/scripts/auth/auth-manager.js'
);

function assertFrontendBuilt(): void {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    if (fs.existsSync(frontendBuildSentinel)) {
        return;
    }
    logger.error(
        '[STARTUP] Frontend not built (missing %s). Run `npm run build` or `npm run start:prod` before production start.',
        frontendBuildSentinel
    );
    process.exit(1);
}

assertFrontendBuilt();

// Request logging middleware
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.debug(
        `${new Date().toISOString()} ${req.method} ${req.path} - User: ${(req as any).user?.username || 'anonymous'}`
    );
    next();
});

// Root path handler: redirect authenticated users based on affiliation
app.get('/', (req: any, res: any) => {
    if (req.session?.passport?.user) {
        const globalUser = (req.session as any)?.globalUser;
        const affiliation = globalUser?.affiliation as AffiliationValue | undefined;
        const redirectPath = affiliation && isAppEntryBlockedAffiliation(affiliation) && !isAdminUser(globalUser)
            ? '/role-restricted'
            : getCourseSelectionRedirectPath(globalUser);
        logger.info(`[ROUTING] Authenticated user accessed root, redirecting to ${redirectPath}`);
        return res.redirect(redirectPath);
    }
    logger.info('[ROUTING] Unauthenticated user accessed root, serving index.html');
    return sendHtmlPageWithBuildComment(res, path.join(publicPath, 'index.html'));
});

// Public marketing team page (no auth)
app.get('/team', (_req: any, res: any) => {
    sendHtmlPageWithBuildComment(res, path.join(publicPath, 'pages/team.html'));
});

// Public markdown files first so /docs/overview.md is never the HTML shell.
app.use('/docs', express.static(path.join(publicPath, 'docs'), { index: false }));

// Public markdown docs shell (no auth). Unmatched /docs paths get the viewer.
app.get(/^\/docs(\/.*)?$/, (_req: any, res: any) => {
    sendHtmlPageWithBuildComment(res, path.join(publicPath, 'pages/docs.html'));
});

// Serve static files from the 'public' directory (but not for root path)
app.use(express.static(publicPath));

// Authentication routes (no /api prefix as they serve HTML too)
app.use('/auth', authRoutes);

// Invalid endpoints removed: These violated the endpoint invariant by allowing direct HTML access
// Course routes (must be before static file serving to catch course routes first)
app.use('/', courseRoutes);

// SAML callback at the path registered with UBC's Identity Provider, which is where deployed
// environments receive CWL sign-ins. Mounts the same handler as /auth/saml/callback; do not fork
// it, or login-time work such as Canvas roster enrollment runs locally but not when deployed.
app.post('/Shibboleth.sso/SAML2/POST', ...samlCallbackHandler);

// Page routes
app.get('/role-restricted', (req: any, res: any) => {
    if (!req.session?.passport?.user) {
        return res.redirect('/');
    }
    const globalUser = (req.session as any)?.globalUser;
    const affiliation = globalUser?.affiliation as AffiliationValue | undefined;
    if (!affiliation || !isAppEntryBlockedAffiliation(affiliation) || isAdminUser(globalUser)) {
        return res.redirect('/course-selection');
    }
    sendHtmlPageWithBuildComment(res, path.join(publicPath, 'pages/role-restricted.html'));
});

app.get('/course-selection', (req: any, res: any) => {
    const globalUser = (req.session as any)?.globalUser;
    const affiliation = globalUser?.affiliation as AffiliationValue | undefined;
    if (affiliation && isAppEntryBlockedAffiliation(affiliation) && !isAdminUser(globalUser)) {
        return res.redirect('/role-restricted');
    }
    if (isAdminUser(globalUser)) {
        return res.redirect('/admin/course-selection');
    }
    sendHtmlPageWithBuildComment(res, path.join(publicPath, 'pages/course-selection.html'));
});

app.get('/admin/course-selection', (req: any, res: any) => {
    if (!req.session?.passport?.user) {
        return res.redirect('/');
    }
    const globalUser = (req.session as any)?.globalUser;
    if (!isAdminUser(globalUser)) {
        const affiliation = globalUser?.affiliation as AffiliationValue | undefined;
        if (affiliation && isAppEntryBlockedAffiliation(affiliation)) {
            return res.redirect('/role-restricted');
        }
        return res.redirect('/course-selection');
    }
    sendHtmlPageWithBuildComment(res, path.join(publicPath, 'pages/admin-course-selection.html'));
});

app.get('/settings', (req: any, res: any) => {
    const globalUser = (req.session as any)?.globalUser;
    const affiliation = globalUser?.affiliation as AffiliationValue | undefined;
    if (affiliation && isAppEntryBlockedAffiliation(affiliation) && !isAdminUser(globalUser)) {
        return res.redirect('/role-restricted');
    }
    sendHtmlPageWithBuildComment(res, path.join(publicPath, 'pages/settings.html'));
});

// API endpoints
app.use('/api/chat', chatAppRoutes);
app.use('/api/rag', ragAppRoutes);
app.use('/api/courses', mongodbRoutes);  // Course management routes
// The router applies staff RBAC and explicit capability gates to its shared prefix.
app.use('/api/courses', writingFeedbackRoutes);
app.use('/api/academic-periods', academicPeriodRoutes);
app.use('/api/admin', adminCourseRoutes);
app.use('/api/admin/guided-pathway-flags', adminGuidedPathwayFlagRoutes);
app.use('/api/admin/manual-flags', adminManualFlagRoutes);
app.use('/api/course', courseEntryRoutes);  // Course entry routes
app.use('/api/course', studentViewRoutes);  // Student View controls (enter, exit, reset)
app.use('/api/user', userManagementRoutes);  // User management routes
app.use('/api/health', healthRoutes);    // Health check routes
app.use('/api/version', versionRoutes);  // Version endpoint for UI display
app.use('/api/onboarding', onboardingRoutes);  // Onboarding demo routes (e.g. sample chat download)
// Canvas/Moodle per-user connections. Each provider self-disables when its env
// vars are unset, so this mount is safe without LMS configuration present.
app.use('/api/lms', lmsRoutes);

// Final 404 handler for any requests that do not match a route
app.use((req: express.Request, res: express.Response) => {
    // If it's an API path, send a JSON 404
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    // For all other paths, send a simple text 404
    res.status(404).send('404: Page Not Found');
});

app.listen(port, async () => {
    logger.info(`Server running on http://localhost:${port}`);
    logger.info(`Health check: http://localhost:${port}/api/health`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`SAML Authentication: ${process.env.SAML_ENTRY_POINT ? 'Configured' : 'Not configured'}`);
    logger.info('--------------------------------');

    try {
        await initAcademicPeriods();
    } catch (err) {
        logger.error('Failed to initialize academic periods:', err as any);
    }

    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const migration = await mongo.migrateGuidedPathwayFlagsToCourseCollections();
        logger.info('Guided Pathway GPF-002 storage migration complete', migration);
    } catch (err) {
        logger.error('Guided Pathway GPF-002 storage migration failed:', err as any);
    }

    // Guards against two EngE-AI courses claiming the same LMS course, which would make
    // student enrollment sync ambiguous. Best-effort inside the helper — a failure here
    // must not stop the server, and the import path checks for a conflict before writing.
    try {
        await (await EngEAI_MongoDB.getInstance()).createCourseLmsLinkIndex();
    } catch (err) {
        logger.error('Failed to create LMS course-link index:', err as any);
    }

    // Guards against two EngE-AI courses claiming the same LMS course, which would make
    // student enrollment sync ambiguous. Best-effort inside the helper — a failure here
    // must not stop the server, and the import path checks for a conflict before writing.
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        await mongo.createCourseLmsLinkIndex();
        startWritingFeedbackWorker(mongo);
    } catch (err) {
        logger.error('Failed to create LMS course-link index:', err as any);
    }

    // Backs the login-time enrollment lookup, which runs on every sign-in and would otherwise
    // scan every stored roster. Best-effort inside the helper: an index that fails to build
    // makes logins slower, not wrong.
    try {
        await (await EngEAI_MongoDB.getInstance()).createCourseLmsRosterIndexes();
    } catch (err) {
        logger.error('Failed to create LMS roster indexes:', err as any);
    }

});

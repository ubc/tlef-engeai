import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
// import cors from 'cors';
import { loadConfig } from './utils/config';
import { appLogger } from './utils/logger';
import chatAppRoutes from './routes/route-chat-app';
import ragAppRoutes from './routes/route-rag';
import mongodbRoutes from './routes/route-mongo';
// @rdschrs: Implemented the Writing Feedback API router mount.
import writingFeedbackRoutes from './routes/route-writing-feedback';
import healthRoutes from './routes/route-health';
import versionRoutes from './routes/route-version';
import onboardingRoutes from './routes/route-onboarding';
import authRoutes from './routes/route-auth';  // Import authentication routes
import courseEntryRoutes from './routes/route-course-entry';  // Import course entry routes
import userManagementRoutes from './routes/route-user-management';  // Import user management routes
import courseRoutes from './routes/route-course';  // Import course routes
import academicPeriodRoutes from './routes/mongo/academic-period-routes';
import adminCourseRoutes from './routes/mongo/admin-course-routes';

// Import SAML authentication middleware
import sessionMiddleware from './middleware/session';
import { passport } from './middleware/passport';
import { EngEAI_MongoDB } from './db/enge-ai-mongodb';
import { initAcademicPeriods } from './helpers/init-academic-periods';
import { migrateInstructorAllowances } from './helpers/migrate-instructor-allowances';
import { migrateOnboardingFlags } from './helpers/migrate-onboarding-flags';
import { getCourseSelectionRedirectPath } from './helpers/course-selection-redirect';
import { resolveAffiliation, isFacultyOverrideName } from './utils/affiliation';
import { isAdminUser, isAdminName } from './utils/admin';

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

// When running from src/server.ts, __dirname is .../src
// When running from dist/server.js, __dirname is .../dist
// The correct relative path to public is one level up, then into public.
const publicPath = path.join(__dirname, '../public');

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
        const affiliation = (req.session as any)?.globalUser?.affiliation;
        const redirectPath = (affiliation === 'staff' || affiliation === 'empty')
            ? '/role-restricted'
            : getCourseSelectionRedirectPath((req.session as any).globalUser);
        logger.info(`[ROUTING] Authenticated user accessed root, redirecting to ${redirectPath}`);
        return res.redirect(redirectPath);
    }
    logger.info('[ROUTING] Unauthenticated user accessed root, serving index.html');
    return res.sendFile(path.join(publicPath, 'index.html'));
});

// Serve static files from the 'public' directory (but not for root path)
app.use(express.static(publicPath));

// Authentication routes (no /api prefix as they serve HTML too)
app.use('/auth', authRoutes);

// Invalid endpoints removed: These violated the endpoint invariant by allowing direct HTML access
// Course routes (must be before static file serving to catch course routes first)
app.use('/', courseRoutes);

// SAML callback route at IdP-registered path
// This is the path registered with UBC's Identity Provider
// It redirects to the main auth callback handler
app.post('/Shibboleth.sso/SAML2/POST', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.info('[AUTH] SAML callback received at IdP-registered path: /Shibboleth.sso/SAML2/POST');
    logger.info('[AUTH] Forwarding to passport authentication handler...');

    passport.authenticate('ubcshib', {
        failureRedirect: '/auth/login-failed',
        failureFlash: false
    })(req, res, next);
}, async (req: express.Request, res: express.Response) => {
    try {
        // Extract user data from SAML profile
        const puid = (req.user as any).puid;
        const firstName = (req.user as any).firstName || '';
        const lastName = (req.user as any).lastName || '';
        const name = `${firstName} ${lastName}`.trim();
        const cwlAffiliation = (req.user as any).affiliation; // From Passport (mapAffiliation)

        // Get MongoDB instance
        const mongoDB = await EngEAI_MongoDB.getInstance();

        // Check if GlobalUser exists in active-users collection
        let globalUser = await mongoDB.findGlobalUserByPUID(puid);

        // Resolve affiliation: CWL takes precedence over DB when they differ (except admin overrides)
        const resolution = resolveAffiliation(cwlAffiliation, globalUser?.affiliation, name);
        const affiliation = resolution.affiliation;

        if (isFacultyOverrideName(name) && cwlAffiliation !== affiliation) {
            logger.info(`[AUTH] 🔄 Affiliation override: ${name} set to faculty`);
        }

        logger.info('[AUTH] ✅ SAML authentication successful');
        logger.info(`[AUTH] User PUID: ${puid}`);
        logger.info(`[AUTH] User Name: ${name}`);
        logger.info(`[AUTH] Affiliation: ${affiliation} (CWL: ${cwlAffiliation}, DB: ${globalUser?.affiliation ?? 'N/A'})`);

        if (!globalUser) {
            logger.info('[AUTH] 🆕 Creating new GlobalUser');

            globalUser = await mongoDB.createGlobalUser({
                puid,
                name,
                userId: mongoDB.idGenerator.globalUserID(puid, name, affiliation),
                coursesEnrolled: [],
                affiliation: affiliation as 'student' | 'faculty' | 'staff' | 'empty',
                status: 'active',
                isAdmin: isAdminName(name)
            });

            logger.info(`[AUTH] ✅ GlobalUser created: ${globalUser.userId}`);
        } else {
            logger.info(`[AUTH] ✅ GlobalUser found: ${globalUser.userId}`);

            // Reconcile DB with CWL when DB has inconsistent data (e.g. dual student+instructor stored as faculty)
            if (resolution.needsDbUpdate && (affiliation === 'student' || affiliation === 'faculty')) {
                logger.info(`[AUTH] 🔄 Updating GlobalUser affiliation: DB had ${globalUser.affiliation}, CWL says ${affiliation}`);
                globalUser = await mongoDB.updateGlobalUserAffiliation(globalUser.userId, affiliation as 'student' | 'faculty');
                (req.user as any).affiliation = affiliation;
                logger.info(`[AUTH] ✅ GlobalUser affiliation updated: ${globalUser.userId}`);
            }

            // Reconcile admin status against the ADMINS allowlist
            const shouldBeAdmin = isAdminName(name);
            if (globalUser.isAdmin !== shouldBeAdmin) {
                logger.info(`[AUTH] 🔄 Updating GlobalUser isAdmin: was ${globalUser.isAdmin}, now ${shouldBeAdmin}`);
                globalUser = await mongoDB.updateGlobalUser(globalUser.puid, { isAdmin: shouldBeAdmin });
            }
        }

        // Store GlobalUser in session
        (req.session as any).globalUser = globalUser;

        // Save session before redirect
        req.session.save((saveErr) => {
            if (saveErr) {
                logger.error('[AUTH] ❌ Session save error:', saveErr as any);
                return res.redirect('/');
            }

            const redirectPath = (affiliation === 'staff' || affiliation === 'empty')
                ? '/role-restricted'
                : getCourseSelectionRedirectPath(globalUser);
            logger.info(`[AUTH] 🚀 Session saved, redirecting to ${redirectPath}`);
            logger.info(`[AUTH] 📋 Session ID: ${(req as any).sessionID}`);
            res.redirect(redirectPath);
        });

    } catch (error) {
        logger.error('[AUTH] 🚨 Error in authentication callback:', error as any);
        res.redirect('/');
    }
});

// Page routes
app.get('/role-restricted', (req: any, res: any) => {
    if (!req.session?.passport?.user) {
        return res.redirect('/');
    }
    const affiliation = (req.session as any)?.globalUser?.affiliation;
    if (affiliation !== 'staff' && affiliation !== 'empty') {
        return res.redirect('/course-selection');
    }
    res.sendFile(path.join(publicPath, 'pages/role-restricted.html'));
});

app.get('/course-selection', (req: any, res: any) => {
    const affiliation = (req.session as any)?.globalUser?.affiliation;
    if (affiliation === 'staff' || affiliation === 'empty') {
        return res.redirect('/role-restricted');
    }
    const globalUser = (req.session as any)?.globalUser;
    if (isAdminUser(globalUser)) {
        return res.redirect('/admin/course-selection');
    }
    res.sendFile(path.join(publicPath, 'pages/course-selection.html'));
});

app.get('/admin/course-selection', (req: any, res: any) => {
    if (!req.session?.passport?.user) {
        return res.redirect('/');
    }
    const affiliation = (req.session as any)?.globalUser?.affiliation;
    if (affiliation === 'staff' || affiliation === 'empty') {
        return res.redirect('/role-restricted');
    }
    const globalUser = (req.session as any)?.globalUser;
    if (!isAdminUser(globalUser)) {
        return res.redirect('/course-selection');
    }
    res.sendFile(path.join(publicPath, 'pages/admin-course-selection.html'));
});

app.get('/settings', (req: any, res: any) => {
    const affiliation = (req.session as any)?.globalUser?.affiliation;
    if (affiliation === 'staff' || affiliation === 'empty') {
        return res.redirect('/role-restricted');
    }
    res.sendFile(path.join(publicPath, 'pages/settings.html'));
});

// API endpoints
app.use('/api/chat', chatAppRoutes);
app.use('/api/rag', ragAppRoutes);
app.use('/api/courses', mongodbRoutes);  // Course management routes
// The router applies staff RBAC and explicit capability gates to its shared prefix.
app.use('/api/courses', writingFeedbackRoutes);
app.use('/api/academic-periods', academicPeriodRoutes);
app.use('/api/admin', adminCourseRoutes);
app.use('/api/course', courseEntryRoutes);  // Course entry routes
app.use('/api/user', userManagementRoutes);  // User management routes
app.use('/api/health', healthRoutes);    // Health check routes
app.use('/api/version', versionRoutes);  // Version endpoint for UI display
app.use('/api/onboarding', onboardingRoutes);  // Onboarding demo routes (e.g. sample chat download)

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
        await migrateInstructorAllowances();
    } catch (err) {
        logger.error('Failed to migrate instructor allowances:', err as any);
    }

    try {
        await migrateOnboardingFlags();
    } catch (err) {
        logger.error('Onboarding migration failed:', err as any);
    }

});

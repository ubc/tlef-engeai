import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
// import cors from 'cors';
import chatAppRoutes from './routes/chat-app';
import ragAppRoutes from './routes/rag-app';
import mongodbRoutes from './routes/mongo-app';
import healthRoutes from './routes/health';
import versionRoutes from './routes/version';
import authRoutes from './routes/auth';  // Import authentication routes
import courseEntryRoutes from './routes/course-entry';  // Import course entry routes
import userManagementRoutes from './routes/user-management';  // Import user management routes
import courseRoutes from './routes/course-routes';  // Import course routes

// Import SAML authentication middleware
import sessionMiddleware from './middleware/session';
import { passport } from './middleware/passport';
import { EngEAI_MongoDB } from './functions/EngEAI_MongoDB';
import { initInstructorAllowedCourses } from './functions/initInstructorAllowedCourses';
import { resolveAffiliation, FACULTY_OVERRIDE_NAMES } from './utils/affiliation';

dotenv.config();

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
    //START DEBUG LOG : DEBUG-CODE(SERVER-REQUEST)
    console.log(
        `[ENGE-AI] ${new Date().toISOString()} ${req.method} ${
            req.path
        } - User: ${(req as any).user?.username || 'anonymous'}`
    );
    //END DEBUG LOG : DEBUG-CODE(SERVER-REQUEST)
    next();
});

// Root path handler: redirect authenticated users based on affiliation
app.get('/', (req: any, res: any) => {
    if (req.session?.passport?.user) {
        const affiliation = (req.session as any)?.globalUser?.affiliation;
        const redirectPath = (affiliation === 'staff' || affiliation === 'empty')
            ? '/role-restricted'
            : '/course-selection';
        console.log('[ROUTING] Authenticated user accessed root, redirecting to', redirectPath);
        return res.redirect(redirectPath);
    }
    console.log('[ROUTING] Unauthenticated user accessed root, serving index.html');
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
    console.log('[AUTH] SAML callback received at IdP-registered path: /Shibboleth.sso/SAML2/POST');
    console.log('[AUTH] Forwarding to passport authentication handler...');

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

        // Resolve affiliation: CWL takes precedence over DB when they differ (except Charisma)
        const resolution = resolveAffiliation(cwlAffiliation, globalUser?.affiliation, name);
        const affiliation = resolution.affiliation;

        if (FACULTY_OVERRIDE_NAMES.includes(name) && cwlAffiliation !== affiliation) {
            console.log('[AUTH] 🔄 Affiliation override:', name, 'set to faculty');
        }

        console.log('[AUTH] ✅ SAML authentication successful');
        console.log('[AUTH] User PUID:', puid);
        console.log('[AUTH] User Name:', name);
        console.log('[AUTH] Affiliation:', affiliation, '(CWL:', cwlAffiliation, ', DB:', globalUser?.affiliation ?? 'N/A', ')');

        if (!globalUser) {
            console.log('[AUTH] 🆕 Creating new GlobalUser');

            globalUser = await mongoDB.createGlobalUser({
                puid,
                name,
                userId: mongoDB.idGenerator.globalUserID(puid, name, affiliation),
                coursesEnrolled: [],
                affiliation: affiliation as 'student' | 'faculty' | 'staff' | 'empty',
                status: 'active'
            });

            console.log('[AUTH] ✅ GlobalUser created:', globalUser.userId);
        } else {
            console.log('[AUTH] ✅ GlobalUser found:', globalUser.userId);

            // Reconcile DB with CWL when DB has inconsistent data (e.g. dual student+instructor stored as faculty)
            if (resolution.needsDbUpdate && (affiliation === 'student' || affiliation === 'faculty')) {
                console.log('[AUTH] 🔄 Updating GlobalUser affiliation: DB had', globalUser.affiliation, ', CWL says', affiliation);
                globalUser = await mongoDB.updateGlobalUserAffiliation(globalUser.userId, affiliation as 'student' | 'faculty');
                (req.user as any).affiliation = affiliation;
                console.log('[AUTH] ✅ GlobalUser affiliation updated:', globalUser.userId);
            }
        }

        // Store GlobalUser in session
        (req.session as any).globalUser = globalUser;

        // Save session before redirect
        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('[AUTH] ❌ Session save error:', saveErr);
                return res.redirect('/');
            }

            const redirectPath = (affiliation === 'staff' || affiliation === 'empty')
                ? '/role-restricted'
                : '/course-selection';
            console.log('[AUTH] 🚀 Session saved, redirecting to', redirectPath);
            console.log('[AUTH] 📋 Session ID:', (req as any).sessionID);
            res.redirect(redirectPath);
        });

    } catch (error) {
        console.error('[AUTH] 🚨 Error in authentication callback:', error);
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
    res.sendFile(path.join(publicPath, 'pages/course-selection.html'));
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
app.use('/api/course', courseEntryRoutes);  // Course entry routes
app.use('/api/user', userManagementRoutes);  // User management routes
app.use('/api/health', healthRoutes);    // Health check routes
app.use('/api/version', versionRoutes);  // Version endpoint for UI display

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
    console.log(`[ENGE-AI] Server running on http://localhost:${port}`);
    console.log(`[ENGE-AI] Health check: http://localhost:${port}/api/health`);
    console.log(`[ENGE-AI] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[ENGE-AI] SAML Authentication: ${process.env.SAML_ENTRY_POINT ? 'Configured' : 'Not configured'}`);
    console.log('--------------------------------');

    try {
        await initInstructorAllowedCourses();
    } catch (err) {
        console.error('[ENGE-AI] Failed to initialize instructor-allowed-courses:', err);
    }
});
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
// import cors from 'cors';
const chat_app_1 = __importDefault(require("./routes/chat-app"));
const rag_app_1 = __importDefault(require("./routes/rag-app"));
const mongo_app_1 = __importDefault(require("./routes/mongo-app"));
const health_1 = __importDefault(require("./routes/health"));
const auth_1 = __importDefault(require("./routes/auth")); // Import authentication routes
const course_entry_1 = __importDefault(require("./routes/course-entry")); // Import course entry routes
const user_management_1 = __importDefault(require("./routes/user-management")); // Import user management routes
const course_routes_1 = __importDefault(require("./routes/course-routes")); // Import course routes
// Import SAML authentication middleware
const session_1 = __importDefault(require("./middleware/session"));
const passport_1 = require("./middleware/passport");
const EngEAI_MongoDB_1 = require("./functions/EngEAI_MongoDB");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.TLEF_ENGE_AI_PORT || 8020;
// // Enable CORS for all routes
// app.use(cors());
// Body parsing middleware (needed for SAML POST)
app.use(express_1.default.urlencoded({ extended: false }));
app.use(express_1.default.json());
// Session middleware - must be before passport
app.use(session_1.default);
// Passport middleware
app.use(passport_1.passport.initialize());
app.use(passport_1.passport.session());
// When running from src/server.ts, __dirname is .../src
// When running from dist/server.js, __dirname is .../dist
// The correct relative path to public is one level up, then into public.
const publicPath = path_1.default.join(__dirname, '../public');
// Request logging middleware
app.use((req, res, next) => {
    var _a;
    //START DEBUG LOG : DEBUG-CODE(SERVER-REQUEST)
    console.log(`[ENGE-AI] ${new Date().toISOString()} ${req.method} ${req.path} - User: ${((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) || 'anonymous'}`);
    //END DEBUG LOG : DEBUG-CODE(SERVER-REQUEST)
    next();
});
// Root path handler: redirect authenticated users to course selection
app.get('/', (req, res) => {
    var _a, _b;
    // Check if user is authenticated (has a valid session)
    if ((_b = (_a = req.session) === null || _a === void 0 ? void 0 : _a.passport) === null || _b === void 0 ? void 0 : _b.user) {
        // Authenticated user: redirect to course selection
        console.log('[ROUTING] 🔄 Authenticated user accessed root, redirecting to course-selection');
        return res.redirect('/course-selection');
    }
    else {
        // Unauthenticated user: serve index.html (login page)
        console.log('[ROUTING] 📄 Unauthenticated user accessed root, serving index.html');
        return res.sendFile(path_1.default.join(publicPath, 'index.html'));
    }
});
// Serve static files from the 'public' directory (but not for root path)
app.use(express_1.default.static(publicPath));
// Authentication routes (no /api prefix as they serve HTML too)
app.use('/auth', auth_1.default);
// Invalid endpoints removed: These violated the endpoint invariant by allowing direct HTML access
// Course routes (must be before static file serving to catch course routes first)
app.use('/', course_routes_1.default);
// SAML callback route at IdP-registered path
// This is the path registered with UBC's Identity Provider
// It redirects to the main auth callback handler
app.post('/Shibboleth.sso/SAML2/POST', (req, res, next) => {
    console.log('[AUTH] SAML callback received at IdP-registered path: /Shibboleth.sso/SAML2/POST');
    console.log('[AUTH] Forwarding to passport authentication handler...');
    // Use passport to authenticate, then forward to the same handler as /auth/saml/callback
    passport_1.passport.authenticate('ubcshib', {
        failureRedirect: '/auth/login-failed',
        failureFlash: false
    })(req, res, next);
}, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Extract user data from SAML profile
        const puid = req.user.puid;
        const firstName = req.user.firstName || '';
        const lastName = req.user.lastName || '';
        const name = `${firstName} ${lastName}`.trim();
        let affiliation = req.user.affiliation;
        // Special override: Always set Charisma Rusdiyanto as faculty
        if (name === 'Charisma Rusdiyanto') {
            affiliation = 'faculty';
            console.log('[AUTH] 🔄 Affiliation override: Charisma Rusdiyanto set to faculty');
        }
        console.log('[AUTH] ✅ SAML authentication successful');
        console.log('[AUTH] User PUID:', puid);
        console.log('[AUTH] User Name:', name);
        console.log('[AUTH] Affiliation:', affiliation);
        // Get MongoDB instance
        const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
        // Check if GlobalUser exists in active-users collection
        let globalUser = yield mongoDB.findGlobalUserByPUID(puid);
        if (!globalUser) {
            console.log('[AUTH] 🆕 Creating new GlobalUser');
            globalUser = yield mongoDB.createGlobalUser({
                puid,
                name,
                userId: mongoDB.idGenerator.globalUserID(puid, name, affiliation),
                coursesEnrolled: [],
                affiliation,
                status: 'active'
            });
            console.log('[AUTH] ✅ GlobalUser created:', globalUser.userId);
        }
        else {
            console.log('[AUTH] ✅ GlobalUser found:', globalUser.userId);
        }
        // Store GlobalUser in session
        req.session.globalUser = globalUser;
        // Save session before redirect
        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('[AUTH] ❌ Session save error:', saveErr);
                return res.redirect('/');
            }
            console.log('[AUTH] 🚀 Session saved, redirecting to course selection');
            console.log('[AUTH] 📋 Session ID:', req.sessionID);
            res.redirect('/course-selection');
        });
    }
    catch (error) {
        console.error('[AUTH] 🚨 Error in authentication callback:', error);
        res.redirect('/');
    }
}));
// Page routes
app.get('/course-selection', (req, res) => {
    res.sendFile(path_1.default.join(publicPath, 'pages/course-selection.html'));
});
app.get('/settings', (req, res) => {
    res.sendFile(path_1.default.join(publicPath, 'pages/settings.html'));
});
// API endpoints
app.use('/api/chat', chat_app_1.default);
app.use('/api/rag', rag_app_1.default);
app.use('/api/courses', mongo_app_1.default); // Course management routes
app.use('/api/course', course_entry_1.default); // Course entry routes
app.use('/api/user', user_management_1.default); // User management routes
app.use('/api/health', health_1.default); // Health check routes
// Final 404 handler for any requests that do not match a route
app.use((req, res) => {
    // If it's an API path, send a JSON 404
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    // For all other paths, send a simple text 404
    res.status(404).send('404: Page Not Found');
});
app.listen(port, () => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`[ENGE-AI] Server running on http://localhost:${port}`);
    console.log(`[ENGE-AI] Health check: http://localhost:${port}/api/health`);
    console.log(`[ENGE-AI] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[ENGE-AI] SAML Authentication: ${process.env.SAML_ENTRY_POINT ? 'Configured' : 'Not configured'}`);
    console.log('--------------------------------');
    // // Initialize dummy courses on server startup
    // await initializeDummyCourses();
}));

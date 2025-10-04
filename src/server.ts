import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import cors from 'cors';
import chatAppRoutes from './routes/chat-app';
import ragAppRoutes from './routes/RAG-App';
import mongodbRoutes from './routes/mongo-app';
import healthRoutes from './routes/health';
import debugRoutes from './routes/debug';  // Import MongoDB routes
import authRoutes from './routes/auth';  // Import authentication routes
import { initializeDummyCourses } from './debug/dummy-courses.js';

dotenv.config();

const app = express();
const port = process.env.TLEF_ENGE_AI_PORT || 8020;

// Enable CORS for all routes
app.use(cors());

// Body parsing middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

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

// Serve static files from the 'public' directory
app.use(express.static(publicPath));

// Authentication routes (no /api prefix as they serve HTML too)
app.use('/auth', authRoutes);

// Page routes
app.get('/settings', (req: any, res: any) => {
    res.sendFile(path.join(publicPath, 'pages/settings.html'));
});

// API endpoints
app.use('/api/chat', chatAppRoutes);
app.use('/api/ollama', chatAppRoutes);
app.use('/api/rag', ragAppRoutes);
app.use('/api/courses', mongodbRoutes);  // Course management routes
app.use('/api/health', healthRoutes);    // Health check routes
app.use('/api/debug', debugRoutes);      // Debug routes

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
    console.log(`[ENGE-AI] Authentication: Demo Mode (No SAML)`);
    console.log('--------------------------------');
    
    // Initialize dummy courses on server startup
    await initializeDummyCourses();
});
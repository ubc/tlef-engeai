import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import cors from 'cors';
import chatAppRoutes from './routes/chat-app';
import ragAppRoutes from './routes/RAG-App';
import mongodbRoutes from './routes/mongoApp';  // Import MongoDB routes
import { initializeDummyCourses } from './debug/dummy-courses.js';

dotenv.config();

const app = express();
const port = process.env.TLEF_ENGE_AI_PORT || 8020;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// When running from src/server.ts, __dirname is .../src
// When running from dist/server.js, __dirname is .../dist
// The correct relative path to public is one level up, then into public.
const publicPath = path.join(__dirname, '../public');

// Serve static files from the 'public' directory
app.use(express.static(publicPath));

// Page routes
app.get('/settings', (req: any, res: any) => {
    res.sendFile(path.join(publicPath, 'pages/settings.html'));
});

// API endpoints
app.use('/api/chat', chatAppRoutes);
app.use('/api/ollama', chatAppRoutes);
app.use('/api/rag', ragAppRoutes); // ragAppRoutes is not defined or imported, so this line is commented out
app.use('/api/mongodb', mongodbRoutes);  // Add MongoDB routes

app.listen(port, async () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log('ENGE-AI Test');
    
    // Initialize dummy courses on server startup
    await initializeDummyCourses();
});
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import cors from 'cors';
import exampleRoutes from './routes/example/hello';
import chatRoutes from './routes/chat';
import ollamaRoutes from './routes/ollama';
import qdrantRoutes from './routes/qdrant';  // Import Qdrant routes

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
app.use('/api/example', exampleRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ollama', ollamaRoutes);
app.use('/api/qdrant', qdrantRoutes);  // Add Qdrant routes

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log('ENGE-AI Test');
});
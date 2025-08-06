import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import path from 'path';
import exampleRoutes from './routes/example/hello';

dotenv.config();

const app = express();
const port = process.env.TLEF_ENGE_AI_PORT || 8020;

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

// API endpoint
app.use('/api/example', exampleRoutes);

app.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
	console.log('ENGE-AI Test');
});

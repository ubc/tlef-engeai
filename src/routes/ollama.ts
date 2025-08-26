import express, { Request, Response } from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const OLLAMA_API_URL = 'http://localhost:11434/api/chat';

router.post('/chat', async (req: Request, res: Response) => {
    try {
        const { model, messages } = req.body;

        if (!model || !messages) {
            return res.status(400).send({ error: 'Missing model or messages in request body' });
        }

        const ollamaRes = await fetch(OLLAMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true, 
            }),
        });

        if (!ollamaRes.ok) {
            const errorText = await ollamaRes.text();
            console.error('Ollama API error:', errorText);
            return res.status(ollamaRes.status).send({ error: `Ollama API error: ${errorText}` });
        }

        res.setHeader('Content-Type', 'application/json');
        ollamaRes.body.pipe(res);

    } catch (error) {
        console.error('Error streaming from Ollama:', error);
        res.status(500).send({ error: 'Failed to stream from Ollama' });
    }
});

export default router;

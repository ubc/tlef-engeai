/**
 * ===========================================
 * ========= OLLAMA LLM INTEGRATION ==========
 * ===========================================
 *
 * This module provides Express.js routes for integrating with Ollama local LLM server
 * to enable AI-powered chat functionality for the EngE-AI platform.
 *
 * Key Features:
 * - Streaming chat responses from local Ollama instance
 * - Direct proxy to Ollama API with error handling
 * - Support for conversational message history
 * - Real-time response streaming for better UX
 * - Configurable model selection (currently llama3.1:latest)
 *
 * API Endpoints:
 * - POST /chat - Send messages to Ollama and stream responses
 *
 * Dependencies:
 * - Ollama server running on localhost:11434
 * - Compatible LLM model (llama3.1:latest) installed in Ollama
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 * 
 */

import express, { Request, Response } from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const OLLAMA_API_URL = 'http://localhost:11434/api/chat';

router.post('/chat', async (req: Request, res: Response) => {
    try {
        const { messages } = req.body;
        const model = 'llama3.1:latest'; // Hardcoded model

        if (!messages) {
            return res.status(400).send({ error: 'Missing messages in request body' });
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

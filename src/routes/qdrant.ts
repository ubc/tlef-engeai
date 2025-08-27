import express from 'express';
import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import fs from 'fs';

const router: Router = express.Router();

// Configuration
const QDRANT_HOST = process.env.QDRANT_URL || 'http://localhost:6340';
const API_ENDPOINT = 'http://localhost:6340/api/documents';

// Helper function to upload to Qdrant
async function uploadToQdrant(textContent: string) {
    try {
        const payload = {
            text: textContent,
        };

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error('Error Body:', errorBody);
            throw new Error(`Qdrant API error: ${response.status} - ${errorBody}`);
        }

        const result = await response.json();
        console.log('Successfully uploaded document:', result);
        return result;
    } catch (error) {
        console.error('Failed to upload to Qdrant:', error);
        throw error;
    }
}

// Middleware for error handling
const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) => 
    (req: Request, res: Response) => {
        Promise.resolve(fn(req, res))
            .catch((error) => {
                console.error('Error in Qdrant route:', error);
                res.status(500).json({
                    status: 500,
                    message: 'Internal server error',
                    details: error.message
                });
            });
    };

// Validation middleware
const validateDocument = (req: Request, res: Response, next: Function) => {
    const doc = req.body;
    
    if (!doc) {
        return res.status(400).json({
            status: 400,
            message: 'Request body is required'
        });
    }

    if (!doc.text || typeof doc.text !== 'string') {
        return res.status(400).json({
            status: 400,
            message: 'Document text is required and must be a string'
        });
    }

    if (doc.text.length === 0) {
        return res.status(400).json({
            status: 400,
            message: 'Document text cannot be empty'
        });
    }

    next();
};

// Routes

// POST /api/qdrant/documents - Upload a document
router.post('/documents', validateDocument, asyncHandler(async (req: Request, res: Response) => {
    try {
        const result = await uploadToQdrant(req.body.text);
        res.status(200).json(result);
    } catch (error) {
        throw {
            status: 500,
            message: 'Failed to upload document to Qdrant',
            details: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}));

export default router;


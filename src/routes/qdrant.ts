/**
 * ===========================================
 * ========= QDRANT INTEGRATION API =========
 * ===========================================
 *
 * This module provides Express.js routes for integrating with Qdrant vector database
 * to store and retrieve course content embeddings for the EngE-AI platform.
 *
 * Key Features:
 * - Document upload with vector embeddings to Qdrant collections
 * - Hierarchical content retrieval by course, content, and subcontent
 * - RESTful API endpoints for vector similarity search
 * - Payload validation and error handling middleware
 * - Collection organization by course name for multi-tenant support
 *
 * API Endpoints:
 * - POST /documents/:courseName/:contentTitle/:subContentTitle - Upload document with vector
 * - GET /documents/:courseName - Get all documents for a course
 * - GET /documents/:courseName/:contentTitle - Get content-specific documents
 * - GET /documents/:courseName/:contentTitle/:subContentTitle - Get subcontent documents
 * - GET /documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber - Get specific chunk
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 * 
 */

import express from 'express';
import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import { QdrantClient } from '@qdrant/js-client-rest';
import { AdditionalMaterial } from '../functions/types';
const router: Router = express.Router();



// Configuration
const QDRANT_HOST = process.env.QDRANT_URL || 'http://localhost:6333';
const API_ENDPOINT = `${QDRANT_HOST}/api/documents`;

const qdrantClient = new QdrantClient({
    url: QDRANT_HOST,
});


/**
 * Upload coument to qdrant
 * 
 *  - chukfile 
 * 
 * PAYLOADS:
 *  - id
 *  - date
 *  - content Title
 *  - subcontent Title
 *  - chunkNumber
 */


class QdrantUpload {


    constructor(private qdrantClient: QdrantClient) {
        this.qdrantClient = qdrantClient;
    }

    async uploadTextToQdrant(uploadContent: AdditionalMaterial, vector: number[]) {

        //create payload
        const payload = {
            id: uploadContent.id,
            date: uploadContent.date,
            courseName: uploadContent.courseName,
            contentTitle: uploadContent.contentTitle,
            subcontentTitle: uploadContent.subcontentTitle,
            chunkNumber: uploadContent.chunkNumber,
        };

        //collection name : follows courseName
        const collectionName = uploadContent.courseName;

        // Upload to Qdrant using upsert (points.insert)
        const result = await this.qdrantClient.upsert(collectionName, {
            points: [
                {
                    id: payload.id,
                    payload: payload,
                    vector: vector,
                }
            ]
        });
        
        return result;
    }

    /**
     * get document from qdrant
     */
    async getDocumentFromQdrant(
        courseName: string, 
        contentTitle?: string,
        subcontentTitle?: string,
        chunkNumber?: number,
        id?: string,
    ) : Promise<any> {
        let result: any;

        //search chunk by id
        if (id) {
            result = await this.qdrantClient.scroll(courseName, {
                filter: {
                    courseName: courseName,
                    id: id,
                }
            });
            return result;
        }

        //get all documents from qdrant
        if (!contentTitle) {
            result = await this.qdrantClient.scroll(courseName, {
                filter: {
                    courseName: courseName,
                }
            });
        }
        else if (!subcontentTitle) {
            result = await this.qdrantClient.scroll(courseName, {
                filter: {
                    courseName: courseName,
                    contentTitle: contentTitle,
                }
            });
        }
        else if (!chunkNumber) {
            result = await this.qdrantClient.scroll(courseName, {
                filter: {
                    courseName: courseName,
                    contentTitle: contentTitle,
                    subcontentTitle: subcontentTitle,
                }
            });
        }
        else {
            result = await this.qdrantClient.scroll(courseName, {
                filter: {
                    courseName: courseName,
                    contentTitle: contentTitle,
                    subcontentTitle: subcontentTitle,
                    chunkNumber: chunkNumber,
                }
            });
        }
        //if subcontentTitle is not provided, return all documents
        return result;
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

// // Routes

const qdrantUpload = new QdrantUpload(qdrantClient);

// POST /api/qdrant/documents - Upload a document
router.post('/documents/:courseName/:contentTitle/:subContentTitle', validateDocument, asyncHandler(async (req: Request, res: Response) => {
    try {
        const result = await qdrantUpload.uploadTextToQdrant(req.body.text, req.body.vector);
        res.status(200).json(result);
    } catch (error) {
        throw {
            status: 500,
            message: 'Failed to upload document to Qdrant',
            details: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}));

// GET /api/qdrant/documents/:courseName - Get all documents from Qdrant for a specific course
router.get('/documents/:courseName', asyncHandler(async (req: Request, res: Response) => {
    const result = await qdrantUpload.getDocumentFromQdrant(req.params.courseName);
    res.status(200).json(result);
}));

// GET /api/qdrant/documents/:courseName/:contentTitle - Get all chunks from Qdrant for a specific content title
router.get('/documents/:courseName/:contentTitle', asyncHandler(async (req: Request, res: Response) => {
    const result = await qdrantUpload.getDocumentFromQdrant(req.params.courseName, req.params.contentTitle);
    res.status(200).json(result);
}));

// GET /api/qdrant/documents/:courseName/:contentTitle/:subContentTitle - Get all chunks from Qdrant for a specific subcontent title
router.get('/documents/:courseName/:contentTitle/:subContentTitle', asyncHandler(async (req: Request, res: Response) => {
    const result = await qdrantUpload.getDocumentFromQdrant(req.params.courseName, req.params.contentTitle, req.params.subContentTitle);
    res.status(200).json(result);
}));

// GET /api/qdrant/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber - Get a specific chunk from Qdrant
router.get('/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber', asyncHandler(async (req: Request, res: Response) => {
    const result = await qdrantUpload.getDocumentFromQdrant(req.params.courseName, req.params.contentTitle, req.params.subContentTitle, parseInt(req.params.chunkNumber));
    res.status(200).json(result);
}));











export default router;


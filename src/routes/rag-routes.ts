/**
 * RAG API Routes
 *
 * Express routes for document upload, retrieval, and RAG operations.
 * Uses RAGApp from functions for business logic.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { RAGApp } from '../functions/rag-app';
import { AdditionalMaterial } from '../functions/types';
import { asyncHandlerWithAuth } from '../middleware/asyncHandler';
import { requireInstructorForCourseAPI } from '../middleware/requireCourseRole';

// Extend Request interface to include file property from multer
interface MulterRequest extends Request {
    file?: Express.Multer.File;
}

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req: any, file: any, cb: any) => {
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/html', 'text/markdown', 'text/plain'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, DOCX, HTML, MD, and TXT files are allowed.'));
        }
    }
});

// Validation middleware for text documents
const validateTextDocument = (req: Request, res: Response, next: Function) => {
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

    if (!doc.name || !doc.courseName || !doc.topicOrWeekTitle || !doc.itemTitle) {
        return res.status(400).json({
            status: 400,
            message: 'Missing required fields: name, courseName, topicOrWeekTitle, itemTitle'
        });
    }

    next();
};

// Validation middleware for file documents
const validateFileDocument = (req: MulterRequest, res: Response, next: Function) => {
    const doc = req.body;

    if (!doc) {
        return res.status(400).json({
            status: 400,
            message: 'Request body is required'
        });
    }

    if (!req.file) {
        return res.status(400).json({
            status: 400,
            message: 'File is required for file upload'
        });
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (req.file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
            status: 400,
            message: `File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        });
    }

    const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/html',
        'text/markdown',
        'text/plain'
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
            status: 400,
            message: `Unsupported file type: ${req.file.mimetype}. Supported types: PDF, DOCX, HTML, Markdown, TXT`
        });
    }

    const originalName = req.file.originalname || '';
    if (!originalName) {
        return res.status(400).json({
            status: 400,
            message: 'File original name is required'
        });
    }
    const fileExtension = originalName.split('.').pop()?.toLowerCase();
    const supportedExtensions = ['pdf', 'docx', 'html', 'htm', 'md', 'txt'];

    if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
        return res.status(400).json({
            status: 400,
            message: `Unsupported file extension: ${fileExtension}. Supported extensions: ${supportedExtensions.join(', ')}`
        });
    }

    if (!doc.name || !doc.courseName || !doc.topicOrWeekTitle || !doc.itemTitle) {
        return res.status(400).json({
            status: 400,
            message: 'Missing required fields: name, courseName, topicOrWeekTitle, itemTitle'
        });
    }

    next();
};

// POST /api/rag/documents/text - Upload a text document (REQUIRES AUTH - Instructors only)
router.post('/documents/text', validateTextDocument, requireInstructorForCourseAPI(['body', 'session']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🔍 BACKEND UPLOAD TEXT - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Body:', req.body);
        console.log('  User:', req.user);

        const ragApp = await RAGApp.getInstance();

        const document: AdditionalMaterial = {
            id: '',
            date: new Date(),
            name: req.body.name,
            courseName: req.body.courseName,
            topicOrWeekTitle: req.body.topicOrWeekTitle,
            itemTitle: req.body.itemTitle,
            sourceType: 'text',
            text: req.body.text,
            uploaded: false,
        };

        const result = await ragApp.uploadDocument(document);

        console.log('🔍 BACKEND UPLOAD TEXT - RAG Upload Result:', result);

        if (result.uploaded && result.qdrantId) {
            try {
                const { courseId, topicOrWeekId, itemId } = req.body;

                if (courseId && topicOrWeekId && itemId) {
                    const materialWithUser = {
                        ...result,
                        uploadedBy: (req.user as any)?.puid || 'system'
                    };

                    await ragApp.mongoDBInstance.addAdditionalMaterial(courseId, topicOrWeekId, itemId, materialWithUser);
                    console.log('✅ Document metadata stored in MongoDB');
                }
            } catch (mongoError) {
                console.error('Failed to store document metadata in MongoDB:', mongoError);
            }
        }

        res.status(201).json({
            status: 201,
            message: 'Document uploaded successfully',
            data: {
                id: result.id,
                name: result.name,
                uploaded: result.uploaded,
                qdrantId: result.qdrantId,
                chunksGenerated: result.chunksGenerated || 0
            }
        });

    } catch (error) {
        res.status(500).json({
            status: 500,
            message: 'Failed to upload text document',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// POST /api/rag/documents/file - Upload a file document (REQUIRES AUTH - Instructors only)
router.post('/documents/file', upload.single('file'), validateFileDocument, requireInstructorForCourseAPI(['body', 'session']), asyncHandlerWithAuth(async (req: MulterRequest, res: Response) => {
    try {
        console.log('🔍 BACKEND UPLOAD FILE - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Body:', req.body);
        console.log('  File:', req.file);
        console.log('  User:', req.user);

        const ragApp = await RAGApp.getInstance();

        if (!req.file) {
            return res.status(400).json({
                status: 400,
                message: 'File is required'
            });
        }

        const document: AdditionalMaterial = {
            id: '',
            date: new Date(),
            name: req.body.name,
            courseName: req.body.courseName,
            topicOrWeekTitle: req.body.topicOrWeekTitle,
            itemTitle: req.body.itemTitle,
            sourceType: 'file',
            file: req.file as any,
            fileName: req.file.originalname,
            uploaded: false,
        };

        const result = await ragApp.uploadDocument(document);

        if (result.uploaded && result.qdrantId) {
            try {
                const { courseId, topicOrWeekId, itemId } = req.body;

                if (courseId && topicOrWeekId && itemId) {
                    const materialWithUser = {
                        ...result,
                        uploadedBy: (req.user as any)?.puid || 'system'
                    };

                    await ragApp.mongoDBInstance.addAdditionalMaterial(courseId, topicOrWeekId, itemId, materialWithUser);
                    console.log('✅ Document metadata stored in MongoDB');
                }
            } catch (mongoError) {
                console.error('Failed to store document metadata in MongoDB:', mongoError);
            }
        }

        res.status(201).json({
            status: 201,
            message: 'File uploaded and processed successfully',
            data: {
                id: result.id,
                name: result.name,
                fileName: result.fileName,
                uploaded: result.uploaded,
                qdrantId: result.qdrantId,
                chunksGenerated: result.chunksGenerated || 0
            }
        });

    } catch (error) {
        res.status(500).json({
            status: 500,
            message: 'Failed to upload file document',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// GET /api/rag/documents/:courseName - Get all documents from Qdrant for a specific course (REQUIRES AUTH)
router.get('/documents/:courseName', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    res.status(501).json({ message: 'Not implemented yet' });
}));

// GET /api/rag/documents/:courseName/:contentTitle - Get all chunks from Qdrant for a specific content title (REQUIRES AUTH)
router.get('/documents/:courseName/:contentTitle', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    res.status(501).json({ message: 'Not implemented yet' });
}));

// GET /api/rag/documents/:courseName/:contentTitle/:subContentTitle - Get all chunks from Qdrant for a specific subcontent title (REQUIRES AUTH)
router.get('/documents/:courseName/:contentTitle/:subContentTitle', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    res.status(501).json({ message: 'Not implemented yet' });
}));

// GET /api/rag/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber - Get a specific chunk from Qdrant (REQUIRES AUTH)
router.get('/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    res.status(501).json({ message: 'Not implemented yet' });
}));

// POST /api/rag/search - Search for similar documents using vector similarity (REQUIRES AUTH)
router.post('/search', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    res.status(501).json({ message: 'Not implemented yet' });
}));

// DELETE /api/rag/wipe-all - Wipe all documents from RAG database for a specific course (REQUIRES AUTH - Instructors only)
router.delete('/wipe-all', requireInstructorForCourseAPI(['query', 'body', 'session']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🔍 BACKEND WIPE ALL DOCUMENTS - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Body:', req.body);
        console.log('  Query:', req.query);
        console.log('  User:', req.user);

        const courseId = req.query.courseId as string;
        if (!courseId) {
            return res.status(400).json({
                status: 400,
                message: 'courseId query parameter is required'
            });
        }

        const ragApp = await RAGApp.getInstance();
        const result = await ragApp.deleteAllDocumentsForCourseWithBreakdown(courseId);

        // Clear MongoDB additional materials
        await ragApp.mongoDBInstance.clearAllAdditionalMaterials(courseId);

        console.log('🔍 BACKEND WIPE ALL DOCUMENTS - Result:', { courseId, totalChunksDeleted: result.totalChunksDeleted, deletedDocuments: result.deletedDocuments.length, errors: result.errors });

        res.status(200).json({
            status: 200,
            message: `All documents wiped from RAG database for course ${courseId} successfully`,
            data: {
                courseId: courseId,
                deletedDocuments: result.deletedDocuments,
                totalChunksDeleted: result.totalChunksDeleted,
                errors: result.errors
            }
        });

    } catch (error) {
        console.error('❌ Failed to wipe RAG database:', error);
        res.status(500).json({
            status: 500,
            message: 'Failed to wipe RAG database',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

export default router;

import { RAGModule } from "ubc-genai-toolkit-rag";
import { AppConfig, loadConfig } from "./config";
import express, { Request, Response } from 'express';
import { LoggerInterface } from "ubc-genai-toolkit-core";
import { LLMModule } from "ubc-genai-toolkit-llm";
import { DocumentParsingModule } from "ubc-genai-toolkit-document-parsing";
import { AdditionalMaterial } from "../functions/types";
import { EngEAI_MongoDB } from "./mongodb";
import { IDGenerator } from "../functions/unique-id-generator";
import path from "path";
import fs from "fs";
import multer from "multer";

// Extend Request interface to include file property from multer
interface MulterRequest extends Request {
    file?: Express.Multer.File;
}

//initialize RAGApp
let ragApp: RAGApp;
const config = loadConfig();
const logger = config.logger;
const router = express.Router();


/**
 * QDRANT upload using RAGModule from UBC GenAI Toolkit
 */

class RAGApp {
    
    private rag: RAGModule;
    private llm: LLMModule;
    private logger: LoggerInterface;
    private config: AppConfig;
    static instance: RAGApp;
    private mongoDB: EngEAI_MongoDB;
    private idGenerator: IDGenerator;
    private documentParser: DocumentParsingModule;

    private constructor(config: AppConfig) {
        this.config = config;
        this.llm = new LLMModule(config.llmConfig);
        this.logger = config.logger;
        this.rag = {} as RAGModule; // initialize later
        this.mongoDB = {} as EngEAI_MongoDB; // initialize later
        this.idGenerator = IDGenerator.getInstance();
        this.documentParser = new DocumentParsingModule();
    }

    async initialize() {
        if (RAGApp.instance) {
            this.logger.info('✅ RAGApp already initialized');
            return;
        }

        try {
            this.logger.info('Initializing RAGApp...');
            this.logger.info(`Using LLM Provider: ${this.config.llmConfig.provider}`);
            
            // Initialize RAG module
            this.rag = await RAGModule.create(this.config.ragConfig);
            this.logger.info('✅ RAGModule initialized successfully');
            
            // Initialize MongoDB
            this.mongoDB = await EngEAI_MongoDB.getInstance();
            this.logger.info('✅ EngEAI_MongoDB initialized successfully');
            
            // Set the instance
            RAGApp.instance = this;
            this.logger.info('✅ RAGApp initialized successfully');
            
        } catch (error) {
            this.logger.error('❌ Failed to initialize RAGApp:', {error: error});
            throw error;
        }
    }

    public static async getInstance(): Promise<RAGApp> {
        if (!this.instance) {
            this.instance = new RAGApp(config);
            await this.instance.initialize();
        }
        return this.instance;
    }


    /**
     * Upload document to RAG
     * 
     * @param document - The document to upload
     * @returns The result of the upload with updated metadata
     */
    async uploadDocument(document: AdditionalMaterial): Promise<AdditionalMaterial> {
        if (!RAGApp.instance) {
            await this.initialize();
        }

        try {
            // Validate document invariant: it must be either text or file, not both
            if (!document.text && !document.file) {
                throw new Error('Document must be either a text or a file');
            }
            if (document.text && document.file) {
                throw new Error('Document must be either a text or a file, not both');
            }

            let fullDocument: AdditionalMaterial;
            let documentText: string;
            // let qdrantIds: string[] = []; // COMMENTED OUT FOR TESTING

            if (document.sourceType === 'text') {
                if (!document.text) {
                    throw new Error('Document text is required for text source type');
                }

                documentText = document.text;

                // Create full instance of the document
                fullDocument = {
                    id: this.idGenerator.uploadContentID(document, document.itemTitle, document.divisionTitle, document.courseName),
                    date: new Date(),
                    name: document.name,
                    courseName: document.courseName,
                    divisionTitle: document.divisionTitle,
                    itemTitle: document.itemTitle,
                    sourceType: document.sourceType,
                    text: document.text,
                    uploaded: false,
                    qdrantId: undefined,
                };

            } else if (document.sourceType === 'file') {
                if (!document.file) {
                    throw new Error('File is required for file source type');
                }

                // Validate file extension
                const fileExtension = document.file.name.split('.').pop()?.toLowerCase();
                const supportedExtensions = ['docx', 'md', 'pdf', 'html', 'htm', 'txt'];
                
                if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
                    throw new Error(`Unsupported file type: ${fileExtension}. Supported types: ${supportedExtensions.join(', ')}`);
                }

                // Create temp directory if it doesn't exist
                const tempDir = path.join(__dirname, 'tempfiles');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                
                this.logger.info(`📂 Temp directory: ${tempDir}`);

                // Save file to temp directory
                const fileName = `${Date.now()}-${document.file.name}`;
                const filePath = path.join(tempDir, fileName);
                // For multer files, use buffer property
                fs.writeFileSync(filePath, (document.file as any).buffer);
                
                this.logger.info(`📁 File saved to tempfiles: ${filePath}`);

                try {
                    // Parse the document using DocumentParsingModule
                    const parseResult = await this.documentParser.parse(
                        { filePath: filePath },
                        'text'
                    );

                    documentText = parseResult.content;

                    // Create full instance of the document
                    fullDocument = {
                        id: this.idGenerator.uploadContentID(document, document.itemTitle, document.divisionTitle, document.courseName),
                        date: new Date(),
                        name: document.name,
                        courseName: document.courseName,
                        divisionTitle: document.divisionTitle,
                        itemTitle: document.itemTitle,
                        sourceType: document.sourceType,
                        file: document.file,
                        fileName: document.fileName,
                        uploaded: false,
                        qdrantId: undefined,
                    };

                } finally {
                    // Clean up temp file - COMMENTED OUT FOR TESTING
                    // if (fs.existsSync(filePath)) {
                    //     fs.unlinkSync(filePath);
                    // }
                }

            } else {
                throw new Error(`Unsupported source type: ${document.sourceType}`);
            }

            // Upload to RAG with metadata - COMMENTED OUT FOR TESTING
            // const metadata = {
            //     id: fullDocument.id,
            //     date: fullDocument.date.toISOString(),
            //     name: fullDocument.name,
            //     courseName: fullDocument.courseName,
            //     divisionTitle: fullDocument.divisionTitle,
            //     itemTitle: fullDocument.itemTitle,
            //     sourceType: fullDocument.sourceType,
            //     uploadedAt: new Date().toISOString(),
            // };

            // qdrantIds = await this.rag.addDocument(documentText, metadata);

            // Update document with upload results - COMMENTED OUT FOR TESTING
            // fullDocument.uploaded = true;
            // fullDocument.qdrantId = qdrantIds[0]; // Store the first chunk ID as reference
            // fullDocument.chunksGenerated = qdrantIds.length; // Add actual chunk count

            this.logger.info(`✅ Document uploaded successfully: ${fullDocument.name} (ID: ${fullDocument.id})`);
            this.logger.info(`📊 File saved to tempfiles directory for testing`);

            return fullDocument;

        } catch (error) {
            this.logger.error('❌ Failed to upload document:', { error: error, documentName: document.name });
            throw error;
        }
    }


    /**
     * Search for similar documents using RAG
     * 
     * @param query - The query to search for
     * @param courseName - The course name to search in
     * @param limit - The limit of the search
     * @param scoreThreshold - The score threshold for the search
     * @returns The result of the search
     */
    async searchDocuments(query: string, courseName?: string, limit: number = 3, scoreThreshold: number = 0.7) : Promise<any> {
        return ;
    }

    /**
     * Delete document from RAG
     * 
     * @param id - The id of the document to delete
     * @returns The result of the delete
     */
    async deleteDocument(id: string) : Promise<any> {
        return ;
    }

    /**
     * getDocument by metadata
     * 
     * @param metadata - The metadata of the document to get
     * @returns The result of the get
     */
    async getDocumentByMetadata(metadata: any) : Promise<any> {
        return ;
    }
    
     /**
      * getDocument by id
      * 
      * @param id - The id of the document to get
      * @returns The result of the get
      */
    async getDocumentById(id: string) : Promise<any> {
        return ;
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

    // // Validate required fields
    if (!doc.name || !doc.courseName || !doc.divisionTitle || !doc.itemTitle) {
        return res.status(400).json({
            status: 400,
            message: 'Missing required fields: name, courseName, divisionTitle, itemTitle'
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

    // Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (req.file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
            status: 400,
            message: `File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        });
    }

    // Validate file type by MIME type
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

    // Validate file extension as additional check
    const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();
    const supportedExtensions = ['pdf', 'docx', 'html', 'htm', 'md', 'txt'];
    
    if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
        return res.status(400).json({
            status: 400,
            message: `Unsupported file extension: ${fileExtension}. Supported extensions: ${supportedExtensions.join(', ')}`
        });
    }

    // Validate required fields
    if (!doc.name || !doc.courseName || !doc.divisionTitle || !doc.itemTitle) {
        return res.status(400).json({
            status: 400,
            message: 'Missing required fields: name, courseName, divisionTitle, itemTitle'
        });
    }

    next();
};





// POST /api/rag/documents/text - Upload a text document
router.post('/documents/text', validateTextDocument, asyncHandler(async (req: Request, res: Response) => {
    try {
        const ragApp = await RAGApp.getInstance();
        
        const document: AdditionalMaterial = {
            id: '', // Will be generated by IDGenerator
            date: new Date(),
            name: req.body.name,
            courseName: req.body.courseName,
            divisionTitle: req.body.divisionTitle,
            itemTitle: req.body.itemTitle,
            sourceType: 'text',
            text: req.body.text,
            uploaded: false,
        };

        const result = await ragApp.uploadDocument(document);

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

// POST /api/rag/documents/file - Upload a file document
router.post('/documents/file', upload.single('file'), validateFileDocument, asyncHandler(async (req: MulterRequest, res: Response) => {
    try {
        const ragApp = await RAGApp.getInstance();
        
        if (!req.file) {
            return res.status(400).json({
                status: 400,
                message: 'File is required'
            });
        }

        const document: AdditionalMaterial = {
            id: '', // Will be generated by IDGenerator
            date: new Date(),
            name: req.body.name,
            courseName: req.body.courseName,
            divisionTitle: req.body.divisionTitle,
            itemTitle: req.body.itemTitle,
            sourceType: 'file',
            file: req.file as any, // Cast to any to handle multer file type
            fileName: req.file.originalname,
            uploaded: false,
        };

        const result = await ragApp.uploadDocument(document);

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

// GET /api/qdrant/documents/:courseName - Get all documents from Qdrant for a specific course
router.get('/documents/:courseName', asyncHandler(async (req: Request, res: Response) => {

}));

// GET /api/qdrant/documents/:courseName/:contentTitle - Get all chunks from Qdrant for a specific content title
router.get('/documents/:courseName/:contentTitle', asyncHandler(async (req: Request, res: Response) => {

}));

// GET /api/qdrant/documents/:courseName/:contentTitle/:subContentTitle - Get all chunks from Qdrant for a specific subcontent title
router.get('/documents/:courseName/:contentTitle/:subContentTitle', asyncHandler(async (req: Request, res: Response) => {

}));

// GET /api/qdrant/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber - Get a specific chunk from Qdrant
router.get('/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber', asyncHandler(async (req: Request, res: Response) => {

}));

// POST /api/qdrant/search - Search for similar documents using vector similarity
router.post('/search', asyncHandler(async (req: Request, res: Response) => {
}));

// Note: Setup is now handled automatically in the QdrantUpload constructor

export default router;


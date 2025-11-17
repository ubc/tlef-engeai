import { RAGModule } from "ubc-genai-toolkit-rag";
import { AppConfig, loadConfig } from "./config";
import express, { Request, Response } from 'express';
import { LoggerInterface } from "ubc-genai-toolkit-core";
import { LLMModule } from "ubc-genai-toolkit-llm";
import { DocumentParsingModule } from "ubc-genai-toolkit-document-parsing";
import { AdditionalMaterial } from "../functions/types";
import { EngEAI_MongoDB } from "../functions/EngEAI_MongoDB";
import { IDGenerator } from "../functions/unique-id-generator";
import { asyncHandler, asyncHandlerWithAuth } from "../middleware/asyncHandler";
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

export class RAGApp {
    
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
        // Check if this instance is already initialized (not just if an instance exists)
        if (this.rag && typeof this.rag.addDocument === 'function') {
            this.logger.info('✅ RAGApp already initialized');
            return;
        }

        try {
            this.logger.info('Initializing RAGApp...');
            this.logger.info(`Using LLM Provider: ${this.config.llmConfig.provider}`);
            
            // Initialize RAG module
            this.logger.info('🔧 Creating RAG module...');
            try {
                this.rag = await RAGModule.create(this.config.ragConfig);
                this.logger.info('✅ RAGModule initialized successfully');
                this.logger.info('🔍 RAG module methods:', Object.getOwnPropertyNames(this.rag.constructor.prototype));
            } catch (error) {
                this.logger.error('❌ Failed to create RAG module:', { error: error });
                throw error;
            }
            
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

                // Create temp directory if it doesn't exist
                const tempDir = path.join(__dirname, '..', 'tempfiles');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                
                this.logger.info(`📂 Temp directory: ${tempDir}`);

                // Create a .txt file from the text content
                const textFileName = `${document.name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
                const tempFileName = `${Date.now()}-${textFileName}`;
                const filePath = path.join(tempDir, tempFileName);
                
                // Write text content to file
                fs.writeFileSync(filePath, document.text, 'utf8');
                
                this.logger.info(`📝 Text file saved to tempfiles: ${filePath}`);
                // Create temp directory if it doesn't exist
                

                // Create full instance of the document
                fullDocument = {
                    id: this.idGenerator.uploadContentID(document, document.itemTitle, document.topicOrWeekTitle, document.courseName),
                    date: new Date(),
                    name: document.name,
                    courseName: document.courseName,
                    topicOrWeekTitle: document.topicOrWeekTitle,
                    itemTitle: document.itemTitle,
                    sourceType: 'file', // Change to 'file' since we created a file
                    text: document.text,
                    fileName: textFileName,
                    uploaded: false,
                    qdrantId: undefined,
                };

            } else if (document.sourceType === 'file') {
                if (!document.file) {
                    throw new Error('File is required for file source type');
                }

                // Validate file extension
                const documentFileName = document.fileName || '';
                if (!documentFileName) {
                    throw new Error('File name is required for file source type');
                }
                const fileExtension = documentFileName.split('.').pop()?.toLowerCase();
                const supportedExtensions = ['docx', 'md', 'pdf', 'html', 'htm', 'txt'];
                
                if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
                    throw new Error(`Unsupported file type: ${fileExtension}. Supported types: ${supportedExtensions.join(', ')}`);
                }

                // Create temp directory if it doesn't exist
                const tempDir = path.join(__dirname, '..', 'tempfiles');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                
                this.logger.info(`📂 Temp directory: ${tempDir}`);

                // Save file to temp directory
                const tempFileName = `${Date.now()}-${document.fileName}`;
                const filePath = path.join(tempDir, tempFileName);
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
                        id: this.idGenerator.uploadContentID(document, document.itemTitle, document.topicOrWeekTitle, document.courseName),
                        date: new Date(),
                        name: document.name,
                        courseName: document.courseName,
                        topicOrWeekTitle: document.topicOrWeekTitle,
                        itemTitle: document.itemTitle,
                        sourceType: document.sourceType,
                        file: document.file,
                        fileName: document.fileName,
                        uploaded: false,
                        qdrantId: undefined,
                    };

                } finally {
                    // Clean up temp file - COMMENTED OUT FOR DEBUGGING
                    // this.cleanupTempFile(filePath);
                }

            } else {
                throw new Error(`Unsupported source type: ${document.sourceType}`);
            }

            // Upload to RAG with metadata
            const metadata = {
                id: fullDocument.id,
                date: fullDocument.date.toISOString(),
                name: fullDocument.name,
                courseName: fullDocument.courseName,
                topicOrWeekTitle: fullDocument.topicOrWeekTitle,
                itemTitle: fullDocument.itemTitle,
                sourceType: fullDocument.sourceType,
                uploadedAt: new Date().toISOString(),
            };

            this.logger.info(`📤 Uploading document to RAG: ${fullDocument.name}`);
            
            // Log the ACTUAL chunking configuration being used
            const documentLength = documentText.length;
            const chunkingConfig = this.config.ragConfig.chunkingConfig;
            
            this.logger.info(`📄 Document Length: ${documentLength} characters`);
            
            // Log the full chunking config for debugging
            this.logger.info(`🔧 Chunking Config Type: ${typeof chunkingConfig}`);
            this.logger.info(`🔧 Chunking Config: ${JSON.stringify(chunkingConfig, null, 2)}`);
            
            if (chunkingConfig && typeof chunkingConfig === 'object' && 'defaultOptions' in chunkingConfig) {
                const actualChunkSize = (chunkingConfig as any).defaultOptions?.chunkSize || 1024;
                const actualOverlap = (chunkingConfig as any).defaultOptions?.chunkOverlap || 200;
                const actualStrategy = (chunkingConfig as any).strategy || 'recursiveCharacter';
                
                this.logger.info(`🔧 ACTUAL Chunking Configuration:`);
                this.logger.info(`   📏 Chunk Size: ${actualChunkSize} characters`);
                this.logger.info(`   🔄 Overlap: ${actualOverlap} characters`);
                this.logger.info(`   📋 Strategy: ${actualStrategy}`);
                
                const effectiveChunkSize = actualChunkSize - actualOverlap;
                const expectedChunks = Math.ceil(documentLength / effectiveChunkSize);
                this.logger.info(`   🧮 Expected Chunks: ~${expectedChunks} (effective chunk size: ${effectiveChunkSize})`);
            } else {
                this.logger.warn(`⚠️  No chunking configuration found - using default chunker`);
            }
            
            const qdrantIds = await this.rag.addDocument(documentText, metadata);
            this.logger.info(`✅ Document uploaded to RAG successfully. Generated ${qdrantIds.length} chunks`);
            
            // Analyze results
            const actualChunks = qdrantIds.length;
            const avgChunkSize = Math.round(documentLength / actualChunks);
            this.logger.info(`📊 Results Analysis:`);
            this.logger.info(`   🎯 Actual Chunks: ${actualChunks}`);
            this.logger.info(`   📏 Average Chunk Size: ${avgChunkSize} characters`);

            // Update document with upload results
            fullDocument.uploaded = true;
            fullDocument.qdrantId = qdrantIds[0]; // Store the first chunk ID as reference
            fullDocument.chunksGenerated = qdrantIds.length; // Add actual chunk count

            this.logger.info(`✅ Document uploaded successfully: ${fullDocument.name} (ID: ${fullDocument.id})`);
            this.logger.info(`📊 Generated ${fullDocument.chunksGenerated} chunks in RAG system`);
            this.logger.info(`📁 File saved to tempfiles directory for debugging`);

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
     * @param materialId - The id of the material to delete
     * @param courseId - The course ID
     * @param topicOrWeekId - The topic/week instance ID
     * @param itemId - The item ID
     * @returns The result of the delete
     */
    async deleteDocument(materialId: string, courseId: string, topicOrWeekId: string, itemId: string): Promise<boolean> {
        try {
            // Get course to find the material and its qdrantId
            const course = await this.mongoDB.getActiveCourse(courseId);
            if (!course) {
                throw new Error('Course not found');
            }
            const instance_topicOrWeek = course.topicOrWeekInstances?.find((d: any) => d.id === topicOrWeekId);
            const item = instance_topicOrWeek?.items?.find((i: any) => i.id === itemId);
            const material = item?.additionalMaterials?.find((m: any) => m.id === materialId);
            
            if (!material || !material.qdrantId) {
                throw new Error('Material or qdrantId not found');
            }
            
            // Delete from Qdrant using the qdrantId
            await this.rag.deleteDocumentsByIds([material.qdrantId]);
            
            this.logger.info(`Deleted document from Qdrant: ${material.qdrantId}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to delete document from Qdrant:', error as any);
            throw error;
        }
    }

    /**
     * Delete all documents for a course from Qdrant
     * 
     * @param courseId - The course ID
     * @returns Statistics about the deletion
     */
    async deleteAllDocumentsForCourse(courseId: string): Promise<{ deletedCount: number, errors: string[] }> {
        try {
            const course = await this.mongoDB.getActiveCourse(courseId);
            if (!course) {
                throw new Error('Course not found');
            }

            const qdrantIds: string[] = [];
            const errors: string[] = [];

            // Collect all qdrantIds from all materials
            course.topicOrWeekInstances?.forEach((instance_topicOrWeek: any) => {
                instance_topicOrWeek.items?.forEach((item: any) => {
                    item.additionalMaterials?.forEach((material: any) => {
                        if (material.qdrantId) {
                            qdrantIds.push(material.qdrantId);
                        }
                    });
                });
            });

            if (qdrantIds.length === 0) {
                this.logger.info('No documents found to delete');
                return { deletedCount: 0, errors: [] };
            }

            // Use bulk delete for efficiency
            await this.rag.deleteDocumentsByIds(qdrantIds);
            
            this.logger.info(`Deleted ${qdrantIds.length} documents from Qdrant`);
            return { deletedCount: qdrantIds.length, errors };
        } catch (error) {
            this.logger.error('Failed to delete all documents from Qdrant:', error as any);
            throw error;
        }
    }

    /**
     * Wipe all documents from RAG database for a specific course
     * Based on clear-rag-database.ts approach but filtered by course
     * 
     * @param courseId - The course ID to filter documents by
     * @returns Statistics about the deletion
     */
    async WipeRAGDatabase(courseId: string): Promise<{ deletedCount: number, errors: string[] }> {
        const errors: string[] = [];
        
        try {
            this.logger.info('🚀 Starting RAG database wipe process for course:', { courseId });
            this.logger.info('⚠️  WARNING: This will permanently delete ALL documents from this course!');
            
            // Get course from MongoDB to find all qdrantIds
            const course = await this.mongoDB.getActiveCourse(courseId);
            if (!course) {
                throw new Error('Course not found');
            }

            const qdrantIds: string[] = [];
            let mongoMaterialCount = 0;

            // Collect all qdrantIds from all materials in the course
            this.logger.info('📊 Collecting document IDs from course materials...');
            course.topicOrWeekInstances?.forEach((instance_topicOrWeek: any) => {
                instance_topicOrWeek.items?.forEach((item: any) => {
                    item.additionalMaterials?.forEach((material: any) => {
                        mongoMaterialCount++;
                        if (material.qdrantId) {
                            qdrantIds.push(material.qdrantId);
                        }
                    });
                });
            });

            this.logger.info(`📈 Found ${mongoMaterialCount} materials in MongoDB, ${qdrantIds.length} with Qdrant IDs`);

            if (qdrantIds.length === 0) {
                this.logger.info('✅ No documents found to delete for this course');
                return { deletedCount: 0, errors: [] };
            }
            
            // Method 1: Delete documents by IDs from Qdrant
            this.logger.info('🗑️  Attempting to delete documents by IDs from Qdrant...');
            try {
                this.logger.info(`📋 Deleting ${qdrantIds.length} document IDs from Qdrant`);
                await this.rag.deleteDocumentsByIds(qdrantIds);
                this.logger.info('✅ Documents deleted from Qdrant successfully');
                
                // Clear all AdditionalMaterial from MongoDB for this course
                this.logger.info('🗑️  Clearing AdditionalMaterial from MongoDB...');
                await this.mongoDB.clearAllAdditionalMaterials(courseId);
                this.logger.info('✅ AdditionalMaterial cleared from MongoDB successfully');
                
                return { deletedCount: qdrantIds.length, errors: [] };
                
            } catch (error) {
                this.logger.warn('⚠️  ID-based deletion failed:', { error: error instanceof Error ? error.message : String(error) });
                errors.push(`ID-based deletion failed: ${error instanceof Error ? error.message : String(error)}`);
                
                // Method 2: Try to delete by course metadata filter
                this.logger.info('🔄 Attempting to delete by course metadata filter...');
                try {
                    // Get documents by course metadata
                    const courseDocuments = await this.rag.getDocumentsByMetadata({ courseName: course.courseName });
                    const courseDocumentIds = courseDocuments.map(doc => doc.id);
                    
                    if (courseDocumentIds.length > 0) {
                        this.logger.info(`📋 Found ${courseDocumentIds.length} documents by course metadata`);
                        await this.rag.deleteDocumentsByIds(courseDocumentIds);
                        this.logger.info('✅ Documents deleted by course metadata successfully');
                        
                        // Clear MongoDB materials
                        await this.mongoDB.clearAllAdditionalMaterials(courseId);
                        
                        return { deletedCount: courseDocumentIds.length, errors: [] };
                    } else {
                        this.logger.info('✅ No documents found by course metadata');
                        return { deletedCount: 0, errors: [] };
                    }
                } catch (metadataError) {
                    this.logger.error('❌ Course metadata deletion also failed:', { error: metadataError });
                    errors.push(`Course metadata deletion failed: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`);
                    throw metadataError;
                }
            }
            
        } catch (error) {
            this.logger.error('❌ Error during RAG database wipe process:', { error: error });
            errors.push(`Wipe process failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Nuclear clear - delete entire Qdrant collection (nuclear option)
     * Based on nuclear-clear-rag.ts approach
     * 
     * @returns Statistics about the deletion
     */
    async NuclearClearRAGDatabase(): Promise<{ deletedCount: number, errors: string[] }> {
        const errors: string[] = [];
        
        try {
            this.logger.info('💥 Starting NUCLEAR RAG database clearing process...');
            this.logger.info('⚠️  WARNING: This will permanently delete the ENTIRE COLLECTION!');
            this.logger.info('⚠️  WARNING: This is irreversible and will remove all data!');
            
            // Get current document count before deletion
            this.logger.info('📊 Checking current document count...');
            let documentCount = 0;
            try {
                const allDocuments = await this.rag.getDocumentsByMetadata({});
                documentCount = allDocuments.length;
                this.logger.info(`📈 Found ${documentCount} documents in the collection`);
                
                if (documentCount === 0) {
                    this.logger.info('✅ Collection is already empty. Proceeding with collection deletion...');
                }
            } catch (error) {
                this.logger.warn('⚠️  Could not retrieve document count (collection may not exist)');
            }
            
            // Nuclear option: Delete entire storage container (collection)
            this.logger.info('💥 Executing NUCLEAR OPTION: Deleting entire collection...');
            try {
                await this.rag.deleteStorage();
                this.logger.info('✅ Collection deleted successfully');
                
                return { deletedCount: documentCount, errors: [] };
            } catch (error) {
                this.logger.error('❌ Collection deletion failed:', { error: error instanceof Error ? error.message : String(error) });
                errors.push(`Collection deletion failed: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
            
        } catch (error) {
            this.logger.error('❌ Error during nuclear RAG database clearing process:', { error: error });
            errors.push(`Nuclear clear process failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
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

    /**
     * Clean up temporary file after processing
     * 
     * @param filePath - Path to the temporary file to delete
     */
    private cleanupTempFile(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                this.logger.info(`🗑️ Cleaned up temp file: ${filePath}`);
            }
        } catch (error) {
            this.logger.warn(`⚠️ Failed to clean up temp file ${filePath}:`, { error: error });
        }
    }
    
    
}

// Note: Using asyncHandlerWithAuth from middleware instead of local asyncHandler

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

    // Validate required fields
    if (!doc.name || !doc.courseName || !doc.topicOrWeekTitle || !doc.itemTitle) {
        return res.status(400).json({
            status: 400,
            message: 'Missing required fields: name, courseName, topicOrWeekTitle, itemTitle'
        });
    }

    next();
};





// POST /api/rag/documents/text - Upload a text document (REQUIRES AUTH)
router.post('/documents/text', validateTextDocument, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🔍 BACKEND UPLOAD TEXT - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Body:', req.body);
        console.log('  User:', req.user);
        
        const ragApp = await RAGApp.getInstance();
        
        const document: AdditionalMaterial = {
            id: '', // Will be generated by IDGenerator
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

        console.log('🔍 BACKEND UPLOAD TEXT - RAG Upload Result:');
        console.log('  Result:', result);

        // Store metadata in MongoDB if upload was successful
        if (result.uploaded && result.qdrantId) {
            try {
                // Extract courseId, topicOrWeekId, and itemId from request body
                const { courseId, topicOrWeekId, itemId } = req.body;
                
                console.log('🔍 BACKEND UPLOAD TEXT - MongoDB Storage Details:');
                console.log('  CourseId:', courseId);
                console.log('  TopicOrWeekId:', topicOrWeekId);
                console.log('  ItemId:', itemId);
                
                if (!courseId || !topicOrWeekId || !itemId) {
                    console.warn('Missing courseId, topicOrWeekId, or itemId for MongoDB storage');
                } else {
                    // Add uploadedBy field from authenticated user
                    const materialWithUser = {
                        ...result,
                        uploadedBy: (req.user as any)?.puid || 'system'
                    };
                    
                    console.log('🔍 BACKEND UPLOAD TEXT - Material with User:');
                    console.log('  Material:', materialWithUser);
                    
                    await ragApp['mongoDB'].addAdditionalMaterial(courseId, topicOrWeekId, itemId, materialWithUser);
                    console.log('✅ Document metadata stored in MongoDB');
                }
            } catch (mongoError) {
                console.error('Failed to store document metadata in MongoDB:', mongoError);
                // Don't fail the entire request if MongoDB storage fails
            }
        }

        console.log('🔍 BACKEND UPLOAD TEXT - Response Data:');
        console.log('  Response:', {
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

// POST /api/rag/documents/file - Upload a file document (REQUIRES AUTH)
router.post('/documents/file', upload.single('file'), validateFileDocument, asyncHandlerWithAuth(async (req: MulterRequest, res: Response) => {
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
            id: '', // Will be generated by IDGenerator
            date: new Date(),
            name: req.body.name,
            courseName: req.body.courseName,
            topicOrWeekTitle: req.body.topicOrWeekTitle,
            itemTitle: req.body.itemTitle,
            sourceType: 'file',
            file: req.file as any, // Cast to any to handle multer file type
            fileName: req.file.originalname,
            uploaded: false,
        };

        const result = await ragApp.uploadDocument(document);

        // Store metadata in MongoDB if upload was successful
        if (result.uploaded && result.qdrantId) {
            try {
                // Extract courseId, topicOrWeekId, and itemId from request body
                const { courseId, topicOrWeekId, itemId } = req.body;
                
                if (!courseId || !topicOrWeekId || !itemId) {
                    console.warn('Missing courseId, topicOrWeekId, or itemId for MongoDB storage');
                } else {
                    // Add uploadedBy field from authenticated user
                    const materialWithUser = {
                        ...result,
                        uploadedBy: (req.user as any)?.puid || 'system'
                    };
                    
                    await ragApp['mongoDB'].addAdditionalMaterial(courseId, topicOrWeekId, itemId, materialWithUser);
                    console.log('✅ Document metadata stored in MongoDB');
                }
            } catch (mongoError) {
                console.error('Failed to store document metadata in MongoDB:', mongoError);
                // Don't fail the entire request if MongoDB storage fails
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
    // TODO: Implement document retrieval by course
    res.status(501).json({ message: 'Not implemented yet' });
}));

// GET /api/rag/documents/:courseName/:contentTitle - Get all chunks from Qdrant for a specific content title (REQUIRES AUTH)
router.get('/documents/:courseName/:contentTitle', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    // TODO: Implement document retrieval by content title
    res.status(501).json({ message: 'Not implemented yet' });
}));

// GET /api/rag/documents/:courseName/:contentTitle/:subContentTitle - Get all chunks from Qdrant for a specific subcontent title (REQUIRES AUTH)
router.get('/documents/:courseName/:contentTitle/:subContentTitle', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    // TODO: Implement document retrieval by subcontent title
    res.status(501).json({ message: 'Not implemented yet' });
}));

// GET /api/rag/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber - Get a specific chunk from Qdrant (REQUIRES AUTH)
router.get('/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    // TODO: Implement specific chunk retrieval
    res.status(501).json({ message: 'Not implemented yet' });
}));

// POST /api/rag/search - Search for similar documents using vector similarity (REQUIRES AUTH)
router.post('/search', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    // TODO: Implement document search
    res.status(501).json({ message: 'Not implemented yet' });
}));

// DELETE /api/rag/wipe-all - Wipe all documents from RAG database for a specific course (REQUIRES AUTH)
router.delete('/wipe-all', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🔍 BACKEND WIPE ALL DOCUMENTS - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Body:', req.body);
        console.log('  Query:', req.query);
        console.log('  User:', req.user);
        
        // Get courseId from query parameters
        const courseId = req.query.courseId as string;
        if (!courseId) {
            return res.status(400).json({
                status: 400,
                message: 'courseId query parameter is required'
            });
        }
        
        const ragApp = await RAGApp.getInstance();
        
        // Call the WipeRAGDatabase method with courseId
        const result = await ragApp.WipeRAGDatabase(courseId);
        
        console.log('🔍 BACKEND WIPE ALL DOCUMENTS - Result:');
        console.log('  CourseId:', courseId);
        console.log('  Deleted Count:', result.deletedCount);
        console.log('  Errors:', result.errors);
        
        res.status(200).json({
            status: 200,
            message: `All documents wiped from RAG database for course ${courseId} successfully`,
            data: {
                courseId: courseId,
                deletedCount: result.deletedCount,
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

// DELETE /api/rag/nuclear-clear - Nuclear clear entire RAG collection (REQUIRES AUTH)
router.delete('/nuclear-clear', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🔍 BACKEND NUCLEAR CLEAR - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Body:', req.body);
        console.log('  User:', req.user);
        
        const ragApp = await RAGApp.getInstance();
        
        // Call the NuclearClearRAGDatabase method
        const result = await ragApp.NuclearClearRAGDatabase();
        
        console.log('🔍 BACKEND NUCLEAR CLEAR - Result:');
        console.log('  Deleted Count:', result.deletedCount);
        console.log('  Errors:', result.errors);
        
        res.status(200).json({
            status: 200,
            message: 'Nuclear clear completed - entire RAG collection deleted successfully',
            data: {
                deletedCount: result.deletedCount,
                errors: result.errors
            }
        });
        
    } catch (error) {
        console.error('❌ Failed to nuclear clear RAG database:', error);
        res.status(500).json({
            status: 500,
            message: 'Failed to nuclear clear RAG database',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// Note: Setup is now handled automatically in the QdrantUpload constructor

export default router;


"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGApp = void 0;
const ubc_genai_toolkit_rag_1 = require("ubc-genai-toolkit-rag");
const config_1 = require("./config");
const express_1 = __importDefault(require("express"));
const ubc_genai_toolkit_llm_1 = require("ubc-genai-toolkit-llm");
const ubc_genai_toolkit_document_parsing_1 = require("ubc-genai-toolkit-document-parsing");
const EngEAI_MongoDB_1 = require("../functions/EngEAI_MongoDB");
const unique_id_generator_1 = require("../functions/unique-id-generator");
const asyncHandler_1 = require("../middleware/asyncHandler");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
//initialize RAGApp
let ragApp;
const config = (0, config_1.loadConfig)();
const logger = config.logger;
const router = express_1.default.Router();
/**
 * QDRANT upload using RAGModule from UBC GenAI Toolkit
 */
class RAGApp {
    constructor(config) {
        this.config = config;
        this.llm = new ubc_genai_toolkit_llm_1.LLMModule(config.llmConfig);
        this.logger = config.logger;
        this.rag = {}; // initialize later
        this.mongoDB = {}; // initialize later
        this.idGenerator = unique_id_generator_1.IDGenerator.getInstance();
        this.documentParser = new ubc_genai_toolkit_document_parsing_1.DocumentParsingModule();
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
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
                    this.rag = yield ubc_genai_toolkit_rag_1.RAGModule.create(this.config.ragConfig);
                    this.logger.info('✅ RAGModule initialized successfully');
                    this.logger.info('🔍 RAG module methods:', Object.getOwnPropertyNames(this.rag.constructor.prototype));
                }
                catch (error) {
                    this.logger.error('❌ Failed to create RAG module:', { error: error });
                    throw error;
                }
                // Initialize MongoDB
                this.mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
                this.logger.info('✅ EngEAI_MongoDB initialized successfully');
                // Set the instance
                RAGApp.instance = this;
                this.logger.info('✅ RAGApp initialized successfully');
            }
            catch (error) {
                this.logger.error('❌ Failed to initialize RAGApp:', { error: error });
                throw error;
            }
        });
    }
    static getInstance() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.instance) {
                this.instance = new RAGApp(config);
                yield this.instance.initialize();
            }
            return this.instance;
        });
    }
    /**
     * Upload document to RAG
     *
     * @param document - The document to upload
     * @returns The result of the upload with updated metadata
     */
    uploadDocument(document) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            if (!RAGApp.instance) {
                yield this.initialize();
            }
            try {
                // Validate document invariant: it must be either text or file, not both
                if (!document.text && !document.file) {
                    throw new Error('Document must be either a text or a file');
                }
                if (document.text && document.file) {
                    throw new Error('Document must be either a text or a file, not both');
                }
                let fullDocument;
                let documentText;
                // let qdrantIds: string[] = []; // COMMENTED OUT FOR TESTING
                if (document.sourceType === 'text') {
                    if (!document.text) {
                        throw new Error('Document text is required for text source type');
                    }
                    documentText = document.text;
                    // Create temp directory if it doesn't exist
                    const tempDir = path_1.default.join(__dirname, '..', 'tempfiles');
                    if (!fs_1.default.existsSync(tempDir)) {
                        fs_1.default.mkdirSync(tempDir, { recursive: true });
                    }
                    this.logger.info(`📂 Temp directory: ${tempDir}`);
                    // Create a .txt file from the text content
                    const textFileName = `${document.name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
                    const tempFileName = `${Date.now()}-${textFileName}`;
                    const filePath = path_1.default.join(tempDir, tempFileName);
                    // Write text content to file
                    fs_1.default.writeFileSync(filePath, document.text, 'utf8');
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
                }
                else if (document.sourceType === 'file') {
                    if (!document.file) {
                        throw new Error('File is required for file source type');
                    }
                    // Validate file extension
                    const documentFileName = document.fileName || '';
                    if (!documentFileName) {
                        throw new Error('File name is required for file source type');
                    }
                    const fileExtension = (_a = documentFileName.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                    const supportedExtensions = ['docx', 'md', 'pdf', 'html', 'htm', 'txt'];
                    if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
                        throw new Error(`Unsupported file type: ${fileExtension}. Supported types: ${supportedExtensions.join(', ')}`);
                    }
                    // Create temp directory if it doesn't exist
                    const tempDir = path_1.default.join(__dirname, '..', 'tempfiles');
                    if (!fs_1.default.existsSync(tempDir)) {
                        fs_1.default.mkdirSync(tempDir, { recursive: true });
                    }
                    this.logger.info(`📂 Temp directory: ${tempDir}`);
                    // Save file to temp directory
                    const tempFileName = `${Date.now()}-${document.fileName}`;
                    const filePath = path_1.default.join(tempDir, tempFileName);
                    // For multer files, use buffer property
                    fs_1.default.writeFileSync(filePath, document.file.buffer);
                    this.logger.info(`📁 File saved to tempfiles: ${filePath}`);
                    try {
                        // Parse the document using DocumentParsingModule
                        const parseResult = yield this.documentParser.parse({ filePath: filePath }, 'text');
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
                    }
                    finally {
                        // Clean up temp file - COMMENTED OUT FOR DEBUGGING
                        // this.cleanupTempFile(filePath);
                    }
                }
                else {
                    throw new Error(`Unsupported source type: ${document.sourceType}`);
                }
                // Get learning objectives from the course item
                let learningObjectives = [];
                try {
                    const course = yield this.mongoDB.getCourseByName(fullDocument.courseName);
                    if (course) {
                        // Find the topic/week instance that matches topicOrWeekTitle
                        const topicOrWeekInstance = (_b = course.topicOrWeekInstances) === null || _b === void 0 ? void 0 : _b.find((instance) => instance.title === fullDocument.topicOrWeekTitle);
                        if (topicOrWeekInstance) {
                            // Find the item that matches itemTitle
                            const item = (_c = topicOrWeekInstance.items) === null || _c === void 0 ? void 0 : _c.find((item) => item.title === fullDocument.itemTitle || item.itemTitle === fullDocument.itemTitle);
                            if (item && item.learningObjectives) {
                                // Extract just the LearningObjective text from each objective
                                learningObjectives = item.learningObjectives.map((obj) => ({
                                    text: obj.LearningObjective || obj.learningObjective || ''
                                }));
                            }
                        }
                    }
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logger.warn(`⚠️ Could not retrieve learning objectives for ${fullDocument.itemTitle}: ${errorMessage}`);
                    // Continue without learning objectives
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
                    learningObjectives: learningObjectives
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
                    const actualChunkSize = ((_d = chunkingConfig.defaultOptions) === null || _d === void 0 ? void 0 : _d.chunkSize) || 1024;
                    const actualOverlap = ((_e = chunkingConfig.defaultOptions) === null || _e === void 0 ? void 0 : _e.chunkOverlap) || 200;
                    const actualStrategy = chunkingConfig.strategy || 'recursiveCharacter';
                    this.logger.info(`🔧 ACTUAL Chunking Configuration:`);
                    this.logger.info(`   📏 Chunk Size: ${actualChunkSize} characters`);
                    this.logger.info(`   🔄 Overlap: ${actualOverlap} characters`);
                    this.logger.info(`   📋 Strategy: ${actualStrategy}`);
                    const effectiveChunkSize = actualChunkSize - actualOverlap;
                    const expectedChunks = Math.ceil(documentLength / effectiveChunkSize);
                    this.logger.info(`   🧮 Expected Chunks: ~${expectedChunks} (effective chunk size: ${effectiveChunkSize})`);
                }
                else {
                    this.logger.warn(`⚠️  No chunking configuration found - using default chunker`);
                }
                const qdrantIds = yield this.rag.addDocument(documentText, metadata);
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
            }
            catch (error) {
                this.logger.error('❌ Failed to upload document:', { error: error, documentName: document.name });
                throw error;
            }
        });
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
    searchDocuments(query_1, courseName_1) {
        return __awaiter(this, arguments, void 0, function* (query, courseName, limit = 3, scoreThreshold = 0.7) {
            return;
        });
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
    deleteDocument(materialId, courseId, topicOrWeekId, itemId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                // Get course to find the material and its qdrantId
                const course = yield this.mongoDB.getActiveCourse(courseId);
                if (!course) {
                    throw new Error('Course not found');
                }
                const instance_topicOrWeek = (_a = course.topicOrWeekInstances) === null || _a === void 0 ? void 0 : _a.find((d) => d.id === topicOrWeekId);
                const item = (_b = instance_topicOrWeek === null || instance_topicOrWeek === void 0 ? void 0 : instance_topicOrWeek.items) === null || _b === void 0 ? void 0 : _b.find((i) => i.id === itemId);
                const material = (_c = item === null || item === void 0 ? void 0 : item.additionalMaterials) === null || _c === void 0 ? void 0 : _c.find((m) => m.id === materialId);
                if (!material || !material.qdrantId) {
                    throw new Error('Material or qdrantId not found');
                }
                // Delete from Qdrant using the qdrantId
                yield this.rag.deleteDocumentsByIds([material.qdrantId]);
                this.logger.info(`Deleted document from Qdrant: ${material.qdrantId}`);
                return true;
            }
            catch (error) {
                this.logger.error('Failed to delete document from Qdrant:', error);
                throw error;
            }
        });
    }
    /**
     * Delete all documents for a course from Qdrant
     *
     * @param courseId - The course ID
     * @returns Statistics about the deletion
     */
    deleteAllDocumentsForCourse(courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const course = yield this.mongoDB.getActiveCourse(courseId);
                if (!course) {
                    throw new Error('Course not found');
                }
                const qdrantIds = [];
                const errors = [];
                // Collect all qdrantIds from all materials
                (_a = course.topicOrWeekInstances) === null || _a === void 0 ? void 0 : _a.forEach((instance_topicOrWeek) => {
                    var _a;
                    (_a = instance_topicOrWeek.items) === null || _a === void 0 ? void 0 : _a.forEach((item) => {
                        var _a;
                        (_a = item.additionalMaterials) === null || _a === void 0 ? void 0 : _a.forEach((material) => {
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
                yield this.rag.deleteDocumentsByIds(qdrantIds);
                this.logger.info(`Deleted ${qdrantIds.length} documents from Qdrant`);
                return { deletedCount: qdrantIds.length, errors };
            }
            catch (error) {
                this.logger.error('Failed to delete all documents from Qdrant:', error);
                throw error;
            }
        });
    }
    /**
     * Wipe all documents from RAG database for a specific course
     * Based on clear-rag-database.ts approach but filtered by course
     *
     * @param courseId - The course ID to filter documents by
     * @returns Statistics about the deletion
     */
    WipeRAGDatabase(courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const errors = [];
            try {
                this.logger.info('🚀 Starting RAG database wipe process for course:', { courseId });
                this.logger.info('⚠️  WARNING: This will permanently delete ALL documents from this course!');
                // Get course from MongoDB to find all qdrantIds
                const course = yield this.mongoDB.getActiveCourse(courseId);
                if (!course) {
                    throw new Error('Course not found');
                }
                const qdrantIds = [];
                let mongoMaterialCount = 0;
                // Collect all qdrantIds from all materials in the course
                this.logger.info('📊 Collecting document IDs from course materials...');
                (_a = course.topicOrWeekInstances) === null || _a === void 0 ? void 0 : _a.forEach((instance_topicOrWeek) => {
                    var _a;
                    (_a = instance_topicOrWeek.items) === null || _a === void 0 ? void 0 : _a.forEach((item) => {
                        var _a;
                        (_a = item.additionalMaterials) === null || _a === void 0 ? void 0 : _a.forEach((material) => {
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
                    yield this.rag.deleteDocumentsByIds(qdrantIds);
                    this.logger.info('✅ Documents deleted from Qdrant successfully');
                    // Clear all AdditionalMaterial from MongoDB for this course
                    this.logger.info('🗑️  Clearing AdditionalMaterial from MongoDB...');
                    yield this.mongoDB.clearAllAdditionalMaterials(courseId);
                    this.logger.info('✅ AdditionalMaterial cleared from MongoDB successfully');
                    return { deletedCount: qdrantIds.length, errors: [] };
                }
                catch (error) {
                    this.logger.warn('⚠️  ID-based deletion failed:', { error: error instanceof Error ? error.message : String(error) });
                    errors.push(`ID-based deletion failed: ${error instanceof Error ? error.message : String(error)}`);
                    // Method 2: Try to delete by course metadata filter
                    this.logger.info('🔄 Attempting to delete by course metadata filter...');
                    try {
                        // Get documents by course metadata
                        const courseDocuments = yield this.rag.getDocumentsByMetadata({ courseName: course.courseName });
                        const courseDocumentIds = courseDocuments.map(doc => doc.id);
                        if (courseDocumentIds.length > 0) {
                            this.logger.info(`📋 Found ${courseDocumentIds.length} documents by course metadata`);
                            yield this.rag.deleteDocumentsByIds(courseDocumentIds);
                            this.logger.info('✅ Documents deleted by course metadata successfully');
                            // Clear MongoDB materials
                            yield this.mongoDB.clearAllAdditionalMaterials(courseId);
                            return { deletedCount: courseDocumentIds.length, errors: [] };
                        }
                        else {
                            this.logger.info('✅ No documents found by course metadata');
                            return { deletedCount: 0, errors: [] };
                        }
                    }
                    catch (metadataError) {
                        this.logger.error('❌ Course metadata deletion also failed:', { error: metadataError });
                        errors.push(`Course metadata deletion failed: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`);
                        throw metadataError;
                    }
                }
            }
            catch (error) {
                this.logger.error('❌ Error during RAG database wipe process:', { error: error });
                errors.push(`Wipe process failed: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        });
    }
    /**
     * Nuclear clear - delete entire Qdrant collection (nuclear option)
     * Based on nuclear-clear-rag.ts approach
     *
     * @returns Statistics about the deletion
     */
    NuclearClearRAGDatabase() {
        return __awaiter(this, void 0, void 0, function* () {
            const errors = [];
            try {
                this.logger.info('💥 Starting NUCLEAR RAG database clearing process...');
                this.logger.info('⚠️  WARNING: This will permanently delete the ENTIRE COLLECTION!');
                this.logger.info('⚠️  WARNING: This is irreversible and will remove all data!');
                // Get current document count before deletion
                this.logger.info('📊 Checking current document count...');
                let documentCount = 0;
                try {
                    const allDocuments = yield this.rag.getDocumentsByMetadata({});
                    documentCount = allDocuments.length;
                    this.logger.info(`📈 Found ${documentCount} documents in the collection`);
                    if (documentCount === 0) {
                        this.logger.info('✅ Collection is already empty. Proceeding with collection deletion...');
                    }
                }
                catch (error) {
                    this.logger.warn('⚠️  Could not retrieve document count (collection may not exist)');
                }
                // Nuclear option: Delete entire storage container (collection)
                this.logger.info('💥 Executing NUCLEAR OPTION: Deleting entire collection...');
                try {
                    yield this.rag.deleteStorage();
                    this.logger.info('✅ Collection deleted successfully');
                    // Recreate the collection by reinitializing the RAG module
                    this.logger.info('🔄 Recreating collection...');
                    this.rag = yield ubc_genai_toolkit_rag_1.RAGModule.create(this.config.ragConfig);
                    this.logger.info('✅ Collection recreated successfully');
                    return { deletedCount: documentCount, errors: [] };
                }
                catch (error) {
                    this.logger.error('❌ Collection deletion failed:', { error: error instanceof Error ? error.message : String(error) });
                    errors.push(`Collection deletion failed: ${error instanceof Error ? error.message : String(error)}`);
                    throw error;
                }
            }
            catch (error) {
                this.logger.error('❌ Error during nuclear RAG database clearing process:', { error: error });
                errors.push(`Nuclear clear process failed: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        });
    }
    /**
     * getDocument by id
     *
     * @param id - The id of the document to get
     * @returns The result of the get
     */
    getDocumentById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return;
        });
    }
    /**
     * Clean up temporary file after processing
     *
     * @param filePath - Path to the temporary file to delete
     */
    cleanupTempFile(filePath) {
        try {
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
                this.logger.info(`🗑️ Cleaned up temp file: ${filePath}`);
            }
        }
        catch (error) {
            this.logger.warn(`⚠️ Failed to clean up temp file ${filePath}:`, { error: error });
        }
    }
}
exports.RAGApp = RAGApp;
// Note: Using asyncHandlerWithAuth from middleware instead of local asyncHandler
// Configure multer for file uploads
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/html', 'text/markdown', 'text/plain'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only PDF, DOCX, HTML, MD, and TXT files are allowed.'));
        }
    }
});
// Validation middleware for text documents
const validateTextDocument = (req, res, next) => {
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
const validateFileDocument = (req, res, next) => {
    var _a;
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
    const fileExtension = (_a = originalName.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
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
router.post('/documents/text', validateTextDocument, (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('🔍 BACKEND UPLOAD TEXT - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Body:', req.body);
        console.log('  User:', req.user);
        const ragApp = yield RAGApp.getInstance();
        const document = {
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
        const result = yield ragApp.uploadDocument(document);
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
                }
                else {
                    // Add uploadedBy field from authenticated user
                    const materialWithUser = Object.assign(Object.assign({}, result), { uploadedBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.puid) || 'system' });
                    console.log('🔍 BACKEND UPLOAD TEXT - Material with User:');
                    console.log('  Material:', materialWithUser);
                    yield ragApp['mongoDB'].addAdditionalMaterial(courseId, topicOrWeekId, itemId, materialWithUser);
                    console.log('✅ Document metadata stored in MongoDB');
                }
            }
            catch (mongoError) {
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
    }
    catch (error) {
        res.status(500).json({
            status: 500,
            message: 'Failed to upload text document',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
})));
// POST /api/rag/documents/file - Upload a file document (REQUIRES AUTH)
router.post('/documents/file', upload.single('file'), validateFileDocument, (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('🔍 BACKEND UPLOAD FILE - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Body:', req.body);
        console.log('  File:', req.file);
        console.log('  User:', req.user);
        const ragApp = yield RAGApp.getInstance();
        if (!req.file) {
            return res.status(400).json({
                status: 400,
                message: 'File is required'
            });
        }
        const document = {
            id: '', // Will be generated by IDGenerator
            date: new Date(),
            name: req.body.name,
            courseName: req.body.courseName,
            topicOrWeekTitle: req.body.topicOrWeekTitle,
            itemTitle: req.body.itemTitle,
            sourceType: 'file',
            file: req.file, // Cast to any to handle multer file type
            fileName: req.file.originalname,
            uploaded: false,
        };
        const result = yield ragApp.uploadDocument(document);
        // Store metadata in MongoDB if upload was successful
        if (result.uploaded && result.qdrantId) {
            try {
                // Extract courseId, topicOrWeekId, and itemId from request body
                const { courseId, topicOrWeekId, itemId } = req.body;
                if (!courseId || !topicOrWeekId || !itemId) {
                    console.warn('Missing courseId, topicOrWeekId, or itemId for MongoDB storage');
                }
                else {
                    // Add uploadedBy field from authenticated user
                    const materialWithUser = Object.assign(Object.assign({}, result), { uploadedBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.puid) || 'system' });
                    yield ragApp['mongoDB'].addAdditionalMaterial(courseId, topicOrWeekId, itemId, materialWithUser);
                    console.log('✅ Document metadata stored in MongoDB');
                }
            }
            catch (mongoError) {
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
    }
    catch (error) {
        res.status(500).json({
            status: 500,
            message: 'Failed to upload file document',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
})));
// GET /api/rag/documents/:courseName - Get all documents from Qdrant for a specific course (REQUIRES AUTH)
router.get('/documents/:courseName', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: Implement document retrieval by course
    res.status(501).json({ message: 'Not implemented yet' });
})));
// GET /api/rag/documents/:courseName/:contentTitle - Get all chunks from Qdrant for a specific content title (REQUIRES AUTH)
router.get('/documents/:courseName/:contentTitle', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: Implement document retrieval by content title
    res.status(501).json({ message: 'Not implemented yet' });
})));
// GET /api/rag/documents/:courseName/:contentTitle/:subContentTitle - Get all chunks from Qdrant for a specific subcontent title (REQUIRES AUTH)
router.get('/documents/:courseName/:contentTitle/:subContentTitle', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: Implement document retrieval by subcontent title
    res.status(501).json({ message: 'Not implemented yet' });
})));
// GET /api/rag/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber - Get a specific chunk from Qdrant (REQUIRES AUTH)
router.get('/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: Implement specific chunk retrieval
    res.status(501).json({ message: 'Not implemented yet' });
})));
// POST /api/rag/search - Search for similar documents using vector similarity (REQUIRES AUTH)
router.post('/search', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: Implement document search
    res.status(501).json({ message: 'Not implemented yet' });
})));
// DELETE /api/rag/wipe-all - Wipe all documents from RAG database for a specific course (REQUIRES AUTH)
router.delete('/wipe-all', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('🔍 BACKEND WIPE ALL DOCUMENTS - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Body:', req.body);
        console.log('  Query:', req.query);
        console.log('  User:', req.user);
        // Get courseId from query parameters
        const courseId = req.query.courseId;
        if (!courseId) {
            return res.status(400).json({
                status: 400,
                message: 'courseId query parameter is required'
            });
        }
        const ragApp = yield RAGApp.getInstance();
        // Call the WipeRAGDatabase method with courseId
        const result = yield ragApp.WipeRAGDatabase(courseId);
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
    }
    catch (error) {
        console.error('❌ Failed to wipe RAG database:', error);
        res.status(500).json({
            status: 500,
            message: 'Failed to wipe RAG database',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
})));
exports.default = router;

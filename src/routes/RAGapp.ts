// /**
//  * ===========================================
//  * ========= QDRANT INTEGRATION API =========
//  * ===========================================
//  *
//  * This module provides Express.js routes for integrating with Qdrant vector database
//  * to store and retrieve course content embeddings for the EngE-AI platform.
//  *
//  * Key Features:
//  * - Document upload with vector embeddings to Qdrant collections
//  * - Hierarchical content retrieval by course, content, and subcontent
//  * - RESTful API endpoints for vector similarity search
//  * - Payload validation and error handling middleware
//  * - Collection organization by course name for multi-tenant support
//  *
//  * API Endpoints:
//  * - POST /documents/:courseName/:contentTitle/:subContentTitle - Upload document with vector
//  * - GET /documents/:courseName - Get all documents for a course
//  * - GET /documents/:courseName/:contentTitle - Get content-specific documents
//  * - GET /documents/:courseName/:contentTitle/:subContentTitle - Get subcontent documents
//  * - GET /documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber - Get specific chunk
//  *
//  * @author: EngE-AI Team
//  * @version: 1.0.0
//  * @since: 2025-01-27
//  * 
//  */

// import dotenv, { config } from 'dotenv';
// import express from 'express';
// import { Router, Request, Response } from 'express';
// import { QdrantClient } from '@qdrant/js-client-rest';
// import type { AdditionalMaterial } from '../functions/types';
// import { ChunkingModule, ChunkingConfig } from 'ubc-genai-toolkit-chunking';
// import { EmbeddingsModule, EmbeddingsConfig, EmbeddingProviderType } from 'ubc-genai-toolkit-embeddings';
// import { ConsoleLogger } from 'ubc-genai-toolkit-core';
// import { LLMConfig, ProviderType, LLMModule,} from 'ubc-genai-toolkit-llm';
// import { LoggerInterface } from 'ubc-genai-toolkit-core';
// import { randomUUID } from 'crypto';
// import { AppConfig, loadConfig } from './config';
// import { RAGModule } from 'ubc-genai-toolkit-rag';

// // Load environment variables
// dotenv.config();

// const router: Router = express.Router();



// // Configuration
// const QDRANT_HOST = process.env.QDRANT_URL || 'http://localhost:6333';
// const API_ENDPOINT = `${QDRANT_HOST}/api/documents`;


// // Corpus configuration
// let corpusConfig = {
//     chunkingSize: 1000,
//     overlapSize: 200
// };

// let defaultOption = { // data type : partial<chunkingConfig>
//     strategy: 'token',
//     defaultOptions: {
//         chunkSize: corpusConfig.chunkingSize,
//         chunkOverlap: corpusConfig.overlapSize,
//     }
// };

// let corpusModule = new ChunkingModule(defaultOption as Partial<ChunkingConfig>);

// // Debug environment variables
// console.log('🔍 Qdrant Config Debug:');
// console.log('  QDRANT_URL:', process.env.QDRANT_URL);
// console.log('  QDRANT_API_KEY:', process.env.QDRANT_API_KEY ? 'Set' : 'Not set');

// const qdrantClient = new QdrantClient({
//     url: process.env.QDRANT_URL,
//     apiKey: process.env.QDRANT_API_KEY,
// });

// let embeddingsModule: EmbeddingsModule | undefined;

// // Collection configuration
// const collectionName = 'ENGEAI_documents';
// const vectorSize = 768; // Based on nomic-embed-text

// /**
//  * Setup embeddings module
//  */
// async function setupEmbeddings() {
//     try {
//         const logger = new ConsoleLogger('tlef-qdrant-app');

//         const llmConfig: Partial<LLMConfig> = {
//             provider: process.env.LLM_PROVIDER as ProviderType,
//             apiKey: process.env.LLM_API_KEY,
//             endpoint: process.env.LLM_ENDPOINT,
//             defaultModel: process.env.LLM_DEFAULT_MODEL,
//             embeddingModel: process.env.LLM_EMBEDDING_MODEL,
//         };

//         const config: Partial<EmbeddingsConfig> = {
//             providerType: process.env.EMBEDDING_PROVIDER as EmbeddingProviderType,
//             logger: logger,
//             llmConfig: llmConfig,
//         };

//         embeddingsModule = await EmbeddingsModule.create(config);
//         console.log('✅ Embeddings module initialized successfully.');
//     } catch (error) {
//         console.error('❌ Failed to initialize embeddings module:', error);
//         process.exit(1);
//     }
// }

// /**
//  * Setup Qdrant collection
//  */
// async function setupQdrant() {
//     try {
//         const response = await qdrantClient.getCollections();
//         const collectionNames = response.collections.map((collection) => collection.name);

//         if (!collectionNames.includes(collectionName)) {
//             await qdrantClient.createCollection(collectionName, {
//                 vectors: {
//                     size: vectorSize,
//                     distance: 'Cosine',
//                 },
//             });
//             console.log(`✅ Collection '${collectionName}' created.`);
//         } else {
//             console.log(`ℹ️ Collection '${collectionName}' already exists.`);
//         }
//     } catch (error) {
//         console.error('❌ Qdrant setup failed:', error);
//         process.exit(1);
//     }
// }

// /**
//  * Upload document to qdrant
//  * 
//  *  - chukfile 
//  * 
//  * PAYLOADS:
//  *  - id
//  *  - date
//  *  - content Title
//  *  - subcontent Title
//  *  - chunkNumber
//  */


// class QdrantUpload {
//     private isInitialized: boolean = false;

//     private constructor(private qdrantClient: QdrantClient) {
//         this.qdrantClient = qdrantClient;
//     }

//     /**
//      * Static factory method to create and initialize QdrantUpload instance
//      * This ensures initialization completes before the object is ready to use
//      */
//     static async create(qdrantClient: QdrantClient): Promise<QdrantUpload> {
//         const instance = new QdrantUpload(qdrantClient);
//         await instance.initialize();
//         return instance;
//     }

//     private async initialize() {
//         if (this.isInitialized) return;
        
//         try {
//             console.log('🚀 Initializing Qdrant and embeddings...');
//             await setupEmbeddings();
//             await setupQdrant();
//             this.isInitialized = true;
//             console.log('✅ Qdrant and embeddings initialization completed');
//         } catch (error) {
//             console.error('❌ Failed to initialize Qdrant and embeddings:', error);
//             throw error;
//         }
//     }

//     async uploadTextToQdrant(uploadContent: AdditionalMaterial) {

//         console.log('DEBUG #26 : Uploading text to Qdrant', uploadContent);

//         // Ensure initialization is complete
//         if (!this.isInitialized) {
//             await this.initialize();
//         }

//         // Generate vector embedding for the text content
//         let vector: number[] = [];
//         let result: any;
//         try {
//             if (!embeddingsModule) {
//                 throw new Error('Embeddings module not initialized');
//             }

//             const document = {
//                 content: uploadContent.text || '',
//                 metadata: {
//                     timestamp: new Date().toISOString(),
//                     sourceId: new Date().toISOString(),
//                 }
//             }

//             console.log('Debugging #31 : ', JSON.stringify(document, null, 2));

//             //set up chunking
//             const chunkResponse = await corpusModule.chunkDocuments([document]);
//             const chunks = chunkResponse.chunks;

//             //use batch processin instead of sequential processing
//             const chunkTexts = chunks.map((chunk) => chunk.text);
//             console.log("Debugging #29 : ", JSON.stringify(chunkTexts, null, 2));


//             const embeddingResult = await embeddingsModule.embed(chunkTexts);
//             // vector = embeddingResult[0]; // embed returns number[][], we need the first array


//             const points = chunks.map( (chunk, index) => ({
//                 id : randomUUID(),
//                 vector : embeddingResult[index],
//                 payload : {
//                     text : chunk.text,
//                     chunkNumber : chunk.metadata.chunkNumber,
//                     timestamp : new Date().toISOString(),
//                     sourceID : chunk.metadata.sourceDocumentMetadata,
//                     characterLength : chunk.metadata.characterLength,
//                 }
//             }) );

//             console.log('Debugging #30 : ', JSON.stringify(points, null, 2));
//             //upload to qdrant
//             result = await this.qdrantClient.upsert(collectionName, {
//                 points : points,
//             });
            
//             console.log('✅ Vector embedding generated successfully');
//         } catch (error) {
//             console.error('❌ Failed to generate embedding:', error);
//             throw new Error('Failed to generate text embedding');
//         }
        
//         return result;
//     }

//     /**
//      * get document from qdrant
//      */
//     async getDocumentFromQdrant(
//         courseName: string, 
//         contentTitle?: string,
//         subcontentTitle?: string,
//         chunkNumber?: number,
//         id?: string,
//     ) : Promise<any> {
//         let result: any;
//         const targetCollectionName = collectionName;

//         //search chunk by id
//         if (id) {
//             result = await this.qdrantClient.scroll(targetCollectionName, {
//                 filter: {
//                     courseName: courseName,
//                     id: id,
//                 }
//             });
//             return result;
//         }

//         //get all documents from qdrant
//         if (!contentTitle) {
//             result = await this.qdrantClient.scroll(targetCollectionName, {
//                 filter: {
//                     courseName: courseName,
//                 }
//             });
//         }
//         else if (!subcontentTitle) {
//             result = await this.qdrantClient.scroll(targetCollectionName, {
//                 filter: {
//                     courseName: courseName,
//                     contentTitle: contentTitle,
//                 }
//             });
//         }
//         else if (!chunkNumber) {
//             result = await this.qdrantClient.scroll(targetCollectionName, {
//                 filter: {
//                     courseName: courseName,
//                     contentTitle: contentTitle,
//                     subcontentTitle: subcontentTitle,
//                 }
//             });
//         }
//         else {
//             result = await this.qdrantClient.scroll(targetCollectionName, {
//                 filter: {
//                     courseName: courseName,
//                     contentTitle: contentTitle,
//                     subcontentTitle: subcontentTitle,
//                     chunkNumber: chunkNumber,
//                 }
//             });
//         }
//         //if subcontentTitle is not provided, return all documents
//         return result;
//     }

//     /**
//      * Search for similar documents using vector similarity
//      */
//     async searchSimilarDocuments(
//         queryText: string,
//         courseName?: string,
//         limit: number = 3,
//         scoreThreshold: number = 0.7
//     ): Promise<any> {
//         // Ensure initialization is complete
//         if (!this.isInitialized) {
//             await this.initialize();
//         }

//         // Generate vector embedding for the query
//         let queryVector: number[] = [];
//         try {
//             if (!embeddingsModule) {
//                 throw new Error('Embeddings module not initialized');
//             }
//             const embeddingResult = await embeddingsModule.embed(queryText);
//             queryVector = embeddingResult[0]; // embed returns number[][], we need the first array
//             console.log('✅ Query vector embedding generated successfully');
//         } catch (error) {
//             console.error('❌ Failed to generate query embedding:', error);
//             throw new Error('Failed to generate query embedding');
//         }

//         // Build filter for course-specific search if needed
//         const filter: any = {};
//         if (courseName) {
//             filter.courseName = courseName;
//         }

//         // Search for similar vectors
//         const result = await this.qdrantClient.search(collectionName, {
//             vector: queryVector,
//             filter: Object.keys(filter).length > 0 ? filter : undefined,
//             limit: limit,
//             score_threshold: scoreThreshold,
//         });

//         return result;
//     }


// }

// // Middleware for error handling
// const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) => 
//     (req: Request, res: Response) => {
//         Promise.resolve(fn(req, res))
//             .catch((error) => {
//                 console.error('Error in Qdrant route:', error);
//                 res.status(500).json({
//                     status: 500,
//                     message: 'Internal server error',
//                     details: error.message
//                 });
//             });
//     };

// // Validation middleware
// const validateDocument = (req: Request, res: Response, next: Function) => {
//     const doc = req.body;
    
//     if (!doc) {
//         return res.status(400).json({
//             status: 400,
//             message: 'Request body is required'
//         });
//     }

//     if (!doc.text || typeof doc.text !== 'string') {
//         return res.status(400).json({
//             status: 400,
//             message: 'Document text is required and must be a string'
//         });
//     }

//     if (doc.text.length === 0) {
//         return res.status(400).json({
//             status: 400,
//             message: 'Document text cannot be empty'
//         });
//     }

//     next();
// };


// // /**
// //  * QDRANT upload using RAGModule from UBC GenAI Toolkit
// //  */

// class RAGApp {
    
// //     private rag: RAGModule;
// //     private llm: LLMModule;
// //     private logger: LoggerInterface;
// //     private config: AppConfig;
// //     private isInitialized: boolean = false;


// //     constructor(config: AppConfig) {
// //         this.config = config;
// //         this.llm = new LLMModule(config.llmConfig);
// //         this.logger = config.logger;
// //         this.rag = {} as RAGModule; // initialize later
// //     }

//     // async initialize() {
//     //     if (this.isInitialized) {
//     //         console.log('✅ RAGApp already initialized');
//     //         return;
//     //     }

//     //     try {
//     //         this.logger.info('Initializing RAGApp...');
//     //         this.logger.info (`Using LLM Provider: ${this.config.llmConfig.provider}`);

//     //         this.rag = await RAGModule.create(this.config.ragConfig);
//     //         this.logger.info('✅ RAGModule initialized successfully');
//     //         this.isInitialized = true;
//     //         this.logger.info('✅ RAGApp initialized successfully');
//     //     } catch (error) {
//     //         this.logger.error('❌ Failed to initialize RAGApp:', {error: error});
//     //         throw error;
//     //     }

//     // }

//     // /**
//     //  * Upluad document to RAG
//     //  * 
//     //  * PAYLOADS:
//     //  *  - id
//     //  *  - date
//     //  *  - content Title
//     //  *  - subcontent Title
//     //  *  - chunkNumber
//     //  * 
//     //  *  @param document - The document to upload
//     //  *  @returns The result of the upload
//     //  */
//     // async uploadDocument(document: AdditionalMaterial) : Promise<AdditionalMaterial> {

//     //     if (!this.isInitialized) {
//     //         await this.initialize();
//     //     }

//     //     try {
//     //         //document invariant : it is either a text or a document
//     //         if (!document.text && !document.file) {
//     //             throw new Error('Document must be either a text or a document');
//     //         }
//     //         else if (document.text && document.file) {
//     //             throw new Error('Document must be either a text or a document');
//     //         }

//     //         else if (document.sourceType === 'text') {
//     //             if (!document.text) {
//     //                 throw new Error('Document text is required');
//     //             }
//     //             const result = await this.rag.addDocument(document.text, {
//     //                 id: document.id,
//     //                 date: document.date,
//     //                 contentTitle: document.courseName,
//     //                 subcontentTitle: document.divisionTitle,
//     //                 itemTitle : document.itemTitle,
//     //                 sourceType: document.sourceType,
//     //             });
//     //         }

//     //         else if (document.sourceType === 'file') {

//     //         //document invariant : it is either a text or a document
//     //     } catch (error) {
//     //     }

        

//     //     const result = await this.rag.addDocument(document);
//     //     return document;

//     // }


//     // /**
//     //  * Search for similar documents using RAG
//     //  * 
//     //  * @param query - The query to search for
//     //  * @param courseName - The course name to search in
//     //  * @param limit - The limit of the search
//     //  * @param scoreThreshold - The score threshold for the search
//     //  * @returns The result of the search
//     //  */
//     // async searchDocuments(query: string, courseName?: string, limit: number = 3, scoreThreshold: number = 0.7) : Promise<any> {
//     //     return ;
//     // }

//     // /**
//     //  * Delete document from RAG
//     //  * 
//     //  * @param id - The id of the document to delete
//     //  * @returns The result of the delete
//     //  */
//     // async deleteDocument(id: string) : Promise<any> {
//     //     return ;
//     // }

//     // /**
//     //  * getDocument by metadata
//     //  * 
//     //  * @param metadata - The metadata of the document to get
//     //  * @returns The result of the get
//     //  */
//     // async getDocumentByMetadata(metadata: any) : Promise<any> {
//     //     return ;
//     // }
    
//     //  /**
//     //   * getDocument by id
//     //   * 
//     //   * @param id - The id of the document to get
//     //   * @returns The result of the get
//     //   */
//     // async getDocumentById(id: string) : Promise<any> {
//     //     return ;
//     // }
    
    
// }

// //initialize RAGApp
// let ragApp: RAGApp;
// const config = loadConfig();
// const logger = config.logger;
// ragApp = new RAGApp(config); // fix later
// ragApp.initialize();


// // POST /api/qdrant/documents - Upload a document
// router.post('/documents/', validateDocument, asyncHandler(async (req: Request, res: Response) => {
//     if (!qdrantUpload) {
//         return res.status(503).json({
//             status: 503,
//             message: 'QdrantUpload service is not yet initialized. Please try again in a moment.'
//         });
//     }

//     const uploadContent: AdditionalMaterial = req.body;
//     try {
//         const result = await qdrantUpload.uploadTextToQdrant(uploadContent);
//         res.status(200).json({
//             status: 200,
//             message: 'Document uploaded successfully',
//             data: result
//         });
//     } catch (error) {
//         throw {
//             status: 500,
//             message: 'Failed to upload document to Qdrant',
//             details: error instanceof Error ? error.message : 'Unknown error'
//         };
//     }
// }));

// // GET /api/qdrant/documents/:courseName - Get all documents from Qdrant for a specific course
// router.get('/documents/:courseName', asyncHandler(async (req: Request, res: Response) => {
//     if (!qdrantUpload) {
//         return res.status(503).json({
//             status: 503,
//             message: 'QdrantUpload service is not yet initialized. Please try again in a moment.'
//         });
//     }

//     const result = await qdrantUpload.getDocumentFromQdrant(req.params.courseName);
//     res.status(200).json(result);
// }));

// // GET /api/qdrant/documents/:courseName/:contentTitle - Get all chunks from Qdrant for a specific content title
// router.get('/documents/:courseName/:contentTitle', asyncHandler(async (req: Request, res: Response) => {
//     if (!qdrantUpload) {
//         return res.status(503).json({
//             status: 503,
//             message: 'QdrantUpload service is not yet initialized. Please try again in a moment.'
//         });
//     }

//     const result = await qdrantUpload.getDocumentFromQdrant(req.params.courseName, req.params.contentTitle);
//     res.status(200).json(result);
// }));

// // GET /api/qdrant/documents/:courseName/:contentTitle/:subContentTitle - Get all chunks from Qdrant for a specific subcontent title
// router.get('/documents/:courseName/:contentTitle/:subContentTitle', asyncHandler(async (req: Request, res: Response) => {
//     if (!qdrantUpload) {
//         return res.status(503).json({
//             status: 503,
//             message: 'QdrantUpload service is not yet initialized. Please try again in a moment.'
//         });
//     }

//     const result = await qdrantUpload.getDocumentFromQdrant(req.params.courseName, req.params.contentTitle, req.params.subContentTitle);
//     res.status(200).json(result);
// }));

// // GET /api/qdrant/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber - Get a specific chunk from Qdrant
// router.get('/documents/:courseName/:contentTitle/:subContentTitle/:chunkNumber', asyncHandler(async (req: Request, res: Response) => {
//     if (!qdrantUpload) {
//         return res.status(503).json({
//             status: 503,
//             message: 'QdrantUpload service is not yet initialized. Please try again in a moment.'
//         });
//     }

//     const result = await qdrantUpload.getDocumentFromQdrant(req.params.courseName, req.params.contentTitle, req.params.subContentTitle, parseInt(req.params.chunkNumber));
//     res.status(200).json(result);
// }));

// // POST /api/qdrant/search - Search for similar documents using vector similarity
// router.post('/search', asyncHandler(async (req: Request, res: Response) => {
//     if (!qdrantUpload) {
//         return res.status(503).json({
//             status: 503,
//             message: 'QdrantUpload service is not yet initialized. Please try again in a moment.'
//         });
//     }

//     const { query, courseName, limit, scoreThreshold } = req.body;
    
//     if (!query || typeof query !== 'string') {
//         return res.status(400).json({
//             status: 400,
//             message: 'Query text is required and must be a string'
//         });
//     }

//     try {
//         const result = await qdrantUpload.searchSimilarDocuments(
//             query,
//             courseName,
//             limit || 10,
//             scoreThreshold || 0.7
//         );
        
//         res.status(200).json({
//             status: 200,
//             message: 'Search completed successfully',
//             data: result
//         });
//     } catch (error) {
//         throw {
//             status: 500,
//             message: 'Failed to search documents',
//             details: error instanceof Error ? error.message : 'Unknown error'
//         };
//     }
// }));

// // Note: Setup is now handled automatically in the QdrantUpload constructor

// export default router;


/**
 * RAGApp - RAG document upload and management using UBC GenAI Toolkit
 *
 * Handles document upload to Qdrant, chunking, embeddings, and RAG operations.
 * Moved from routes to functions for separation of business logic from HTTP layer.
 */

import { RAGModule } from "ubc-genai-toolkit-rag";
import { AppConfig, loadConfig } from "../utils/config";
import { LoggerInterface } from "ubc-genai-toolkit-core";
import { LLMModule } from "ubc-genai-toolkit-llm";
import { DocumentParsingModule } from "ubc-genai-toolkit-document-parsing";
import { AdditionalMaterial } from "../types/shared";
import { EngEAI_MongoDB } from "../db/enge-ai-mongodb";
import { IDGenerator } from "../utils/unique-id-generator";
import path from "path";
import fs from "fs";

const config = loadConfig();

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

            // Get learning objectives from the course item
            let learningObjectives: any[] = [];
            try {
                const course = await this.mongoDB.getCourseByName(fullDocument.courseName);
                if (course) {
                    // Find the topic/week instance that matches topicOrWeekTitle
                    const topicOrWeekInstance = course.topicOrWeekInstances?.find(
                        (instance: any) => instance.title === fullDocument.topicOrWeekTitle
                    );

                    if (topicOrWeekInstance) {
                        // Find the item that matches itemTitle
                        const item = topicOrWeekInstance.items?.find(
                            (item: any) => item.title === fullDocument.itemTitle || item.itemTitle === fullDocument.itemTitle
                        );

                        if (item && item.learningObjectives) {
                            // Extract just the LearningObjective text from each objective
                            learningObjectives = item.learningObjectives.map((obj: any) => ({
                                text: obj.LearningObjective || obj.learningObjective || ''
                            }));
                        }
                    }
                }
            } catch (error) {
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
     * @returns The result of the delete with materialName and chunksDeleted
     */
    async deleteDocument(materialId: string, courseId: string, topicOrWeekId: string, itemId: string): Promise<{ deleted: boolean; materialName: string; chunksDeleted: number }> {
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

            // Build list of chunk IDs to delete (material may have multiple chunks in Qdrant)
            let chunkIdsToDelete: string[] = [];
            try {
                const chunksByMetadata = await this.rag.getDocumentsByMetadata({ id: materialId });
                if (chunksByMetadata && chunksByMetadata.length > 0) {
                    chunkIdsToDelete = chunksByMetadata.map((doc: any) => doc.id);
                }
            } catch (metadataError) {
                this.logger.warn('Metadata lookup failed, falling back to qdrantId:', { error: metadataError });
            }
            if (chunkIdsToDelete.length === 0) {
                chunkIdsToDelete = [material.qdrantId];
            }

            // BEFORE: Log deletion intent
            this.logger.info('[RAG DELETE] BEFORE: About to delete document from Qdrant', {
                materialId,
                materialName: material.name,
                courseId,
                topicOrWeekId,
                itemId,
                chunkCount: chunkIdsToDelete.length,
            });

            await this.rag.deleteDocumentsByIds(chunkIdsToDelete);

            // AFTER: Log successful deletion
            this.logger.info('[RAG DELETE] AFTER: Successfully deleted document from Qdrant', {
                materialId,
                materialName: material.name,
                chunksDeleted: chunkIdsToDelete.length,
            });
            return {
                deleted: true,
                materialName: material.name || 'Unknown',
                chunksDeleted: chunkIdsToDelete.length
            };
        } catch (error) {
            this.logger.error('[RAG DELETE] AFTER: Failed to delete document from Qdrant', {
                materialId,
                courseId,
                topicOrWeekId,
                itemId,
                error: error as any,
            });
            throw error;
        }
    }

    /**
     * Update payload metadata for chunks matching the given filter.
     * Uses Qdrant set_payload API for partial metadata update.
     *
     * @param filter - Metadata filter to find affected chunks (e.g. { courseName, topicOrWeekTitle })
     * @param payloadUpdate - Payload fields to set (partial update)
     * @returns Number of chunks updated
     */
    async updateChunkMetadata(
        filter: Record<string, any>,
        payloadUpdate: Record<string, any>
    ): Promise<{ chunksUpdated: number }> {
        try {
            const chunks = await this.rag.getDocumentsByMetadata(filter);
            if (!chunks || chunks.length === 0) {
                this.logger.debug('[RAG UPDATE] No chunks found matching filter:', filter);
                return { chunksUpdated: 0 };
            }

            const pointIds = chunks.map((doc: any) => doc.id);
            const qdrantConfig = this.config.ragConfig.qdrantConfig;
            if (!qdrantConfig?.url || !qdrantConfig?.collectionName) {
                throw new Error('Qdrant config missing url or collectionName');
            }

            const baseUrl = qdrantConfig.url.replace(/\/$/, '');
            const payloadUrl = `${baseUrl}/collections/${qdrantConfig.collectionName}/points/payload`;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (qdrantConfig.apiKey) {
                headers['api-key'] = qdrantConfig.apiKey;
            }

            const response = await fetch(payloadUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    points: pointIds,
                    payload: payloadUpdate,
                    wait: true,
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Qdrant set_payload failed: ${response.status} ${errText}`);
            }

            this.logger.info('[RAG UPDATE] Successfully updated chunk metadata', {
                filter,
                payloadUpdate,
                chunksUpdated: pointIds.length,
            });
            return { chunksUpdated: pointIds.length };
        } catch (error) {
            this.logger.error('[RAG UPDATE] Failed to update chunk metadata:', { filter, payloadUpdate, error: error as any });
            throw error;
        }
    }

    /**
     * Update topic/week title in Qdrant chunk metadata when a division title is renamed.
     *
     * @param courseName - Course name
     * @param oldTitle - Previous topic/week title
     * @param newTitle - New topic/week title
     */
    async updateTopicOrWeekTitleInQdrant(courseName: string, oldTitle: string, newTitle: string): Promise<{ chunksUpdated: number }> {
        return this.updateChunkMetadata(
            { courseName, topicOrWeekTitle: oldTitle },
            { topicOrWeekTitle: newTitle }
        );
    }

    /**
     * Update item title in Qdrant chunk metadata when a section title is renamed.
     *
     * @param courseName - Course name
     * @param topicOrWeekTitle - Topic/week title (division) containing the item
     * @param oldItemTitle - Previous item title
     * @param newItemTitle - New item title
     */
    async updateItemTitleInQdrant(
        courseName: string,
        topicOrWeekTitle: string,
        oldItemTitle: string,
        newItemTitle: string
    ): Promise<{ chunksUpdated: number }> {
        return this.updateChunkMetadata(
            { courseName, topicOrWeekTitle, itemTitle: oldItemTitle },
            { itemTitle: newItemTitle }
        );
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

            // BEFORE: Log bulk deletion intent
            this.logger.info('[RAG DELETE] BEFORE: About to delete all documents for course from Qdrant', {
                courseId,
                courseName: course.courseName,
                documentCount: qdrantIds.length,
            });

            // Use bulk delete for efficiency
            await this.rag.deleteDocumentsByIds(qdrantIds);

            // AFTER: Log successful bulk deletion
            this.logger.info('[RAG DELETE] AFTER: Successfully deleted all documents for course from Qdrant', {
                courseId,
                courseName: course.courseName,
                deletedCount: qdrantIds.length,
            });
            return { deletedCount: qdrantIds.length, errors };
        } catch (error) {
            this.logger.error('Failed to delete all documents from Qdrant:', error as any);
            throw error;
        }
    }

    /**
     * Delete all documents for a course from Qdrant with per-document breakdown
     * Iterates over each material and calls deleteDocument to get accurate chunk counts
     *
     * @param courseId - The course ID
     * @returns Per-document breakdown and total chunks deleted
     */
    async deleteAllDocumentsForCourseWithBreakdown(courseId: string): Promise<{
        deletedDocuments: { name: string; chunksDeleted: number }[];
        totalChunksDeleted: number;
        errors: string[];
    }> {
        const deletedDocuments: { name: string; chunksDeleted: number }[] = [];
        const errors: string[] = [];
        let totalChunksDeleted = 0;

        try {
            const course = await this.mongoDB.getActiveCourse(courseId);
            if (!course) {
                throw new Error('Course not found');
            }

            for (const instance_topicOrWeek of course.topicOrWeekInstances || []) {
                for (const item of instance_topicOrWeek.items || []) {
                    for (const material of item.additionalMaterials || []) {
                        if (!material.qdrantId) continue;

                        try {
                            const result = await this.deleteDocument(
                                material.id,
                                courseId,
                                instance_topicOrWeek.id,
                                item.id
                            );
                            deletedDocuments.push({
                                name: result.materialName,
                                chunksDeleted: result.chunksDeleted
                            });
                            totalChunksDeleted += result.chunksDeleted;
                        } catch (docError) {
                            const errMsg = `Failed to delete material ${material.name || material.id}: ${docError instanceof Error ? docError.message : String(docError)}`;
                            errors.push(errMsg);
                            this.logger.warn(errMsg);
                        }
                    }
                }
            }

            return { deletedDocuments, totalChunksDeleted, errors };
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
                // BEFORE: Log wipe intent
                this.logger.info('[RAG DELETE] BEFORE: About to wipe RAG database for course', {
                    courseId,
                    courseName: course.courseName,
                    documentCount: qdrantIds.length,
                });

                this.logger.info(`📋 Deleting ${qdrantIds.length} document IDs from Qdrant`);
                await this.rag.deleteDocumentsByIds(qdrantIds);

                // AFTER: Log successful wipe
                this.logger.info('[RAG DELETE] AFTER: Successfully wiped RAG database for course', {
                    courseId,
                    courseName: course.courseName,
                    deletedCount: qdrantIds.length,
                });
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
                        this.logger.info('[RAG DELETE] BEFORE: About to wipe RAG database (metadata fallback)', {
                            courseId,
                            courseName: course.courseName,
                            documentCount: courseDocumentIds.length,
                        });
                        this.logger.info(`📋 Found ${courseDocumentIds.length} documents by course metadata`);
                        await this.rag.deleteDocumentsByIds(courseDocumentIds);
                        this.logger.info('[RAG DELETE] AFTER: Successfully wiped RAG database (metadata fallback)', {
                            courseId,
                            courseName: course.courseName,
                            deletedCount: courseDocumentIds.length,
                        });
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

                // Recreate the collection by reinitializing the RAG module
                this.logger.info('🔄 Recreating collection...');
                this.rag = await RAGModule.create(this.config.ragConfig);
                this.logger.info('✅ Collection recreated successfully');

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

    /** Access to mongoDB for route handlers that need to store metadata */
    get mongoDBInstance(): EngEAI_MongoDB {
        return this.mongoDB;
    }
}

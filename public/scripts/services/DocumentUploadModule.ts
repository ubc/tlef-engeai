/**
 * Document Upload Module
 * 
 * This module provides a clean interface for uploading documents to the RAG system
 * using the UBC GenAI Toolkit document parsing capabilities.
 * 
 * FEATURES:
 * - File validation (PDF, DOCX, HTML, Markdown, TXT)
 * - Text content validation
 * - Progress tracking
 * - Error handling
 * - Integration with RAG backend endpoints
 * 
 * @author: gatahcha
 * @date: 2025-01-27
 * @version: 1.0.0
 */

import { AdditionalMaterial } from '../../../src/functions/types';

export interface UploadResult {
    success: boolean;
    document?: AdditionalMaterial;
    chunksGenerated?: number;
    error?: string;
}

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Document Upload Module Class
 */
export class DocumentUploadModule {
    private progressCallback: (progress: number, stage: string) => void;

    // Supported file types and their MIME types
    private static readonly SUPPORTED_FILE_TYPES: Record<string, string[]> = {
        'application/pdf': ['.pdf'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'text/html': ['.html', '.htm'],
        'text/markdown': ['.md'],
        'text/plain': ['.txt'],
    };

    // File size limits
    private static readonly FILE_SIZE_LIMITS = {
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
        MAX_TEXT_LENGTH: 1000000, // 1 million characters
    };

    constructor(progressCallback: (progress: number, stage: string) => void = () => {}) {
        this.progressCallback = progressCallback;
    }

    /**
     * Get supported file types as a string for HTML accept attribute
     */
    public getSupportedFileTypes(): string {
        return Object.keys(DocumentUploadModule.SUPPORTED_FILE_TYPES).join(',');
    }

    /**
     * Validate a file before upload
     */
    public validateFile(file: File): ValidationResult {
        // Check file size
        if (file.size > DocumentUploadModule.FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
            return {
                isValid: false,
                error: `File size exceeds limit of ${DocumentUploadModule.FILE_SIZE_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB`
            };
        }

        // Check file type
        const isValidType = Object.keys(DocumentUploadModule.SUPPORTED_FILE_TYPES).includes(file.type);
        if (!isValidType) {
            const supportedExtensions = Object.values(DocumentUploadModule.SUPPORTED_FILE_TYPES).flat();
            return {
                isValid: false,
                error: `Unsupported file type. Supported types: ${supportedExtensions.join(', ')}`
            };
        }

        return { isValid: true };
    }

    /**
     * Validate text content before upload
     */
    public validateText(text: string): ValidationResult {
        if (text.length === 0) {
            return {
                isValid: false,
                error: 'Text content cannot be empty'
            };
        }

        if (text.length > DocumentUploadModule.FILE_SIZE_LIMITS.MAX_TEXT_LENGTH) {
            return {
                isValid: false,
                error: `Text content exceeds limit of ${DocumentUploadModule.FILE_SIZE_LIMITS.MAX_TEXT_LENGTH} characters`
            };
        }

        return { isValid: true };
    }

    /**
     * Upload a document (file or text) to the RAG system
     */
    public async uploadDocument(document: AdditionalMaterial): Promise<UploadResult> {
        try {
            this.progressCallback(10, 'Validating document...');

            // Validate based on source type
            if (document.sourceType === 'file' && document.file) {
                const validation = this.validateFile(document.file);
                if (!validation.isValid) {
                    return { success: false, error: validation.error };
                }
                return await this.uploadFile(document.file, {
                    name: document.name,
                    courseName: document.courseName,
                    divisionTitle: document.divisionTitle,
                    itemTitle: document.itemTitle,
                    sourceType: document.sourceType
                });
            } else if (document.sourceType === 'text' && document.text) {
                const validation = this.validateText(document.text);
                if (!validation.isValid) {
                    return { success: false, error: validation.error };
                }
                return await this.uploadText(document.text, {
                    name: document.name,
                    courseName: document.courseName,
                    divisionTitle: document.divisionTitle,
                    itemTitle: document.itemTitle,
                    sourceType: document.sourceType
                });
            } else {
                return { success: false, error: 'Invalid document: must have either file or text content' };
            }
        } catch (error) {
            console.error('Error in uploadDocument:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Upload a file to the RAG system
     */
    private async uploadFile(file: File, metadata: Omit<AdditionalMaterial, 'id' | 'file' | 'text' | 'date'>): Promise<UploadResult> {
        try {
            this.progressCallback(20, 'Preparing file upload...');

            // Create FormData for file upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', metadata.name);
            formData.append('courseName', metadata.courseName);
            formData.append('divisionTitle', metadata.divisionTitle);
            formData.append('itemTitle', metadata.itemTitle);
            formData.append('sourceType', metadata.sourceType);

            this.progressCallback(30, 'Uploading file...');

            // Upload to the correct RAG endpoint
            const response = await fetch('/api/rag/documents/file', {
                method: 'POST',
                body: formData
            });

            this.progressCallback(70, 'Processing file...');

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            this.progressCallback(90, 'Finalizing upload...');

            // Create the document object with the response data
            const document: AdditionalMaterial = {
                id: result.data?.id || this.generateId(),
                name: result.data?.name || metadata.name,
                courseName: metadata.courseName,
                divisionTitle: metadata.divisionTitle,
                itemTitle: metadata.itemTitle,
                sourceType: metadata.sourceType,
                fileName: file.name,
                uploaded: true,
                qdrantId: result.data?.qdrantId,
                date: new Date()
            };

            this.progressCallback(100, 'Upload complete!');

            return {
                success: true,
                document: document,
                chunksGenerated: result.data?.chunksGenerated || 0
            };

        } catch (error) {
            console.error('Error uploading file:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'File upload failed' 
            };
        }
    }

    /**
     * Upload text content to the RAG system
     */
    private async uploadText(text: string, metadata: Omit<AdditionalMaterial, 'id' | 'file' | 'text' | 'date'>): Promise<UploadResult> {
        try {
            this.progressCallback(20, 'Preparing text upload...');

            this.progressCallback(30, 'Uploading text...');

            // Upload to the correct RAG endpoint
            const response = await fetch('/api/rag/documents/text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    name: metadata.name,
                    courseName: metadata.courseName,
                    divisionTitle: metadata.divisionTitle,
                    itemTitle: metadata.itemTitle,
                    sourceType: metadata.sourceType
                })
            });

            this.progressCallback(70, 'Processing text...');

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            this.progressCallback(90, 'Finalizing upload...');

            // Create the document object with the response data
            const document: AdditionalMaterial = {
                id: result.data?.id || this.generateId(),
                name: result.data?.name || metadata.name,
                courseName: metadata.courseName,
                divisionTitle: metadata.divisionTitle,
                itemTitle: metadata.itemTitle,
                sourceType: metadata.sourceType,
                text: text,
                uploaded: true,
                qdrantId: result.data?.qdrantId,
                date: new Date()
            };

            this.progressCallback(100, 'Upload complete!');

            return {
                success: true,
                document: document,
                chunksGenerated: result.data?.chunksGenerated || 0
            };

        } catch (error) {
            console.error('Error uploading text:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Text upload failed' 
            };
        }
    }

    /**
     * Generate a unique ID for documents
     */
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Convenience function to create a document upload module
 */
export function createDocumentUploadModule(progressCallback?: (progress: number, stage: string) => void): DocumentUploadModule {
    return new DocumentUploadModule(progressCallback);
}

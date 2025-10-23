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
        'text/plain': ['.md'], // Allow .md files even when MIME type is text/plain
    };

    // File extension to MIME type mapping for better detection
    private static readonly EXTENSION_TO_MIME: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.md': 'text/markdown',
        '.txt': 'text/plain',
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
        // Return file extensions for better browser compatibility
        const supportedExtensions = Object.values(DocumentUploadModule.SUPPORTED_FILE_TYPES).flat();
        return supportedExtensions.join(',');
    }

    /**
     * Get supported MIME types as a string for HTML accept attribute
     */
    public getSupportedMimeTypes(): string {
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

        // Get file extension
        const fileExtension = this.getFileExtension(file.name);
        if (!fileExtension) {
            return {
                isValid: false,
                error: 'File must have a valid extension'
            };
        }

        // Check if extension is supported
        const supportedExtensions = Object.values(DocumentUploadModule.SUPPORTED_FILE_TYPES).flat();
        if (!supportedExtensions.includes(fileExtension)) {
            return {
                isValid: false,
                error: `Unsupported file type. Supported types: ${supportedExtensions.join(', ')}`
            };
        }

        // For .md files, also check if MIME type is acceptable
        if (fileExtension === '.md') {
            const validMimeTypes = ['text/markdown', 'text/plain', 'application/octet-stream'];
            if (!validMimeTypes.includes(file.type)) {
                console.warn(`MD file detected with unexpected MIME type: ${file.type}. Proceeding anyway.`);
            }
        }

        return { isValid: true };
    }

    /**
     * Get file extension from filename
     */
    private getFileExtension(filename: string): string {
        const lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
            return '';
        }
        return filename.substring(lastDotIndex).toLowerCase();
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
                    sourceType: document.sourceType,
                    courseId: document.courseId,
                    divisionId: document.divisionId,
                    itemId: document.itemId
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
                    sourceType: document.sourceType,
                    courseId: document.courseId,
                    divisionId: document.divisionId,
                    itemId: document.itemId
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
            
            // For .md files, create a new File object with correct MIME type
            let fileToUpload = file;
            const fileExtension = this.getFileExtension(file.name);
            if (fileExtension === '.md' && file.type !== 'text/markdown') {
                // Create a new File object with the correct MIME type
                fileToUpload = new File([file], file.name, { 
                    type: 'text/markdown',
                    lastModified: file.lastModified 
                });
            }
            
            formData.append('file', fileToUpload);
            formData.append('name', metadata.name);
            formData.append('courseName', metadata.courseName);
            formData.append('divisionTitle', metadata.divisionTitle);
            formData.append('itemTitle', metadata.itemTitle);
            formData.append('sourceType', metadata.sourceType);
            // Add these three lines:
            formData.append('courseId', (metadata as any).courseId || '');
            formData.append('divisionId', (metadata as any).divisionId || '');
            formData.append('itemId', (metadata as any).itemId || '');

            this.progressCallback(30, 'Uploading file...');

            console.log('🔍 UPLOAD FILE - Request Details:');
            console.log('  URL:', '/api/rag/documents/file');
            console.log('  Method: POST');
            console.log('  File Name:', fileToUpload.name);
            console.log('  File Size:', fileToUpload.size);
            console.log('  File Type:', fileToUpload.type);
            console.log('  FormData Contents:');
            for (const [key, value] of formData.entries()) {
                if (value instanceof File) {
                    console.log(`    ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
                } else {
                    console.log(`    ${key}: ${value}`);
                }
            }

            // Upload to the correct RAG endpoint
            const response = await fetch('/api/rag/documents/file', {
                method: 'POST',
                body: formData
            });

            this.progressCallback(70, 'Processing file...');

            console.log('🔍 UPLOAD FILE - Response Details:');
            console.log('  Status:', response.status);
            console.log('  Status Text:', response.statusText);
            console.log('  Headers:', Object.fromEntries(response.headers.entries()));
            console.log('  Content-Type:', response.headers.get('content-type'));

            if (!response.ok) {
                const errorText = await response.text();
                console.log('🔍 UPLOAD FILE - Error Response Body (raw):');
                console.log('  Raw Response:', errorText);
                
                try {
                    const errorData = JSON.parse(errorText);
                    console.log('🔍 UPLOAD FILE - Error Response Body (parsed):');
                    console.log('  Parsed Error:', errorData);
                } catch (parseError) {
                    console.log('🔍 UPLOAD FILE - JSON Parse Error:');
                    console.log('  Parse Error:', parseError);
                }
                
                throw new Error(`Upload failed: ${response.status} - ${errorText}`);
            }

            const responseText = await response.text();
            console.log('🔍 UPLOAD FILE - Success Response Body (raw):');
            console.log('  Raw Response:', responseText);
            
            let result;
            try {
                result = JSON.parse(responseText);
                console.log('🔍 UPLOAD FILE - Success Response Body (parsed):');
                console.log('  Parsed Result:', result);
            } catch (parseError) {
                console.log('🔍 UPLOAD FILE - JSON Parse Error:');
                console.log('  Parse Error:', parseError);
                throw new Error(`Invalid JSON response: ${responseText}`);
            }

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

            const requestBody = {
                text: text,
                name: metadata.name,
                courseName: metadata.courseName,
                divisionTitle: metadata.divisionTitle,
                itemTitle: metadata.itemTitle,
                sourceType: metadata.sourceType,
                // Add these three lines:
                courseId: (metadata as any).courseId || '',
                divisionId: (metadata as any).divisionId || '',
                itemId: (metadata as any).itemId || ''
            };

            console.log('🔍 UPLOAD TEXT - Request Details:');
            console.log('  URL:', '/api/rag/documents/text');
            console.log('  Method: POST');
            console.log('  Headers:', { 'Content-Type': 'application/json' });
            console.log('  Request Body:', requestBody);
            console.log('  Text Length:', text.length);

            // Upload to the correct RAG endpoint
            const response = await fetch('/api/rag/documents/text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            this.progressCallback(70, 'Processing text...');

            console.log('🔍 UPLOAD TEXT - Response Details:');
            console.log('  Status:', response.status);
            console.log('  Status Text:', response.statusText);
            console.log('  Headers:', Object.fromEntries(response.headers.entries()));
            console.log('  Content-Type:', response.headers.get('content-type'));

            if (!response.ok) {
                const errorText = await response.text();
                console.log('🔍 UPLOAD TEXT - Error Response Body (raw):');
                console.log('  Raw Response:', errorText);
                
                try {
                    const errorData = JSON.parse(errorText);
                    console.log('🔍 UPLOAD TEXT - Error Response Body (parsed):');
                    console.log('  Parsed Error:', errorData);
                } catch (parseError) {
                    console.log('🔍 UPLOAD TEXT - JSON Parse Error:');
                    console.log('  Parse Error:', parseError);
                }
                
                throw new Error(`Upload failed: ${response.status} - ${errorText}`);
            }

            const responseText = await response.text();
            console.log('🔍 UPLOAD TEXT - Success Response Body (raw):');
            console.log('  Raw Response:', responseText);
            
            let result;
            try {
                result = JSON.parse(responseText);
                console.log('🔍 UPLOAD TEXT - Success Response Body (parsed):');
                console.log('  Parsed Result:', result);
            } catch (parseError) {
                console.log('🔍 UPLOAD TEXT - JSON Parse Error:');
                console.log('  Parse Error:', parseError);
                throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
            }

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

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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Document Upload Module Class
 */
export class DocumentUploadModule {
    constructor(progressCallback = () => { }) {
        this.progressCallback = progressCallback;
    }
    /**
     * Get supported file types as a string for HTML accept attribute
     */
    getSupportedFileTypes() {
        // Return file extensions for better browser compatibility
        const supportedExtensions = Object.values(DocumentUploadModule.SUPPORTED_FILE_TYPES).flat();
        return supportedExtensions.join(',');
    }
    /**
     * Get supported MIME types as a string for HTML accept attribute
     */
    getSupportedMimeTypes() {
        return Object.keys(DocumentUploadModule.SUPPORTED_FILE_TYPES).join(',');
    }
    /**
     * Validate a file before upload
     */
    validateFile(file) {
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
    getFileExtension(filename) {
        const lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
            return '';
        }
        return filename.substring(lastDotIndex).toLowerCase();
    }
    /**
     * Validate text content before upload
     */
    validateText(text) {
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
    uploadDocument(document) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.progressCallback(10, 'Validating document...');
                // Validate based on source type
                if (document.sourceType === 'file' && document.file) {
                    const validation = this.validateFile(document.file);
                    if (!validation.isValid) {
                        return { success: false, error: validation.error };
                    }
                    return yield this.uploadFile(document.file, {
                        name: document.name,
                        courseName: document.courseName,
                        topicOrWeekTitle: document.topicOrWeekTitle,
                        itemTitle: document.itemTitle,
                        sourceType: document.sourceType,
                        courseId: document.courseId,
                        topicOrWeekId: document.topicOrWeekId,
                        itemId: document.itemId
                    });
                }
                else if (document.sourceType === 'text' && document.text) {
                    const validation = this.validateText(document.text);
                    if (!validation.isValid) {
                        return { success: false, error: validation.error };
                    }
                    return yield this.uploadText(document.text, {
                        name: document.name,
                        courseName: document.courseName,
                        topicOrWeekTitle: document.topicOrWeekTitle,
                        itemTitle: document.itemTitle,
                        sourceType: document.sourceType,
                        courseId: document.courseId,
                        topicOrWeekId: document.topicOrWeekId,
                        itemId: document.itemId
                    });
                }
                else {
                    return { success: false, error: 'Invalid document: must have either file or text content' };
                }
            }
            catch (error) {
                console.error('Error in uploadDocument:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error occurred'
                };
            }
        });
    }
    /**
     * Upload a file to the RAG system
     */
    uploadFile(file, metadata) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
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
                formData.append('topicOrWeekTitle', metadata.topicOrWeekTitle);
                formData.append('itemTitle', metadata.itemTitle);
                formData.append('sourceType', metadata.sourceType);
                // Add these three lines:
                formData.append('courseId', metadata.courseId || '');
                formData.append('topicOrWeekId', metadata.topicOrWeekId || '');
                formData.append('itemId', metadata.itemId || '');
                this.progressCallback(30, 'Uploading file...');
                // console.log('🔍 UPLOAD FILE - Request Details:'); // 🔴 CRITICAL: Upload request details
                // console.log('  URL:', '/api/rag/documents/file'); // 🔴 CRITICAL: API endpoint exposure
                // console.log('  Method: POST'); // 🟢 MEDIUM: HTTP method
                // console.log('  File Name:', fileToUpload.name); // 🔴 CRITICAL: Uploaded file name exposure
                // console.log('  File Size:', fileToUpload.size); // 🟡 HIGH: File size metadata
                // console.log('  File Type:', fileToUpload.type); // 🟡 HIGH: File type metadata
                // console.log('  FormData Contents:'); // 🔴 CRITICAL: Form data contents
                // for (const [key, value] of formData.entries()) {
                //     if (value instanceof File) {
                //         console.log(`    ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
                //     } else {
                //         console.log(`    ${key}: ${value}`);
                //     }
                // }
                // Upload to the correct RAG endpoint
                const response = yield fetch('/api/rag/documents/file', {
                    method: 'POST',
                    body: formData
                });
                this.progressCallback(70, 'Processing file...');
                // console.log('🔍 UPLOAD FILE - Response Details:'); // 🔴 CRITICAL: Response details logging
                // console.log('  Status:', response.status); // 🟢 MEDIUM: HTTP status
                // console.log('  Status Text:', response.statusText); // 🟢 MEDIUM: HTTP status text
                // console.log('  Headers:', Object.fromEntries(response.headers.entries())); // 🔴 CRITICAL: Response headers exposure
                // console.log('  Content-Type:', response.headers.get('content-type')); // 🟡 HIGH: Content type header
                if (!response.ok) {
                    const errorText = yield response.text();
                    // console.log('🔍 UPLOAD FILE - Error Response Body (raw):'); // 🔴 CRITICAL: Raw error response exposure
                    // console.log('  Raw Response:', errorText); // 🔴 CRITICAL: Error response content
                    try {
                        const errorData = JSON.parse(errorText);
                        // console.log('🔍 UPLOAD FILE - Error Response Body (parsed):'); // 🔴 CRITICAL: Parsed error response
                        // console.log('  Parsed Error:', errorData); // 🔴 CRITICAL: Error data content
                    }
                    catch (parseError) {
                        // console.log('🔍 UPLOAD FILE - JSON Parse Error:'); // 🟢 MEDIUM: Parse error logging
                        // console.log('  Parse Error:', parseError); // 🟢 MEDIUM: Parse error details
                    }
                    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
                }
                const responseText = yield response.text();
                // console.log('🔍 UPLOAD FILE - Success Response Body (raw):'); // 🔴 CRITICAL: Raw success response exposure
                // console.log('  Raw Response:', responseText); // 🔴 CRITICAL: Success response content
                let result;
                try {
                    result = JSON.parse(responseText);
                    // console.log('🔍 UPLOAD FILE - Success Response Body (parsed):'); // 🔴 CRITICAL: Parsed success response
                    // console.log('  Parsed Result:', result); // 🔴 CRITICAL: Upload result data
                }
                catch (parseError) {
                    // console.log('🔍 UPLOAD FILE - JSON Parse Error:'); // 🟢 MEDIUM: Parse error logging
                    // console.log('  Parse Error:', parseError); // 🟢 MEDIUM: Parse error details
                    throw new Error(`Invalid JSON response: ${responseText}`);
                }
                this.progressCallback(90, 'Finalizing upload...');
                // Create the document object with the response data
                const document = {
                    id: ((_a = result.data) === null || _a === void 0 ? void 0 : _a.id) || this.generateId(),
                    name: ((_b = result.data) === null || _b === void 0 ? void 0 : _b.name) || metadata.name,
                    courseName: metadata.courseName,
                    topicOrWeekTitle: metadata.topicOrWeekTitle,
                    itemTitle: metadata.itemTitle,
                    sourceType: metadata.sourceType,
                    fileName: file.name,
                    uploaded: true,
                    qdrantId: (_c = result.data) === null || _c === void 0 ? void 0 : _c.qdrantId,
                    date: new Date()
                };
                this.progressCallback(100, 'Upload complete!');
                return {
                    success: true,
                    document: document,
                    chunksGenerated: ((_d = result.data) === null || _d === void 0 ? void 0 : _d.chunksGenerated) || 0
                };
            }
            catch (error) {
                console.error('Error uploading file:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'File upload failed'
                };
            }
        });
    }
    /**
     * Upload text content to the RAG system
     */
    uploadText(text, metadata) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            try {
                this.progressCallback(20, 'Preparing text upload...');
                this.progressCallback(30, 'Uploading text...');
                const requestBody = {
                    text: text,
                    name: metadata.name,
                    courseName: metadata.courseName,
                    topicOrWeekTitle: metadata.topicOrWeekTitle,
                    itemTitle: metadata.itemTitle,
                    sourceType: metadata.sourceType,
                    // Add these three lines:
                    courseId: metadata.courseId || '',
                    topicOrWeekId: metadata.topicOrWeekId || '',
                    itemId: metadata.itemId || ''
                };
                // console.log('🔍 UPLOAD TEXT - Request Details:'); // 🔴 CRITICAL: Text upload request details
                // console.log('  URL:', '/api/rag/documents/text'); // 🔴 CRITICAL: API endpoint exposure
                // console.log('  Method: POST'); // 🟢 MEDIUM: HTTP method
                // console.log('  Headers:', { 'Content-Type': 'application/json' }); // 🟢 MEDIUM: Standard headers
                // console.log('  Request Body:', requestBody); // 🔴 CRITICAL: Text content exposure
                // console.log('  Text Length:', text.length); // 🟡 HIGH: Text content metadata
                // Upload to the correct RAG endpoint
                const response = yield fetch('/api/rag/documents/text', {
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
                    const errorText = yield response.text();
                    console.log('🔍 UPLOAD TEXT - Error Response Body (raw):');
                    console.log('  Raw Response:', errorText);
                    try {
                        const errorData = JSON.parse(errorText);
                        console.log('🔍 UPLOAD TEXT - Error Response Body (parsed):');
                        console.log('  Parsed Error:', errorData);
                    }
                    catch (parseError) {
                        console.log('🔍 UPLOAD TEXT - JSON Parse Error:');
                        console.log('  Parse Error:', parseError);
                    }
                    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
                }
                const responseText = yield response.text();
                console.log('🔍 UPLOAD TEXT - Success Response Body (raw):');
                console.log('  Raw Response:', responseText);
                let result;
                try {
                    result = JSON.parse(responseText);
                    console.log('🔍 UPLOAD TEXT - Success Response Body (parsed):');
                    console.log('  Parsed Result:', result);
                }
                catch (parseError) {
                    console.log('🔍 UPLOAD TEXT - JSON Parse Error:');
                    console.log('  Parse Error:', parseError);
                    throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
                }
                this.progressCallback(90, 'Finalizing upload...');
                // Create the document object with the response data
                const document = {
                    id: ((_a = result.data) === null || _a === void 0 ? void 0 : _a.id) || this.generateId(),
                    name: ((_b = result.data) === null || _b === void 0 ? void 0 : _b.name) || metadata.name,
                    courseName: metadata.courseName,
                    topicOrWeekTitle: metadata.topicOrWeekTitle,
                    itemTitle: metadata.itemTitle,
                    sourceType: metadata.sourceType,
                    text: text,
                    uploaded: true,
                    qdrantId: (_c = result.data) === null || _c === void 0 ? void 0 : _c.qdrantId,
                    date: new Date()
                };
                this.progressCallback(100, 'Upload complete!');
                return {
                    success: true,
                    document: document,
                    chunksGenerated: ((_d = result.data) === null || _d === void 0 ? void 0 : _d.chunksGenerated) || 0
                };
            }
            catch (error) {
                console.error('Error uploading text:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Text upload failed'
                };
            }
        });
    }
    /**
     * Generate a unique ID for documents
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
// Supported file types and their MIME types
DocumentUploadModule.SUPPORTED_FILE_TYPES = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/html': ['.html', '.htm'],
    'text/markdown': ['.md'],
    'text/plain': ['.md'], // Allow .md files even when MIME type is text/plain
};
// File extension to MIME type mapping for better detection
DocumentUploadModule.EXTENSION_TO_MIME = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
};
// File size limits
DocumentUploadModule.FILE_SIZE_LIMITS = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
    MAX_TEXT_LENGTH: 1000000, // 1 million characters
};
/**
 * Convenience function to create a document upload module
 */
export function createDocumentUploadModule(progressCallback) {
    return new DocumentUploadModule(progressCallback);
}

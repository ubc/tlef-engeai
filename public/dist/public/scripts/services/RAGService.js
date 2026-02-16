/**
 * Service for interacting with the RAG backend
 *
 * This service provides functions for uploading content to the RAG system
 * using the correct backend endpoints.
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
import { DocumentUploadModule } from './DocumentUploadModule.js';
/**
 * Uploads content to the RAG system using the DocumentUploadModule
 *
 * @param content - The content to upload
 * @returns Promise with the upload result
 */
export function uploadRAGContent(content) {
    return __awaiter(this, void 0, void 0, function* () {
        // console.log('DEBUG #23 : Uploading content to RAG system'); // 🟢 MEDIUM: Upload operation logging
        try {
            const uploadModule = new DocumentUploadModule((progress, stage) => {
                // console.log(`Upload progress: ${progress}% - ${stage}`); // 🟢 MEDIUM: Progress logging
            });
            const result = yield uploadModule.uploadDocument(content);
            // console.log('DEBUG #24 : RAG upload result:', result); // 🟡 HIGH: RAG processing results exposure
            return result;
        }
        catch (error) {
            console.error('Error uploading to RAG system:', error);
            throw error;
        }
    });
}
/**
 * Search for documents in the RAG system
 *
 * @param query - The search query
 * @param courseName - Optional course name filter
 * @returns Promise with search results
 */
export function searchDocuments(query, courseName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('/api/rag/documents/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    courseName: courseName
                })
            });
            if (!response.ok) {
                const errorText = yield response.text();
                throw new Error(`Search failed: ${response.status} - ${errorText}`);
            }
            return yield response.json();
        }
        catch (error) {
            console.error('Error searching documents:', error);
            throw error;
        }
    });
}
/**
 * Get documents by course
 *
 * @param courseName - The course name
 * @returns Promise with documents
 */
export function getDocumentsByCourse(courseName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`/api/rag/documents/course/${encodeURIComponent(courseName)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            if (!response.ok) {
                const errorText = yield response.text();
                throw new Error(`Failed to get documents: ${response.status} - ${errorText}`);
            }
            return yield response.json();
        }
        catch (error) {
            console.error('Error getting documents by course:', error);
            throw error;
        }
    });
}
/**
 * Delete a document from the RAG system
 *
 * @param documentId - The document ID to delete
 * @returns Promise with deletion result
 */
export function deleteDocument(documentId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`/api/rag/documents/${documentId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            if (!response.ok) {
                const errorText = yield response.text();
                throw new Error(`Delete failed: ${response.status} - ${errorText}`);
            }
            return yield response.json();
        }
        catch (error) {
            console.error('Error deleting document:', error);
            throw error;
        }
    });
}

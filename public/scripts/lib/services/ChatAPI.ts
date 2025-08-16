
// File: public/scripts/lib/services/ChatAPI.ts

/**
 * ChatAPI - Service layer for all chat-related server communication
 * 
 * Purpose: Centralized API communication layer that handles all requests
 * to the backend server. Includes error handling, request/response typing,
 * retry logic, and Canvas authentication integration.
 * 
 * Use Cases:
 * - Sending chat messages to AI backend
 * - Uploading files and documents
 * - User authentication and session management
 * - Fetching chat history and metadata
 * - Error reporting and analytics
 * 
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-15
 */

import { 
    ChatMessage, 
    ApiResponse, 
    ChatResponse, 
    SendMessageRequest,
    FlagSubmission, 
    FileUploadResponse, 
    UserSession, 
    ApiConfig 
} from './ChatTypes';

const DEFAULT_CONFIG: ApiConfig = {
    baseUrl: '',  // Same origin for Canvas compatibility
    timeout: 30000,  // 30 seconds
    retryAttempts: 3,
    retryDelay: 1000  // 1 second
};


export class ChatApi {

    //===== PRIVATE PROPERTIES =====
    private static config: ApiConfig = DEFAULT_CONFIG;
    private static sessionInfo: UserSession | null = null;

    // ===== CONFIGURATION =====

    /**
     * Configure API settings
     * @param config - Partial configiration of the porject
     */

    static configure(config: Partial<ApiConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * set user session information (from Canvas LTI)
     * @param session - User session information
     */

    static setSession(session: UserSession): void {
        this.sessionInfo = session;
    }

    // ===== CORE API METODS =====

    /**
     * send message to the AI backend
     * @param message  - User's message text
     * @param chatId - optional chat ID for context
     * @returns AI response with potential artefacts
     */

    static async sendMessage(message: string, chatID?: string): Promise<ChatResponse> {
        const requestData : SendMessageRequest = {
            message: message.trim(),
            chatId: chatID,
            timestamp: Date.now(),
            session: this.sessionInfo
        };

        //sending request to the backend
        const response = await this.makeRequest<ChatResponse>('POST', '/api/chat/send-message', requestData);

        //validate response structure
        if (!response.reply) {
            throw new Error('Invalid response structure');
        }

        return {
            reply: response.reply,
            timestamp: response.timestamp,
            artefact: response.artefact,
            metadata: response.metadata,
        }
        
    }

    /**
     * Get chat history for a specific chat
     * @param chatId - Chat identifier
     * @param limit - Maximum number of messages to fetch
     * @param offset - Offset for pagination
     * @returns Array of chat messages
     */
    static async getChatHistory(
        chatId: number, 
        limit: number = 50, 
        offset: number = 0
    ): Promise<ChatMessage[]> {
        const params = new URLSearchParams({
            limit: limit.toString(),
            offset: offset.toString()
        });

        const response = await this.makeRequest<{ messages: ChatMessage[] }>(
            'GET', 
            `/api/chat/${chatId}/history?${params}`
        );

        return response.messages || [];
    }

    /**
     * Create a new chat session
     * @param title - Optional chat title
     * @returns New chat information
     */
    static async createChat(title?: string): Promise<{ id: number; title: string; createdAt: number }> {
        const requestData = {
            title: title || 'New Chat',
            timestamp: Date.now(),
            session: this.sessionInfo
        };

        return await this.makeRequest('POST', '/api/chat/create', requestData);
    }

    /**
     * Delete a chat session
     * @param chatId - Chat identifier
     * @returns Confirmation of deletion
     */
    static async deleteChat(chatId: number): Promise<{ success: boolean }> {
        return await this.makeRequest('DELETE', `/api/chat/${chatId}`);
    }

    /**
     * Update chat metadata (title, settings, etc.)
     * @param chatId - Chat identifier
     * @param updates - Fields to update
     * @returns Updated chat information
     */
    static async updateChat(
        chatId: number, 
        updates: { title?: string; isPinned?: boolean; settings?: Record<string, any> }
    ): Promise<{ success: boolean }> {
        return await this.makeRequest('PATCH', `/api/chat/${chatId}`, updates);
    }

    // ===== FILE OPERATIONS =====

    /**
     * Upload a file for processing
     * @param file - File to upload
     * @param chatId - Associated chat ID
     * @returns Upload confirmation with file metadata
     */
    static async uploadFile(file: File, chatId?: number): Promise<FileUploadResponse> {
        const formData = new FormData();
        formData.append('file', file);
        
        if (chatId) {
            formData.append('chatId', chatId.toString());
        }
        
        if (this.sessionInfo) {
            formData.append('session', JSON.stringify(this.sessionInfo));
        }

        // Special handling for file uploads
        const response = await fetch(`${this.config.baseUrl}/api/upload`, {
            method: 'POST',
            body: formData,
            // Don't set Content-Type header - let browser set it with boundary
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Upload failed');
        }

        return result;
    }

    /**
     * Get list of uploaded files for a chat
     * @param chatId - Chat identifier
     * @returns Array of file metadata
     */
    static async getFiles(chatId: number): Promise<Array<{
        id: string;
        name: string;
        size: number;
        type: string;
        uploadedAt: number;
    }>> {
        const response = await this.makeRequest<{ files: any[] }>('GET', `/api/chat/${chatId}/files`);
        return response.files || [];
    }

    // ===== USER INTERACTIONS =====

    /**
     * Submit a flag report for inappropriate content
     * @param messageId - ID of the message being flagged
     * @param reasons - Array of reason codes
     * @param additionalInfo - Optional additional information
     * @returns Confirmation of flag submission
     */
    static async submitFlag(
        messageId: number, 
        reasons: string[], 
        additionalInfo?: string
    ): Promise<{ success: boolean; reportId: string }> {
        const flagData: FlagSubmission = {
            messageId,
            reasons,
            additionalInfo,
            userAgent: navigator.userAgent,
            timestamp: Date.now()
        };

        return await this.makeRequest('POST', '/api/flag', flagData);
    }

    /**
     * Submit feedback about the AI response
     * @param messageId - ID of the message
     * @param rating - Numeric rating (1-5)
     * @param feedback - Optional text feedback
     * @returns Confirmation of feedback submission
     */
    static async submitFeedback(
        messageId: number, 
        rating: number, 
        feedback?: string
    ): Promise<{ success: boolean }> {
        const feedbackData = {
            messageId,
            rating: Math.max(1, Math.min(5, rating)), // Clamp to 1-5 range
            feedback,
            timestamp: Date.now(),
            session: this.sessionInfo
        };

        return await this.makeRequest('POST', '/api/feedback', feedbackData);
    }

    // ===== ANALYTICS AND LOGGING =====

    /**
     * Log user interaction for analytics
     * @param action - Action type (e.g., 'message_sent', 'chat_created')
     * @param data - Additional data about the action
     */
    static async logInteraction(action: string, data?: Record<string, any>): Promise<void> {
        try {
            const logData = {
                action,
                data,
                timestamp: Date.now(),
                session: this.sessionInfo,
                userAgent: navigator.userAgent,
                url: window.location.href
            };

            // Fire and forget - don't wait for response or throw errors
            this.makeRequest('POST', '/api/analytics/interaction', logData).catch(error => {
                console.warn('Analytics logging failed:', error);
            });
        } catch (error) {
            console.warn('Analytics logging failed:', error);
        }
    }

    /**
     * Report an error to the server for debugging
     * @param error - Error object or message
     * @param context - Additional context about when the error occurred
     */
    static async reportError(error: Error | string | null, context?: Record<string, any>): Promise<void> {
        try {
            const errorData = {
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                } : { message: String(error) },
                context,
                timestamp: Date.now(),
                session: this.sessionInfo,
                userAgent: navigator.userAgent,
                url: window.location.href
            };

            // Fire and forget
            this.makeRequest('POST', '/api/error-report', errorData).catch(console.warn);
        } catch (reportError) {
            console.warn('Error reporting failed:', reportError);
        }
    }

    // ===== CORE REQUEST HANDLER =====

    /**
     * Make HTTP request with error handling, retries, and timeouts
     * @param method - HTTP method
     * @param endpoint - API endpoint
     * @param data - Request payload
     * @returns Response data
     */

    private static async makeRequest<T = any>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
        endpoint: string,
        data?: any,
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;
        let lastError: Error | null = null;

        for (let attempt = 1 ; attempt <= this.config.retryAttempts ; attempt++ ){
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout( () => controller.abort(), this.config.timeout );

                const requestOptions : RequestInit = {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest', // canvas CSRF protection
                    },

                    signal: controller.signal,
                }

                //add session info to its headers if available
                if (this.sessionInfo) {
                    requestOptions.headers = {
                        ...requestOptions.headers,
                        'X-Session-Id' : this.sessionInfo.sessionId,
                        'X-User-Id' : this.sessionInfo.userId
                    }
                }

                //add request body for non-GET requests
                if (data && method !== 'GET') {
                    requestOptions.body = JSON.stringify(data);
                }

                const response = await fetch(url, requestOptions);
                clearTimeout(timeoutId);

                //handle HTTP errors
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage : string;

                    try {
                        const errorJSON = JSON.parse(errorText);
                        errorMessage = errorJSON.error || errorJSON.message || `HTTP ${response.status}`;
                    }
                    catch (parseError) {
                        errorMessage = errorText || `HTTP ${response.status}`;
                    }

                    throw new Error(errorMessage);
                }

                //parse response body my json
                const responseText = await response.text();
                if (!responseText) {
                    return {} as T; // Empty response is valid for some endpoints
                }

                try {
                    const result = JSON.parse(responseText);

                    //handle API reponse errors
                    if (result.success === false) {
                        throw new Error(result.error || result.message || 'API Error');
                    }

                    return result as T;
                }
                catch (parseError) {
                    if (parseError instanceof Error && parseError.message.includes('API request failed')) {
                        throw parseError;
                    }
                    throw new Error(`Invalid JSON response: ${parseError}`);
                } 
                
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Don't retry on certain types of errors
                if (this.isNonRetriableError(lastError)) {
                    break;
                }

                // Wait before retrying (with exponential backoff)
                if (attempt < this.config.retryAttempts) {
                    const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
                    await this.sleep(delay);
                }
            }
            
        }
        // All attempts failed
        this.reportError(lastError, { endpoint, method, attempts: this.config.retryAttempts });
        throw lastError;
    }

    // ===== HELPER METHODS =====

    /**
     * Check if an error should not be retried
     * @param error - Error to check
     * @returns True if error should not be retried
     */
    private static isNonRetriableError(error: Error): boolean {
        const message = error.message.toLowerCase();
        
        // Don't retry on client errors (400-499)
        if (message.includes('http 4')) {
            return true;
        }

        // Don't retry on authentication errors
        if (message.includes('unauthorized') || message.includes('forbidden')) {
            return true;
        }

        // Don't retry on validation errors
        if (message.includes('validation') || message.includes('invalid')) {
            return true;
        }

        return false;
    }


    /**
     * Sleep for specified milliseconds
     * @param ms - Milliseconds to sleep
     * @returns Promise that resolves after delay
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current session information
     * @returns Current session or null
     */
    static getSession(): UserSession | null {
        return this.sessionInfo;
    }

    /**
     * Check if API is configured and ready
     * @returns True if API is ready to use
     */
    static isReady(): boolean {
        return this.sessionInfo !== null;
    }

    /**
     * Get API configuration
     * @returns Current API configuration
     */
    static getConfig(): Readonly<ApiConfig> {
        return { ...this.config };
    }


}
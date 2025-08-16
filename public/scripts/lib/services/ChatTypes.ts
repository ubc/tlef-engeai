// File: public/scripts/lib/services/ChatTypes.ts

// ===== TYPE DEFINITIONS =====

interface ChatMessage {
    id: number;
    sender: 'user' | 'bot';
    text: string;
    timestamp: number;
    artefact?: {
        type: 'mermaid';
        source: string;
        title?: string;
    };
}

interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    timestamp: number;
}

interface ChatResponse {
    reply: string;
    timestamp: number;
    artefact?: {
        type: 'mermaid';
        source: string;
        title?: string;
    };
    metadata?: {
        processingTime: number;
        tokensUsed: number;
        sources?: string[];
    };
}

interface SendMessageRequest {
    message: string;
    chatId?: string;
    timestamp: number;
    session: UserSession | null;
}

interface FlagSubmission {
    messageId: number;
    reasons: string[];
    additionalInfo?: string;
    userAgent: string;
    timestamp: number;
}

interface FileUploadResponse {
    success: boolean;
    fileId: string;
    fileName: string;
    fileSize: number;
    uploadedAt: number;
}

interface UserSession {
    userId: string;
    sessionId: string;
    canvasContext?: {
        courseId: string;
        userId: string;
        roles: string[];
    };
}

// ===== API CONFIGURATION =====

interface ApiConfig {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
}

export type { ChatMessage, ApiResponse, ChatResponse, SendMessageRequest, FlagSubmission, FileUploadResponse, UserSession, ApiConfig };

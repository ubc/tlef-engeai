/**
 * Frontend Chat Streaming Integration Example
 * Shows how to integrate with the streaming chat API
 */

import { createNewChat, CreateChatRequest } from './functions/api';

export interface ChatStreamEvent {
    type: 'connected' | 'chunk' | 'complete' | 'error';
    content?: string;
    messageId?: string;
    message?: any;
    error?: string;
}

export class ChatStreamingClient {
    private chatId: string | null = null;
    private eventSource: EventSource | null = null;

    /**
     * Create a new chat session
     */
    async createChat(userID: string, courseName: string, date: string): Promise<boolean> {
        try {
            const request: CreateChatRequest = { userID, courseName, date };
            const response = await createNewChat(request);
            
            if (response.success && response.chatId) {
                this.chatId = response.chatId;
                console.log('✅ Chat created:', this.chatId);
                return true;
            } else {
                console.error('❌ Failed to create chat:', response.error);
                return false;
            }
        } catch (error) {
            console.error('❌ Error creating chat:', error);
            return false;
        }
    }

    /**
     * Send a message and stream the response
     */
    async sendMessage(
        message: string, 
        userId: string,
        onChunk: (chunk: string) => void,
        onComplete: (message: any) => void,
        onError: (error: string) => void
    ): Promise<void> {
        if (!this.chatId) {
            onError('No active chat session');
            return;
        }

        try {
            // Close existing connection
            this.closeConnection();

            // Create new EventSource for streaming
            const url = `/api/chat/${this.chatId}`;
            this.eventSource = new EventSource(url, {
                // Note: EventSource doesn't support POST, so we'll use fetch for now
                // In a real implementation, you'd need to use a different approach
            });

            // For now, we'll use fetch and process the stream manually
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, userId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                onError(errorData.error || 'Failed to send message');
                return;
            }

            // Process the stream
            const reader = response.body?.getReader();
            if (!reader) {
                onError('Stream not available');
                return;
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event: ChatStreamEvent = JSON.parse(line.slice(6));
                            
                            switch (event.type) {
                                case 'connected':
                                    console.log('🔗 Connected to stream');
                                    break;
                                case 'chunk':
                                    if (event.content) {
                                        onChunk(event.content);
                                    }
                                    break;
                                case 'complete':
                                    if (event.message) {
                                        onComplete(event.message);
                                    }
                                    break;
                                case 'error':
                                    if (event.error) {
                                        onError(event.error);
                                    }
                                    break;
                            }
                        } catch (parseError) {
                            // Skip malformed JSON
                        }
                    }
                }
            }

        } catch (error) {
            onError(error instanceof Error ? error.message : 'Unknown error');
        }
    }

    /**
     * Get chat history
     */
    async getChatHistory(): Promise<any[]> {
        if (!this.chatId) {
            return [];
        }

        try {
            const response = await fetch(`/api/chat/${this.chatId}/history`);
            const data = await response.json();
            return data.success ? data.history : [];
        } catch (error) {
            console.error('Error getting chat history:', error);
            return [];
        }
    }

    /**
     * Close the streaming connection
     */
    closeConnection(): void {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    /**
     * Get current chat ID
     */
    getChatId(): string | null {
        return this.chatId;
    }
}

// Example usage
export function initializeChatExample() {
    const chatClient = new ChatStreamingClient();
    
    // Example: Create a chat
    chatClient.createChat('user123', 'CHBE241', '2025-01-27').then(success => {
        if (success) {
            console.log('Chat ready for messages');
            
            // Example: Send a message
            chatClient.sendMessage(
                'What is thermodynamics?',
                'user123',
                (chunk) => {
                    // Handle streaming chunks
                    console.log('Chunk:', chunk);
                    // Update UI with streaming text
                },
                (message) => {
                    // Handle complete message
                    console.log('Complete message:', message);
                    // Update UI with final message
                },
                (error) => {
                    // Handle errors
                    console.error('Error:', error);
                    // Show error in UI
                }
            );
        }
    });
}

// ChatStreamingClient is already exported above

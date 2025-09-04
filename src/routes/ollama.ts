/**
 * ===========================================
 * ========= OLLAMA LLM INTEGRATION ==========
 * ===========================================
 *
 * This module provides Express.js routes for integrating with Ollama local LLM server
 * to enable AI-powered chat functionality for the EngE-AI platform with RAG capabilities.
 *
 * Key Features:
 * - Streaming chat responses from local Ollama instance
 * - RAG (Retrieval-Augmented Generation) with document similarity search
 * - Document retrieval from Qdrant vector database
 * - Context injection with text decorators for retrieved documents
 * - Support for conversational message history
 * - Real-time response streaming for better UX
 * - Configurable model selection (currently llama3.1:latest)
 *
 * API Endpoints:
 * - POST /chat - Send messages to Ollama with RAG and stream responses
 * - POST /chat/rag - Enhanced chat with RAG functionality
 * - GET /test - Test endpoint for API validation
 *
 * Dependencies:
 * - Ollama server running on localhost:11434
 * - Qdrant vector database for document retrieval
 * - Compatible LLM model (llama3.1:latest) installed in Ollama
 *
 * @author: EngE-AI Team
 * @version: 2.0.0
 * @since: 2025-01-27
 * 
 */

import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import fetch from 'node-fetch';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingsModule, EmbeddingsConfig, EmbeddingProviderType } from 'ubc-genai-toolkit-embeddings';
import { ConsoleLogger } from 'ubc-genai-toolkit-core';
import { LLMConfig, ProviderType } from 'ubc-genai-toolkit-llm';

// Load environment variables
dotenv.config();

const router = express.Router();

// Configuration
const OLLAMA_API_URL = 'http://localhost:11434/api/chat';
const QDRANT_HOST = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'engeai-documents';

// Debug logging
console.log('🔧 Ollama RAG Configuration:');
console.log('  QDRANT_HOST:', QDRANT_HOST);
console.log('  QDRANT_API_KEY:', process.env.QDRANT_API_KEY ? 'Set' : 'Not set');
console.log('  OLLAMA_API_KEY:', process.env.OLLAMA_API_KEY ? 'Set' : 'Not set');
console.log('  COLLECTION_NAME:', COLLECTION_NAME);

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
    url: QDRANT_HOST,
    apiKey: process.env.QDRANT_API_KEY,
});

// Initialize embeddings module
let embeddingsModule: EmbeddingsModule;

async function initializeEmbeddings() {
    const llmConfig: Partial<LLMConfig> = {
        provider: 'ollama' as any,
        apiKey: process.env.OLLAMA_API_KEY || '',
        endpoint: 'http://localhost:11434',
        defaultModel: 'llama3.1:latest',
        embeddingModel: 'nomic-embed-text',
    };

    const config: Partial<EmbeddingsConfig> = {
        providerType: 'ubc-genai-toolkit-llm', // Use the correct provider type for LLM-based embeddings
        logger: new ConsoleLogger(),
        llmConfig: llmConfig,
    };

    embeddingsModule = await EmbeddingsModule.create(config);
    console.log('✅ Embeddings module initialized successfully.');
}

// Initialize embeddings on module load
initializeEmbeddings().catch(console.error);

/**
 * Interface for RAG request body
 */
interface RAGRequest {
    messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }>;
    courseName?: string;
    enableRAG?: boolean;
    maxDocuments?: number;
    scoreThreshold?: number;
}

/**
 * Interface for retrieved document
 */
interface RetrievedDocument {
    id: string;
    score: number;
    payload: {
        text: string;
        courseName?: string;
        contentTitle?: string;
        subContentTitle?: string;
        chunkNumber?: number;
    };
}

/**
 * Generate query embedding for similarity search
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
    try {
        // Ensure embeddings module is initialized
        if (!embeddingsModule) {
            await initializeEmbeddings();
        }
        
        const embeddings = await embeddingsModule.embed(query);
        return embeddings[0]; // embed returns number[][], we need the first array
    } catch (error) {
        console.error('Error generating query embedding:', error);
        throw new Error('Failed to generate query embedding');
    }
}

/**
 * Retrieve similar documents from Qdrant
 */
async function retrieveSimilarDocuments(
    query: string,
    courseName?: string,
    limit: number = 3,
    scoreThreshold: number = 0.7
): Promise<RetrievedDocument[]> {
    try {
        const queryVector = await generateQueryEmbedding(query);
        
        // Build filter for course-specific search if needed
        const filter: any = {};
        if (courseName) {
            filter.courseName = courseName;
        }

        // Search for similar vectors
        const result = await qdrantClient.search(COLLECTION_NAME, {
            vector: queryVector,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            limit: limit,
            with_payload: true,
            score_threshold: scoreThreshold,
        });

        return result.map((hit: any) => ({
            id: hit.id,
            score: hit.score,
            payload: hit.payload,
        }));
    } catch (error) {
        console.error('Error retrieving similar documents:', error);
        throw new Error('Failed to retrieve similar documents');
    }
}

/**
 * Format retrieved documents with text decorators
 */
function formatRetrievedDocuments(documents: RetrievedDocument[]): string {
    if (documents.length === 0) {
        return '';
    }

    let context = '\n\n--- RELEVANT COURSE MATERIALS ---\n';
    
    documents.forEach((doc, index) => {
        const { payload } = doc;
        const source = payload.contentTitle ? 
            `${payload.contentTitle}${payload.subContentTitle ? ` - ${payload.subContentTitle}` : ''}` : 
            'Course Material';
        
        context += `\n[📚 Source ${index + 1}: ${source}]\n`;
        context += `[📄 Chunk ${payload.chunkNumber || 'N/A'}]\n`;
        context += `[🎯 Relevance Score: ${(doc.score * 100).toFixed(1)}%]\n`;
        context += `\n${payload.text}\n`;
        context += `\n---\n`;
    });

    context += '\n--- END OF RELEVANT MATERIALS ---\n\n';
    context += 'Use the above course materials to provide accurate, contextually relevant responses. ';
    context += 'When referencing the materials, use natural phrases like "In the module, it is discussed that..." or "According to the course materials..." or "The lecture notes explain that..." to help students connect your answers to their course content. ';
    context += 'If the materials don\'t contain relevant information, please indicate this and provide general guidance.';

    return context;
}

/**
 * Enhanced chat endpoint with RAG functionality
 */
router.post('/chat/rag', async (req: Request, res: Response) => {
    try {
        const { messages, courseName, enableRAG = true, maxDocuments = 3, scoreThreshold = 0.7 }: RAGRequest = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).send({ error: 'Missing or invalid messages in request body' });
        }

        const model = 'llama3.1:latest';
        let enhancedMessages = [...messages];

        console.log("Debugging #24 : ", messages);

        // Add RAG context if enabled and there are user messages
        if (enableRAG && messages.length > 0) {
            const lastUserMessage = messages.filter(m => m.role === 'user').pop();

            console.log("Debugging #25 : ", lastUserMessage);
            if (lastUserMessage) {
                try {
                    const retrievedDocs = await retrieveSimilarDocuments(
                        lastUserMessage.content,
                        courseName,
                        maxDocuments,
                        scoreThreshold
                    );

                    if (retrievedDocs.length > 0) {
                        const contextText = formatRetrievedDocuments(retrievedDocs);

                        console.log("contextText : ", contextText);
                        
                        // Add system message with context
                        const systemMessage = {
                            role: 'system' as const,
                            content: `You are an AI tutor for engineering students. Your role is to help students understand course concepts by connecting their questions to the provided course materials.

When answering questions:
1. Use the provided course materials to give contextually relevant responses
2. Reference the materials naturally using phrases like:
   - "In the module, it is discussed that..."
   - "According to the course materials..."
   - "The lecture notes explain that..."
   - "As mentioned in the course content..."
   - "The module covers this topic by stating..."
3. Help students connect your answers to their course content
4. If the materials don't contain relevant information, indicate this and provide general guidance

${contextText}`
                        };

                        // Insert system message before the last user message
                        let lastUserIndex = -1;
                        for (let i = messages.length - 1; i >= 0; i--) {
                            if (messages[i].role === 'user') {
                                lastUserIndex = i;
                                break;
                            }
                        }
                        if (lastUserIndex >= 0) {
                            enhancedMessages.splice(lastUserIndex, 0, systemMessage);
                        }
                    }
                } catch (ragError) {
                    console.warn('RAG retrieval failed, proceeding without context:', ragError);
                    // Continue without RAG if retrieval fails
                }
            }
        }

        console.log("Debugging #28 : ", enhancedMessages);


        const ollamaRes = await fetch(OLLAMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: enhancedMessages,
                stream: true,
            }),
        });

        if (!ollamaRes.ok) {
            const errorText = await ollamaRes.text();
            console.error('Ollama API error:', errorText);
            return res.status(ollamaRes.status).send({ error: `Ollama API error: ${errorText}` });
        }

        res.setHeader('Content-Type', 'application/json');
        ollamaRes.body.pipe(res);

    } catch (error) {
        console.error('Error in RAG chat:', error);
        res.status(500).send({ error: 'Failed to process RAG chat request' });
    }
});

/**
 * Original chat endpoint (backward compatibility)
 */
router.post('/chat', async (req: Request, res: Response) => {
    try {
        const { messages } = req.body;
        const model = 'llama3.1:latest';

        if (!messages) {
            return res.status(400).send({ error: 'Missing messages in request body' });
        }

        const ollamaRes = await fetch(OLLAMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true, 
            }),
        });

        if (!ollamaRes.ok) {
            const errorText = await ollamaRes.text();
            console.error('Ollama API error:', errorText);
            return res.status(ollamaRes.status).send({ error: `Ollama API error: ${errorText}` });
        }

        res.setHeader('Content-Type', 'application/json');
        ollamaRes.body.pipe(res);

    } catch (error) {
        console.error('Error streaming from Ollama:', error);
        res.status(500).send({ error: 'Failed to stream from Ollama' });
    }
});

/**
 * Test endpoint for API validation
 */
router.get('/test', async (req: Request, res: Response) => {
    const results = {
        status: 'success',
        message: 'Ollama RAG API test completed',
        timestamp: new Date().toISOString(),
        services: {
            qdrant: { connected: false, error: null as string | null, collections: 0 },
            embeddings: { working: false, error: null as string | null, vectorSize: 0 },
            ollama: { endpoint: OLLAMA_API_URL, model: 'llama3.1:latest', accessible: false, error: null as string | null }
        }
    };

    // Test Qdrant connection
    try {
        console.log('Testing Qdrant connection...');
        const collections = await qdrantClient.getCollections();
        results.services.qdrant = {
            connected: true,
            error: null,
            collections: collections.collections.length
        };
        console.log('✅ Qdrant connection successful');
    } catch (error) {
        console.error('❌ Qdrant connection failed:', error);
        results.services.qdrant.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test embeddings generation
    try {
        console.log('Testing embeddings generation...');
        const testEmbedding = await generateQueryEmbedding('test query');
        results.services.embeddings = {
            working: testEmbedding.length > 0,
            error: null,
            vectorSize: testEmbedding.length
        };
        console.log('✅ Embeddings generation successful');
    } catch (error) {
        console.error('❌ Embeddings generation failed:', error);
        results.services.embeddings.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test Ollama connection
    try {
        console.log('Testing Ollama connection...');
        const ollamaTest = await fetch(`${OLLAMA_API_URL.replace('/chat', '')}/api/tags`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (ollamaTest.ok) {
            results.services.ollama.accessible = true;
            console.log('✅ Ollama connection successful');
        } else {
            results.services.ollama.error = `HTTP ${ollamaTest.status}`;
            console.log('❌ Ollama connection failed:', ollamaTest.status);
        }
    } catch (error) {
        console.error('❌ Ollama connection failed:', error);
        results.services.ollama.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Determine overall status
    const allServicesWorking = results.services.qdrant.connected && 
                              results.services.embeddings.working && 
                              results.services.ollama.accessible;

    if (allServicesWorking) {
        results.status = 'success';
        results.message = 'All services are operational';
        res.status(200).json(results);
    } else {
        results.status = 'partial';
        results.message = 'Some services are not operational';
        res.status(200).json(results); // Return 200 with detailed status
    }
});

export default router;

# RAG Implementation for Ollama Integration

## Overview

This document describes the Retrieval-Augmented Generation (RAG) implementation for the Ollama integration in the EngE-AI platform. The RAG system enhances the AI tutor's responses by retrieving relevant course materials from the Qdrant vector database and injecting them as context.

## Features Implemented

### 1. Document Retrieval Based on Similarity
- **Function**: `retrieveSimilarDocuments()`
- **Purpose**: Retrieves the top 3 most similar documents from Qdrant based on query similarity
- **Parameters**:
  - `query`: User's question/input
  - `courseName`: Optional course filter
  - `limit`: Maximum number of documents (default: 3)
  - `scoreThreshold`: Minimum similarity score (default: 0.7)

### 2. Text Decorators for Retrieved Documents
- **Function**: `formatRetrievedDocuments()`
- **Purpose**: Formats retrieved documents with visual decorators and metadata
- **Features**:
  - 📚 Source identification (content title, subcontent title)
  - 📄 Chunk number display
  - 🎯 Relevance score percentage
  - Clear section separators
  - Instructional text for the AI

### 3. REST API Testing
- **Test File**: `src/test-scripts/test-ollama-rag.ts`
- **Runner**: `src/test-scripts/run-ollama-rag-tests.ts`
- **Coverage**:
  - Basic chat functionality
  - RAG-enhanced chat
  - Parameter testing
  - Error handling
  - Performance testing
  - Health check validation

## API Endpoints

### POST `/api/ollama/chat/rag`
Enhanced chat endpoint with RAG functionality.

**Request Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "What is diffusion in chemical engineering?"
    }
  ],
  "courseName": "CHBE241",
  "enableRAG": true,
  "maxDocuments": 3,
  "scoreThreshold": 0.7
}
```

**Response:** Streaming JSON response from Ollama with enhanced context.

### POST `/api/ollama/chat`
Original chat endpoint (backward compatibility).

### GET `/api/ollama/test`
Health check endpoint for API validation.

## Configuration

### Environment Variables
- `QDRANT_URL`: Qdrant server URL (default: http://localhost:6333)
- `OLLAMA_API_KEY`: API key for Ollama (optional)

### Collection Name
- Default collection: `engeai-documents`
- Supports course-specific filtering

## Usage Examples

### Basic RAG Chat
```typescript
const response = await fetch('/api/ollama/chat/rag', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Explain mass transfer' }],
    courseName: 'CHBE241',
    enableRAG: true
  })
});
```

### Testing
```bash
# Run all RAG tests
npx ts-node src/test-scripts/run-ollama-rag-tests.ts

# Or use npm script (if configured)
npm run test:ollama-rag
```

## Document Format

Retrieved documents are formatted with the following structure:

```
--- RELEVANT COURSE MATERIALS ---

[📚 Source 1: Lecture 5 - Mass Transfer]
[📄 Chunk 3]
[🎯 Relevance Score: 87.5%]

Mass transfer is the net movement of a component from one location to another...

---

[📚 Source 2: Tutorial 2 - Diffusion]
[📄 Chunk 1]
[🎯 Relevance Score: 82.1%]

Diffusion is a fundamental mechanism of mass transfer...

---

--- END OF RELEVANT MATERIALS ---

Use the above course materials to provide accurate, contextually relevant responses. 
When referencing the materials, use natural phrases like "In the module, it is discussed that..." 
or "According to the course materials..." or "The lecture notes explain that..." to help 
students connect your answers to their course content. If the materials don't contain 
relevant information, please indicate this and provide general guidance.
```

## AI Response Style

The AI tutor will now naturally reference course materials using phrases like:
- "In the module, it is discussed that..."
- "According to the course materials..."
- "The lecture notes explain that..."
- "As mentioned in the course content..."
- "The module covers this topic by stating..."

This helps students connect AI responses directly to their course content and understand where the information comes from.

## Error Handling

- **RAG Retrieval Failure**: Falls back to regular chat without context
- **Embeddings Generation Error**: Logs error and continues without RAG
- **Qdrant Connection Error**: Logs error and continues without RAG
- **Invalid Request**: Returns appropriate HTTP error codes

## Performance Considerations

- **Async Initialization**: Embeddings module initializes asynchronously
- **Lazy Loading**: Context is only retrieved when RAG is enabled
- **Error Recovery**: System continues functioning even if RAG fails
- **Streaming Response**: Maintains real-time response streaming

## Dependencies

- `@qdrant/js-client-rest`: Qdrant vector database client
- `ubc-genai-toolkit-embeddings`: Embeddings generation
- `ubc-genai-toolkit-core`: Logging utilities
- `ubc-genai-toolkit-llm`: LLM configuration
- `node-fetch`: HTTP requests to Ollama

## Future Enhancements

1. **Caching**: Implement response caching for frequently asked questions
2. **Dynamic Thresholds**: Adjust similarity thresholds based on query type
3. **Multi-Modal**: Support for image and document retrieval
4. **Analytics**: Track retrieval effectiveness and user satisfaction
5. **Custom Prompts**: Allow instructors to customize system prompts

## Troubleshooting

### Common Issues

1. **"Embeddings module not initialized"**
   - Check Ollama server is running
   - Verify environment variables
   - Check network connectivity

2. **"No documents retrieved"**
   - Verify Qdrant collection exists
   - Check similarity threshold settings
   - Ensure documents are properly embedded

3. **"RAG retrieval failed"**
   - Check Qdrant server status
   - Verify collection name
   - Check embeddings model availability

### Debug Mode

Enable debug logging by setting the log level in the ConsoleLogger configuration.

## Testing

The test suite covers:
- ✅ Basic chat functionality
- ✅ RAG-enhanced chat
- ✅ Parameter variations
- ✅ Error handling
- ✅ Performance metrics
- ✅ Health check validation

Run tests to verify the implementation before deploying to production.

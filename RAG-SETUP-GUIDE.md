# RAG Setup Guide

## Quick Start

This guide will help you set up the RAG (Retrieval-Augmented Generation) system for the EngE-AI platform.

## Prerequisites

### 1. Services Required
- **Ollama**: Local LLM server
- **Qdrant**: Vector database
- **Node.js**: Backend server

### 2. Environment Setup

Create a `.env` file in the project root with the following variables:

```bash
# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your_qdrant_api_key_here

# Ollama Configuration (optional)
OLLAMA_API_KEY=your_ollama_api_key_here

# Other existing variables...
```

## Installation Steps

### 1. Install Ollama
```bash
# Install Ollama (if not already installed)
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama server
ollama serve

# Install required models
ollama pull llama3.1:latest
ollama pull nomic-embed-text
```

### 2. Install and Start Qdrant
```bash
# Using Docker (recommended)
docker run -p 6333:6333 qdrant/qdrant

# Or download and run locally
# Visit: https://qdrant.tech/documentation/quick-start/
```

### 3. Start the Node.js Server
```bash
# Install dependencies
npm install

# Start the server
npm start
# or
npm run dev
```

## Testing the Setup

### 1. Run Diagnostic Tool
```bash
npx ts-node src/test-scripts/diagnose-rag-services.ts
```

This will test all services and provide detailed error messages.

### 2. Run RAG Tests
```bash
npx ts-node src/test-scripts/run-ollama-rag-tests.ts
```

### 3. Test API Endpoints

#### Health Check
```bash
curl http://localhost:3000/api/ollama/test
```

#### RAG Chat
```bash
curl -X POST http://localhost:3000/api/ollama/chat/rag \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What is mass transfer?"}],
    "courseName": "CHBE241",
    "enableRAG": true
  }'
```

## Troubleshooting

### Common Issues

#### 1. "Unauthorized" Error
**Cause**: Missing or incorrect API keys
**Solution**: 
- Check your `.env` file has the correct API keys
- Verify Qdrant is configured with authentication
- Ensure Ollama doesn't require API key (usually not needed for local)

#### 2. "Connection Refused" Error
**Cause**: Services not running
**Solution**:
- Start Ollama: `ollama serve`
- Start Qdrant: `docker run -p 6333:6333 qdrant/qdrant`
- Start Node.js server: `npm start`

#### 3. "Model Not Found" Error
**Cause**: Required models not installed
**Solution**:
```bash
ollama pull llama3.1:latest
ollama pull nomic-embed-text
```

#### 4. "Collection Not Found" Error
**Cause**: Qdrant collection doesn't exist
**Solution**:
- Upload some documents first using the Qdrant API
- Or create the collection manually

### Debug Mode

Enable detailed logging by checking the console output when starting the server. The RAG system will log:
- Configuration details
- Service connection status
- Error details with troubleshooting tips

## Configuration Options

### RAG Parameters
- `maxDocuments`: Number of documents to retrieve (default: 3)
- `scoreThreshold`: Minimum similarity score (default: 0.7)
- `enableRAG`: Enable/disable RAG functionality (default: true)

### Example Usage
```typescript
const response = await fetch('/api/ollama/chat/rag', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Your question here' }],
    courseName: 'CHBE241',
    enableRAG: true,
    maxDocuments: 5,
    scoreThreshold: 0.8
  })
});
```

## Next Steps

1. **Upload Course Materials**: Use the Qdrant API to upload your course documents
2. **Test RAG Functionality**: Try different queries to see how RAG enhances responses
3. **Customize Parameters**: Adjust similarity thresholds and document counts
4. **Monitor Performance**: Use the diagnostic tools to ensure everything is working

## Support

If you encounter issues:
1. Run the diagnostic tool first
2. Check the console logs for detailed error messages
3. Verify all services are running and accessible
4. Check the troubleshooting section above

The RAG system is designed to gracefully fall back to regular chat if any component fails, so your application will continue to work even if there are issues with the RAG functionality.

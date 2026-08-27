/**
 * @fileoverview Pins which environment variable selects the provider of the internal
 * LLM module that `EMBEDDING_PROVIDER=ubc-genai-toolkit-llm` builds for embeddings.
 *
 * The embeddings provider must be selectable independently of the chat provider.
 * When it is not set, it falls back to the chat provider so existing single-provider
 * deployments keep working.
 */

import { loadConfig } from '../config';

const REQUIRED_ENV = {
    EMBEDDING_PROVIDER: 'ubc-genai-toolkit-llm',
    EMBEDDINGS_ENDPOINT: 'https://embeddings.example/v1',
    EMBEDDINGS_MODEL: 'text-embedding-3-small',
    QDRANT_URL: 'http://localhost:6333',
    QDRANT_COLLECTION_NAME: 'test-collection',
    QDRANT_VECTOR_SIZE: '1536',
};

/** Reads the provider of the internal LLM module the embeddings module is given. */
const embeddingsInnerProvider = (): string | undefined => {
    const embeddingsConfig = loadConfig().ragConfig.embeddingsConfig as
        | { llmConfig?: { provider?: string } }
        | undefined;
    return embeddingsConfig?.llmConfig?.provider;
};

describe('loadConfig embeddings provider selection', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv, ...REQUIRED_ENV };
        delete process.env.EMBEDDINGS_LLM_PROVIDER;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('uses EMBEDDINGS_LLM_PROVIDER when it is set', () => {
        process.env.LLM_PROVIDER = 'ollama';
        process.env.EMBEDDINGS_LLM_PROVIDER = 'openai';

        expect(embeddingsInnerProvider()).toBe('openai');
    });

    it('falls back to LLM_PROVIDER when EMBEDDINGS_LLM_PROVIDER is unset', () => {
        process.env.LLM_PROVIDER = 'ollama';

        expect(embeddingsInnerProvider()).toBe('ollama');
    });

    it('leaves the chat provider untouched when the embeddings provider differs', () => {
        process.env.LLM_PROVIDER = 'ollama';
        process.env.EMBEDDINGS_LLM_PROVIDER = 'openai';

        expect(loadConfig().llmConfig.provider).toBe('ollama');
    });
});

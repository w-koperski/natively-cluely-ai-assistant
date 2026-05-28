"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingProviderResolver = void 0;
const OpenAIEmbeddingProvider_1 = require("./providers/OpenAIEmbeddingProvider");
const GeminiEmbeddingProvider_1 = require("./providers/GeminiEmbeddingProvider");
const OllamaEmbeddingProvider_1 = require("./providers/OllamaEmbeddingProvider");
const LocalEmbeddingProvider_1 = require("./providers/LocalEmbeddingProvider");
const ProviderRouter_1 = require("../llm/ProviderRouter");
class EmbeddingProviderResolver {
    /**
     * Returns the best available provider.
     * Runs isAvailable() checks in priority order.
     * Local model is the unconditional fallback — always last.
     */
    static async resolve(config) {
        const candidates = [];
        let embeddingsDenied = false;
        if (config.openaiKey) {
            try {
                (0, ProviderRouter_1.assertProviderDataScopes)('openai_embeddings', ['embeddings'], config.providerDataScopes);
                candidates.push(new OpenAIEmbeddingProvider_1.OpenAIEmbeddingProvider(config.openaiKey));
            }
            catch (error) {
                if (error instanceof ProviderRouter_1.ProviderScopeError) {
                    embeddingsDenied = true;
                    console.warn('[ScopeFallback] embeddings denied for cloud; routing to Ollama');
                }
                else {
                    throw error;
                }
            }
        }
        if (config.geminiKey) {
            try {
                (0, ProviderRouter_1.assertProviderDataScopes)('gemini_embeddings', ['embeddings'], config.providerDataScopes);
                candidates.push(new GeminiEmbeddingProvider_1.GeminiEmbeddingProvider(config.geminiKey));
            }
            catch (error) {
                if (error instanceof ProviderRouter_1.ProviderScopeError) {
                    embeddingsDenied = true;
                    console.warn('[ScopeFallback] embeddings denied for cloud; routing to Ollama');
                }
                else {
                    throw error;
                }
            }
        }
        candidates.push(new OllamaEmbeddingProvider_1.OllamaEmbeddingProvider(config.ollamaUrl || 'http://localhost:11434'));
        if (!embeddingsDenied) {
            candidates.push(new LocalEmbeddingProvider_1.LocalEmbeddingProvider()); // always last, always works
        }
        for (const provider of candidates) {
            const available = await provider.isAvailable();
            if (available) {
                console.log(`[EmbeddingProviderResolver] Selected provider: ${provider.name} (${provider.dimensions}d)`);
                return provider;
            }
            console.log(`[EmbeddingProviderResolver] Provider ${provider.name} unavailable, trying next...`);
        }
        if (embeddingsDenied) {
            console.warn('[ScopeFallback] embeddings denied; Ollama unavailable, using bundled local embedding model');
            return new LocalEmbeddingProvider_1.LocalEmbeddingProvider();
        }
        // This should never happen since LocalEmbeddingProvider.isAvailable()
        // only returns false if the bundled model is corrupted — a fatal install error
        throw new Error('No embedding provider available. The bundled model may be corrupted. Please reinstall.');
    }
}
exports.EmbeddingProviderResolver = EmbeddingProviderResolver;
//# sourceMappingURL=EmbeddingProviderResolver.js.map
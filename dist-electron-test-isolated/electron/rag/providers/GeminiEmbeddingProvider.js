"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiEmbeddingProvider = void 0;
class GeminiEmbeddingProvider {
    apiKey;
    model;
    name = 'gemini';
    dimensions = 768; // Using output_dimensionality=768 to save storage
    constructor(apiKey, model = 'models/gemini-embedding-001') {
        this.apiKey = apiKey;
        this.model = model;
    }
    async isAvailable() {
        try {
            await this.embed('test');
            return true;
        }
        catch {
            return false;
        }
    }
    async embed(text) {
        const url = `https://generativelanguage.googleapis.com/v1beta/${this.model}:embedContent?key=${this.apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text }] },
                outputDimensionality: 768 // Request 768-dim embeddings to save storage
            })
        });
        if (!res.ok)
            throw new Error(`Gemini embedding failed: ${res.statusText}`);
        const data = await res.json();
        return data.embedding.values;
    }
    async embedQuery(text) {
        return this.embed(text); // Gemini embedding is symmetric
    }
    async embedBatch(texts) {
        // Gemini requires sequential calls — no native batch API
        return Promise.all(texts.map(t => this.embed(t)));
    }
}
exports.GeminiEmbeddingProvider = GeminiEmbeddingProvider;
//# sourceMappingURL=GeminiEmbeddingProvider.js.map
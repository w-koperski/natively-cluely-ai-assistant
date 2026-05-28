"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaEmbeddingProvider = void 0;
class OllamaEmbeddingProvider {
    baseUrl;
    model;
    name = 'ollama';
    dimensions = 768; // nomic-embed-text outputs 768
    constructor(baseUrl = 'http://localhost:11434', model = 'nomic-embed-text') {
        this.baseUrl = baseUrl;
        this.model = model;
    }
    async isAvailable() {
        try {
            // Check if Ollama is running AND the model is pulled
            const res = await fetch(`${this.baseUrl}/api/tags`);
            if (!res.ok)
                return false;
            const data = await res.json();
            return data.models?.some((m) => m.name.startsWith(this.model)) ?? false;
        }
        catch {
            return false;
        }
    }
    async embed(text) {
        // nomic-embed-text is asymmetric — documents get a prefix
        const prefixed = `search_document: ${text}`;
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: this.model, prompt: prefixed })
        });
        if (!res.ok)
            throw new Error(`Ollama embedding failed: ${res.statusText}`);
        const data = await res.json();
        return data.embedding;
    }
    async embedQuery(text) {
        // nomic-embed-text is asymmetric — queries get a different prefix
        const prefixed = `search_query: ${text}`;
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: this.model, prompt: prefixed })
        });
        if (!res.ok)
            throw new Error(`Ollama query embedding failed: ${res.statusText}`);
        const data = await res.json();
        return data.embedding;
    }
    async embedBatch(texts) {
        return Promise.all(texts.map(t => this.embed(t)));
    }
}
exports.OllamaEmbeddingProvider = OllamaEmbeddingProvider;
//# sourceMappingURL=OllamaEmbeddingProvider.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIEmbeddingProvider = void 0;
class OpenAIEmbeddingProvider {
    apiKey;
    model;
    name = 'openai';
    dimensions = 1536;
    constructor(apiKey, model = 'text-embedding-3-small') {
        this.apiKey = apiKey;
        this.model = model;
    }
    async isAvailable() {
        // Fast check — just validate the key format and do a single test embed
        try {
            await this.embed('test');
            return true;
        }
        catch {
            return false;
        }
    }
    async embed(text) {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model: this.model, input: text })
        });
        if (!res.ok)
            throw new Error(`OpenAI embedding failed: ${res.statusText}`);
        const data = await res.json();
        return data.data[0].embedding;
    }
    async embedQuery(text) {
        return this.embed(text); // text-embedding-3-small is symmetric
    }
    async embedBatch(texts) {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model: this.model, input: texts })
        });
        if (!res.ok)
            throw new Error(`OpenAI batch embedding failed: ${res.statusText}`);
        const data = await res.json();
        return data.data.map((d) => d.embedding);
    }
}
exports.OpenAIEmbeddingProvider = OpenAIEmbeddingProvider;
//# sourceMappingURL=OpenAIEmbeddingProvider.js.map
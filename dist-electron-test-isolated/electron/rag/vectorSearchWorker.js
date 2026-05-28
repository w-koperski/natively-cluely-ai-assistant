"use strict";
// electron/rag/vectorSearchWorker.ts
// Worker thread for offloading ALL vector search computation from the Electron main thread.
//
// Handles TWO search strategies:
//   1. nativeVecSearch / nativeSummarySearch: opens its own read-only DB connection
//      and calls sqlite-vec in the worker (avoids blocking the main thread's event loop).
//   2. searchChunks / searchSummaries: pure-JS cosine similarity on pre-fetched Float32 blobs.
//
// All responses are sent back as { type: 'result' | 'error', requestId, data? }.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
// ============================================
// Math helpers — operates directly on Float32Array slices
// ============================================
function cosineSimilarityF32(a, b, bOffset, dim) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < dim; i++) {
        const ai = a[i];
        const bi = b[bOffset + i];
        dotProduct += ai * bi;
        normA += ai * ai;
        normB += bi * bi;
    }
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}
// ============================================
// Message handler
// ============================================
if (!worker_threads_1.parentPort) {
    throw new Error('vectorSearchWorker must be run as a worker_threads Worker');
}
// Cache for DB connections keyed by DB path to avoid re-opening on every call.
// The worker is long-lived, so this is safe and efficient.
const dbCache = new Map();
function getDb(dbPath, extPath) {
    if (dbCache.has(dbPath))
        return dbCache.get(dbPath);
    const db = new better_sqlite3_1.default(dbPath, { readonly: true, fileMustExist: true });
    try {
        db.loadExtension(extPath);
    }
    catch (e) {
        // Extension may already be loaded or unavailable; proceed anyway.
    }
    dbCache.set(dbPath, db);
    return db;
}
worker_threads_1.parentPort.on('message', (message) => {
    try {
        switch (message.type) {
            case 'searchChunks': {
                const { requestId, queryEmbedding, embeddings, embeddingDim, rowMeta, minSimilarity, limit } = message;
                const scored = [];
                for (let i = 0; i < rowMeta.length; i++) {
                    const similarity = cosineSimilarityF32(queryEmbedding, embeddings, i * embeddingDim, embeddingDim);
                    if (similarity >= minSimilarity) {
                        const meta = rowMeta[i];
                        scored.push({
                            id: meta.id,
                            meetingId: meta.meeting_id,
                            chunkIndex: meta.chunk_index,
                            speaker: meta.speaker,
                            startMs: meta.start_timestamp_ms,
                            endMs: meta.end_timestamp_ms,
                            text: meta.cleaned_text,
                            tokenCount: meta.token_count,
                            similarity
                        });
                    }
                }
                scored.sort((a, b) => b.similarity - a.similarity);
                worker_threads_1.parentPort.postMessage({
                    type: 'result',
                    requestId,
                    data: scored.slice(0, limit)
                });
                break;
            }
            case 'searchSummaries': {
                const { requestId, queryEmbedding, embeddings, embeddingDim, rowMeta, limit } = message;
                const scored = [];
                for (let i = 0; i < rowMeta.length; i++) {
                    const similarity = cosineSimilarityF32(queryEmbedding, embeddings, i * embeddingDim, embeddingDim);
                    const meta = rowMeta[i];
                    scored.push({
                        meetingId: meta.meeting_id,
                        summaryText: meta.summary_text,
                        similarity
                    });
                }
                scored.sort((a, b) => b.similarity - a.similarity);
                worker_threads_1.parentPort.postMessage({
                    type: 'result',
                    requestId,
                    data: scored.slice(0, limit)
                });
                break;
            }
            case 'nativeVecSearch': {
                const { requestId, dbPath, extPath, queryBlob, dim, meetingId, providerName, limit, minSimilarity, fetchMultiplier } = message;
                // P1-4: validate dim is a positive integer before interpolating into the table name.
                // This worker runs in a separate thread and receives messages from the main process,
                // so it operates at a trust boundary — the value must be validated here independently.
                if (!Number.isInteger(dim) || dim <= 0 || dim > 65536) {
                    worker_threads_1.parentPort.postMessage({ type: 'error', requestId, error: `Invalid embedding dimension: ${dim}` });
                    break;
                }
                const db = getDb(dbPath, extPath);
                const fetchLimit = (meetingId || providerName) ? limit * fetchMultiplier : limit;
                const vecTable = `vec_chunks_${dim}`;
                const vecRows = db.prepare(`
                    SELECT chunk_id, distance FROM ${vecTable}
                    WHERE embedding MATCH ? ORDER BY distance LIMIT ?
                `).all(queryBlob, fetchLimit);
                if (vecRows.length === 0) {
                    worker_threads_1.parentPort.postMessage({ type: 'result', requestId, data: [] });
                    break;
                }
                const chunkIds = vecRows.map((r) => r.chunk_id);
                const ph = chunkIds.map(() => '?').join(',');
                let q = `SELECT c.* FROM chunks c JOIN meetings m ON c.meeting_id = m.id WHERE c.id IN (${ph})`;
                const params = [...chunkIds];
                if (meetingId) {
                    q += ' AND c.meeting_id = ?';
                    params.push(meetingId);
                }
                if (providerName) {
                    q += ' AND m.embedding_provider = ?';
                    params.push(providerName);
                }
                const chunkRows = db.prepare(q).all(...params);
                const chunkMap = new Map();
                for (const row of chunkRows)
                    chunkMap.set(row.id, row);
                const scored = [];
                for (const vecRow of vecRows) {
                    const c = chunkMap.get(vecRow.chunk_id);
                    if (!c)
                        continue;
                    const similarity = 1 - vecRow.distance;
                    if (similarity >= minSimilarity) {
                        scored.push({ id: c.id, meetingId: c.meeting_id, chunkIndex: c.chunk_index,
                            speaker: c.speaker, startMs: c.start_timestamp_ms, endMs: c.end_timestamp_ms,
                            text: c.cleaned_text, tokenCount: c.token_count, similarity });
                    }
                }
                worker_threads_1.parentPort.postMessage({ type: 'result', requestId, data: scored.slice(0, limit) });
                break;
            }
            case 'nativeVecSearchSummaries': {
                const { requestId, dbPath, extPath, queryBlob, dim, providerName, limit } = message;
                // P1-4: same integer validation as nativeVecSearch — worker trust boundary.
                if (!Number.isInteger(dim) || dim <= 0 || dim > 65536) {
                    worker_threads_1.parentPort.postMessage({ type: 'error', requestId, error: `Invalid embedding dimension: ${dim}` });
                    break;
                }
                const db = getDb(dbPath, extPath);
                const fetchLimit = providerName ? limit * 4 : limit;
                const vecTable = `vec_summaries_${dim}`;
                const vecRows = db.prepare(`
                    SELECT summary_id, distance FROM ${vecTable}
                    WHERE embedding MATCH ? ORDER BY distance LIMIT ?
                `).all(queryBlob, fetchLimit);
                if (vecRows.length === 0) {
                    worker_threads_1.parentPort.postMessage({ type: 'result', requestId, data: [] });
                    break;
                }
                const ids = vecRows.map((r) => r.summary_id);
                const ph = ids.map(() => '?').join(',');
                let sq = `SELECT s.* FROM chunk_summaries s JOIN meetings m ON s.meeting_id = m.id WHERE s.id IN (${ph})`;
                const params = [...ids];
                if (providerName) {
                    sq += ' AND m.embedding_provider = ?';
                    params.push(providerName);
                }
                const summaryRows = db.prepare(sq).all(...params);
                const summaryMap = new Map();
                for (const row of summaryRows)
                    summaryMap.set(row.id, row);
                const results = [];
                for (const vecRow of vecRows) {
                    const s = summaryMap.get(vecRow.summary_id);
                    if (!s)
                        continue;
                    results.push({ meetingId: s.meeting_id, summaryText: s.summary_text, similarity: 1 - vecRow.distance });
                }
                worker_threads_1.parentPort.postMessage({ type: 'result', requestId, data: results.slice(0, limit) });
                break;
            }
            default:
                worker_threads_1.parentPort.postMessage({
                    type: 'error',
                    requestId: message.requestId,
                    error: `Unknown message type: ${message.type}`
                });
        }
    }
    catch (error) {
        worker_threads_1.parentPort.postMessage({
            type: 'error',
            requestId: message.requestId,
            error: error.message
        });
    }
});
//# sourceMappingURL=vectorSearchWorker.js.map
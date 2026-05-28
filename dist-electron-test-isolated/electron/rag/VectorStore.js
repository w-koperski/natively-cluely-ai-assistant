"use strict";
// electron/rag/VectorStore.ts
// SQLite-based vector storage with native sqlite-vec search (fallback to JS cosine similarity)
// JS fallback is offloaded to a worker_threads Worker to avoid blocking the Electron main thread.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStore = void 0;
const worker_threads_1 = require("worker_threads");
const path_1 = __importDefault(require("path"));
const DatabaseManager_1 = require("../db/DatabaseManager");
/**
 * VectorStore - SQLite-backed vector storage
 *
 * Uses sqlite-vec extension for native vector similarity search (O(1) per query via ANN).
 * Falls back to pure JS cosine similarity if sqlite-vec is unavailable.
 * Native sqlite-vec queries are offloaded to a worker thread to avoid blocking the main thread.
 */
class VectorStore {
    db;
    dbPath;
    extPath;
    useNativeVec;
    worker = null;
    requestId = 0;
    pendingRequests = new Map();
    static WORKER_TIMEOUT_MS = 30_000; // 30s deadman switch
    constructor(db, dbPath, extPath) {
        this.db = db;
        this.dbPath = dbPath;
        this.extPath = extPath;
        this.useNativeVec = this.detectVecSupport();
    }
    /**
     * Lazily initialize the worker thread for JS fallback searches.
     * The worker is reused across all search calls.
     */
    getWorker() {
        if (!this.worker) {
            // Resolve the compiled worker script path (dist-electron output)
            const workerPath = path_1.default.join(__dirname, 'vectorSearchWorker.js');
            this.worker = new worker_threads_1.Worker(workerPath);
            this.worker.on('message', (msg) => {
                const pending = this.pendingRequests.get(msg.requestId);
                if (!pending)
                    return;
                clearTimeout(pending.timer);
                this.pendingRequests.delete(msg.requestId);
                if (msg.type === 'error') {
                    pending.reject(new Error(msg.error || 'Worker error'));
                }
                else {
                    pending.resolve(msg.data);
                }
            });
            this.worker.on('error', (err) => {
                console.error('[VectorStore] Worker error:', err);
                this.rejectAllPending(err);
            });
            this.worker.on('exit', (code) => {
                if (code !== 0) {
                    console.warn(`[VectorStore] Worker exited with code ${code}`);
                }
                this.worker = null;
                this.rejectAllPending(new Error(`Worker exited with code ${code}`));
            });
        }
        return this.worker;
    }
    /**
     * Reject all pending requests (used on worker crash or exit).
     */
    rejectAllPending(err) {
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(err);
        }
        this.pendingRequests.clear();
    }
    /**
     * Send a message to the worker with Transferable buffers.
     * Returns a Promise with a timeout deadman switch.
     */
    postToWorker(message, transferList = []) {
        // Safe requestId wrap-around
        this.requestId = (this.requestId + 1) % Number.MAX_SAFE_INTEGER;
        const id = this.requestId;
        message.requestId = id;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`[VectorStore] Worker request ${id} timed out after ${VectorStore.WORKER_TIMEOUT_MS}ms`));
            }, VectorStore.WORKER_TIMEOUT_MS);
            this.pendingRequests.set(id, { resolve, reject, timer });
            this.getWorker().postMessage(message, transferList);
        });
    }
    /**
     * Terminate the worker thread. Call this when the VectorStore is no longer needed.
     */
    async destroy() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
        this.rejectAllPending(new Error('VectorStore destroyed'));
    }
    /**
     * Detect if sqlite-vec is available (per-dimension vec0 tables must exist)
     */
    detectVecSupport() {
        try {
            this.db.prepare("SELECT count(*) as cnt FROM vec_chunks_768 LIMIT 1").get();
            console.log('[VectorStore] Using native sqlite-vec for vector search');
            return true;
        }
        catch (e) {
            console.warn('[VectorStore] sqlite-vec not available, using JS cosine similarity fallback. Reason:', e.message);
            return false;
        }
    }
    /**
     * Save chunks to database (without embeddings)
     */
    saveChunks(chunks) {
        const insert = this.db.prepare(`
            INSERT INTO chunks (meeting_id, chunk_index, speaker, start_timestamp_ms, end_timestamp_ms, cleaned_text, token_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const ids = [];
        const insertAll = this.db.transaction(() => {
            for (const chunk of chunks) {
                const result = insert.run(chunk.meetingId, chunk.chunkIndex, chunk.speaker, chunk.startMs, chunk.endMs, chunk.text, chunk.tokenCount);
                ids.push(result.lastInsertRowid);
            }
        });
        insertAll();
        return ids;
    }
    /**
     * Store embedding for a chunk (dual-write: BLOB column + per-dimension vec0 table)
     */
    storeEmbedding(chunkId, embedding) {
        const blob = this.embeddingToBlob(embedding);
        this.db.prepare('UPDATE chunks SET embedding = ? WHERE id = ?').run(blob, chunkId);
        // Also insert into the dimension-specific vec0 virtual table for native search
        if (this.useNativeVec) {
            const dim = embedding.length;
            // Lazily provision the table if it's a novel dimension (e.g., a new provider)
            DatabaseManager_1.DatabaseManager.getInstance().ensureVecTableForDim(dim);
            try {
                this.db.prepare(`INSERT OR REPLACE INTO vec_chunks_${dim}(chunk_id, embedding) VALUES (?, ?)`).run(BigInt(chunkId), blob);
            }
            catch (e) {
                console.warn(`[VectorStore] Failed to insert into vec_chunks_${dim}:`, e);
            }
        }
    }
    /**
     * Get chunks without embeddings for a meeting
     */
    getChunksWithoutEmbeddings(meetingId) {
        const rows = this.db.prepare(`
            SELECT * FROM chunks 
            WHERE meeting_id = ? AND embedding IS NULL
            ORDER BY chunk_index ASC
        `).all(meetingId);
        return rows.map(r => this.rowToChunk(r));
    }
    /**
     * Get all chunks for a meeting
     */
    getChunksForMeeting(meetingId) {
        const rows = this.db.prepare(`
            SELECT * FROM chunks 
            WHERE meeting_id = ?
            ORDER BY chunk_index ASC
        `).all(meetingId);
        return rows.map(r => this.rowToChunk(r));
    }
    /**
     * Search for similar chunks using native sqlite-vec or JS fallback (worker thread)
     */
    async searchSimilar(queryEmbedding, options = {}) {
        const { meetingId, limit = 8, minSimilarity = 0.25, providerName } = options;
        if (this.useNativeVec) {
            return this.searchSimilarNative(queryEmbedding, meetingId, limit, minSimilarity, providerName);
        }
        return this.searchSimilarJSWorker(queryEmbedding, meetingId, limit, minSimilarity, providerName);
    }
    /**
     * Native vec0 search — now fully offloaded to the worker thread to avoid
     * blocking the Electron main event loop during expensive ANN queries.
     */
    async searchSimilarNative(queryEmbedding, meetingId, limit, minSimilarity, providerName) {
        const queryBlob = this.embeddingToBlob(queryEmbedding);
        const dim = queryEmbedding.length;
        try {
            return await this.postToWorker({
                type: 'nativeVecSearch',
                dbPath: this.dbPath,
                extPath: this.extPath,
                queryBlob,
                dim,
                meetingId,
                providerName,
                limit,
                minSimilarity,
                fetchMultiplier: 4
            });
        }
        catch (e) {
            console.error('[VectorStore] Native vec search (worker) failed, falling back to JS:', e);
            return this.searchSimilarJSWorker(queryEmbedding, meetingId, limit, minSimilarity, providerName);
        }
    }
    /**
     * JS fallback — Offloaded to worker thread for performance
     */
    async searchSimilarJSWorker(queryEmbedding, meetingId, limit, minSimilarity, providerName) {
        let query = `
            SELECT c.* 
            FROM chunks c
            WHERE c.embedding IS NOT NULL
        `;
        const params = [];
        if (meetingId) {
            query += ' AND c.meeting_id = ?';
            params.push(meetingId);
        }
        // NOTE: We do NOT filter by embedding_provider here — meetings whose
        // embedding_provider column is NULL (common after legacy imports or if metadata
        // write was skipped) still have valid embeddings. The dimension check on
        // line ~308 (byteLength === dim * 4) already safely excludes any chunks whose
        // embedding dimensions don't match our current query vector, making the SQL
        // provider filter redundant and harmful for discoverability.
        const rows = this.db.prepare(query).all(...params);
        if (rows.length === 0)
            return [];
        const dim = queryEmbedding.length;
        const expectedByteLength = dim * 4; // Float32 = 4 bytes
        const rowsWithEmbeddingBuffer = rows
            .filter(r => r.embedding)
            .map(r => ({ ...r, buffer: r.embedding }))
            .filter(r => r.buffer.byteLength === expectedByteLength); // Drop chunks from providers with different dimensions
        if (rowsWithEmbeddingBuffer.length === 0)
            return [];
        // Pack all embeddings into a single flat Float32Array for zero-copy transfer
        const flatEmbeddings = new Float32Array(rowsWithEmbeddingBuffer.length * dim);
        for (let i = 0; i < rowsWithEmbeddingBuffer.length; i++) {
            const blob = rowsWithEmbeddingBuffer[i].buffer;
            for (let j = 0; j < dim; j++) {
                flatEmbeddings[i * dim + j] = blob.readFloatLE(j * 4);
            }
        }
        const rowMeta = rowsWithEmbeddingBuffer.map(r => ({
            id: r.id,
            meeting_id: r.meeting_id,
            chunk_index: r.chunk_index,
            speaker: r.speaker,
            start_timestamp_ms: r.start_timestamp_ms,
            end_timestamp_ms: r.end_timestamp_ms,
            cleaned_text: r.cleaned_text,
            token_count: r.token_count
        }));
        try {
            return await this.postToWorker({
                type: 'searchChunks',
                queryEmbedding: new Float32Array(queryEmbedding),
                rowCount: rowsWithEmbeddingBuffer.length,
                embeddingDim: dim,
                embeddings: flatEmbeddings,
                rowMeta,
                minSimilarity,
                limit
            }, [flatEmbeddings.buffer]); // Transfer buffer to avoid copy
        }
        catch (e) {
            console.error('[VectorStore] JS worker search failed:', e);
            throw e;
        }
    }
    /**
     * Delete all chunks for a meeting (removes from all tracked dimension tables)
     */
    deleteChunksForMeeting(meetingId) {
        if (this.useNativeVec) {
            try {
                const ids = this.db.prepare('SELECT id FROM chunks WHERE meeting_id = ?').all(meetingId);
                if (ids.length > 0) {
                    const placeholders = ids.map(() => '?').join(',');
                    const idList = ids.map(r => r.id);
                    // Delete from all known dimension-specific vec0 tables
                    for (const dim of DatabaseManager_1.DatabaseManager.KNOWN_DIMS) {
                        try {
                            this.db.prepare(`DELETE FROM vec_chunks_${dim} WHERE chunk_id IN (${placeholders})`).run(...idList);
                        }
                        catch (_) { /* dim table may not exist */ }
                    }
                }
            }
            catch (e) {
                console.warn('[VectorStore] Failed to delete from vec_chunks dimension tables:', e);
            }
        }
        this.db.prepare('DELETE FROM chunks WHERE meeting_id = ?').run(meetingId);
    }
    /**
     * Check if meeting has embeddings
     */
    hasEmbeddings(meetingId) {
        const row = this.db.prepare(`
            SELECT COUNT(*) as count FROM chunks 
            WHERE meeting_id = ? AND embedding IS NOT NULL
        `).get(meetingId);
        return row.count > 0;
    }
    /**
     * Backfill embedding_provider metadata for meetings that have embedded chunks
     * but a NULL embedding_provider column.
     *
     * This is a one-time migration for meetings that were embedded before the
     * provider metadata write was introduced (or if the write silently failed).
     * It is safe to call on every startup — it only touches rows where
     * embedding_provider IS NULL and the meeting has at least one embedded chunk.
     *
     * @param providerName The active embedding provider name (e.g. "local", "openai")
     * @param dimensions   The provider's embedding dimensions (e.g. 384, 1536)
     */
    backfillEmbeddingProviderMetadata(providerName, dimensions) {
        try {
            // Find meetings that have embedded chunks but no provider metadata
            const affected = this.db.prepare(`
                UPDATE meetings
                SET embedding_provider = ?, embedding_dimensions = ?
                WHERE embedding_provider IS NULL
                  AND id IN (
                      SELECT DISTINCT meeting_id FROM chunks WHERE embedding IS NOT NULL
                  )
            `).run(providerName, dimensions);
            if (affected.changes > 0) {
                console.log(`[VectorStore] Backfilled embedding_provider='${providerName}' for ${affected.changes} meeting(s)`);
            }
            return affected.changes;
        }
        catch (e) {
            console.warn('[VectorStore] Failed to backfill embedding_provider metadata:', e);
            return 0;
        }
    }
    // ============================================
    // Summary Methods (for global search)
    // ============================================
    /**
     * Save or update meeting summary
     */
    saveSummary(meetingId, summaryText) {
        this.db.prepare(`
            INSERT OR REPLACE INTO chunk_summaries (meeting_id, summary_text)
            VALUES (?, ?)
        `).run(meetingId, summaryText);
    }
    /**
     * Store embedding for meeting summary (dual-write: BLOB + per-dimension vec0 table)
     */
    storeSummaryEmbedding(meetingId, embedding) {
        const blob = this.embeddingToBlob(embedding);
        this.db.prepare('UPDATE chunk_summaries SET embedding = ? WHERE meeting_id = ?').run(blob, meetingId);
        if (this.useNativeVec) {
            try {
                const row = this.db.prepare('SELECT id FROM chunk_summaries WHERE meeting_id = ?').get(meetingId);
                if (row) {
                    const dim = embedding.length;
                    DatabaseManager_1.DatabaseManager.getInstance().ensureVecTableForDim(dim);
                    this.db.prepare(`INSERT OR REPLACE INTO vec_summaries_${dim}(summary_id, embedding) VALUES (?, ?)`).run(BigInt(row.id), blob);
                }
            }
            catch (e) {
                console.warn('[VectorStore] Failed to insert into vec_summaries dim table:', e);
            }
        }
    }
    /**
     * Search summaries for global queries using native vec0 or JS fallback
     */
    async searchSummaries(queryEmbedding, limit = 5, providerName) {
        if (this.useNativeVec) {
            return this.searchSummariesNative(queryEmbedding, limit, providerName);
        }
        return this.searchSummariesJSWorker(queryEmbedding, limit, providerName);
    }
    /**
     * Native vec0 summary search — fully offloaded to the worker thread.
     */
    async searchSummariesNative(queryEmbedding, limit, providerName) {
        const queryBlob = this.embeddingToBlob(queryEmbedding);
        const dim = queryEmbedding.length;
        try {
            return await this.postToWorker({
                type: 'nativeVecSearchSummaries',
                dbPath: this.dbPath,
                extPath: this.extPath,
                queryBlob,
                dim,
                providerName,
                limit
            });
        }
        catch (e) {
            console.error('[VectorStore] Native summary search (worker) failed, falling back to JS:', e);
            return this.searchSummariesJSWorker(queryEmbedding, limit, providerName);
        }
    }
    /**
     * JS fallback summary search (Worker)
     */
    async searchSummariesJSWorker(queryEmbedding, limit, providerName) {
        // NOTE: We do NOT filter by embedding_provider — see searchSimilarJSWorker note.
        // The byte-length dimension check below safely handles provider mismatches.
        const query = `
            SELECT s.* 
            FROM chunk_summaries s
            WHERE s.embedding IS NOT NULL
        `;
        const params = [];
        const rows = this.db.prepare(query).all(...params);
        const dim = queryEmbedding.length;
        const expectedByteLength = dim * 4;
        const rowsWithEmbeddingBuffer = rows
            .filter(r => r.embedding)
            .map(r => ({ ...r, buffer: r.embedding }))
            .filter(r => r.buffer.byteLength === expectedByteLength);
        if (rowsWithEmbeddingBuffer.length === 0)
            return [];
        const flatEmbeddings = new Float32Array(rowsWithEmbeddingBuffer.length * dim);
        for (let i = 0; i < rowsWithEmbeddingBuffer.length; i++) {
            const blob = rowsWithEmbeddingBuffer[i].buffer;
            for (let j = 0; j < dim; j++) {
                flatEmbeddings[i * dim + j] = blob.readFloatLE(j * 4);
            }
        }
        const rowMeta = rowsWithEmbeddingBuffer.map(r => ({
            id: r.id,
            meeting_id: r.meeting_id,
            summary_text: r.summary_text
        }));
        try {
            return await this.postToWorker({
                type: 'searchSummaries',
                queryEmbedding: new Float32Array(queryEmbedding),
                rowCount: rowsWithEmbeddingBuffer.length,
                embeddingDim: dim,
                embeddings: flatEmbeddings,
                rowMeta,
                limit
            }, [flatEmbeddings.buffer]);
        }
        catch (e) {
            console.error('[VectorStore] JS worker summary search failed:', e);
            throw e;
        }
    }
    // ============================================
    // Re-indexing Utilities
    // ============================================
    /**
     * Get count of meetings with incompatible embeddings
     */
    getIncompatibleMeetingsCount(providerName) {
        const row = this.db.prepare(`
            SELECT COUNT(*) as count FROM meetings 
            WHERE embedding_provider IS NOT NULL 
            AND embedding_provider != ?
            AND is_processed = 1
        `).get(providerName);
        return row.count || 0;
    }
    /**
     * Delete embeddings for meetings to prep for re-indexer
     */
    deleteEmbeddingsForMeetings(providerName) {
        // Find incompatible meetings
        const rows = this.db.prepare(`
            SELECT id FROM meetings 
            WHERE embedding_provider IS NOT NULL 
            AND embedding_provider != ?
            AND is_processed = 1
        `).all(providerName);
        const meetingIds = rows.map(r => r.id);
        if (meetingIds.length === 0)
            return [];
        for (const id of meetingIds) {
            // Nullify embeddings
            this.db.prepare('UPDATE chunks SET embedding = NULL WHERE meeting_id = ?').run(id);
            this.db.prepare('UPDATE chunk_summaries SET embedding = NULL WHERE meeting_id = ?').run(id);
            this.db.prepare('UPDATE meetings SET embedding_provider = NULL, embedding_dimensions = NULL WHERE id = ?').run(id);
            // Delete from per-dimension vec0 tables
            if (this.useNativeVec) {
                try {
                    const cIds = this.db.prepare('SELECT id FROM chunks WHERE meeting_id = ?').all(id);
                    if (cIds.length > 0) {
                        const placeholders = cIds.map(() => '?').join(',');
                        const idList = cIds.map(r => r.id);
                        for (const dim of DatabaseManager_1.DatabaseManager.KNOWN_DIMS) {
                            try {
                                this.db.prepare(`DELETE FROM vec_chunks_${dim} WHERE chunk_id IN (${placeholders})`).run(...idList);
                            }
                            catch (_) { /* dim table may not exist */ }
                        }
                    }
                    const sIds = this.db.prepare('SELECT id FROM chunk_summaries WHERE meeting_id = ?').get(id);
                    if (sIds) {
                        for (const dim of DatabaseManager_1.DatabaseManager.KNOWN_DIMS) {
                            try {
                                this.db.prepare(`DELETE FROM vec_summaries_${dim} WHERE summary_id = ?`).run(sIds.id);
                            }
                            catch (_) { /* dim table may not exist */ }
                        }
                    }
                }
                catch (e) { }
            }
        }
        return meetingIds;
    }
    /**
     * Clear embeddings for a single meeting without deleting chunks.
     * Used when falling back to a different provider mid-stream — the chunks
     * are kept but their embedding BLOBs, vec0 rows, and provider metadata
     * are wiped so the new provider can embed them cleanly.
     */
    clearEmbeddingsForMeeting(meetingId) {
        // Wipe embedding blobs from chunks and summaries
        this.db.prepare('UPDATE chunks SET embedding = NULL WHERE meeting_id = ?').run(meetingId);
        this.db.prepare('UPDATE chunk_summaries SET embedding = NULL WHERE meeting_id = ?').run(meetingId);
        // Reset provider metadata so it gets re-assigned by the fallback provider
        this.db.prepare('UPDATE meetings SET embedding_provider = NULL, embedding_dimensions = NULL WHERE id = ?').run(meetingId);
        // Delete rows from all per-dimension vec0 tables
        if (this.useNativeVec) {
            try {
                const cIds = this.db.prepare('SELECT id FROM chunks WHERE meeting_id = ?').all(meetingId);
                if (cIds.length > 0) {
                    const placeholders = cIds.map(() => '?').join(',');
                    const idList = cIds.map(r => r.id);
                    for (const dim of DatabaseManager_1.DatabaseManager.KNOWN_DIMS) {
                        try {
                            this.db.prepare(`DELETE FROM vec_chunks_${dim} WHERE chunk_id IN (${placeholders})`).run(...idList);
                        }
                        catch (_) { /* dim table may not exist */ }
                    }
                }
                const sRow = this.db.prepare('SELECT id FROM chunk_summaries WHERE meeting_id = ?').get(meetingId);
                if (sRow) {
                    for (const dim of DatabaseManager_1.DatabaseManager.KNOWN_DIMS) {
                        try {
                            this.db.prepare(`DELETE FROM vec_summaries_${dim} WHERE summary_id = ?`).run(sRow.id);
                        }
                        catch (_) { /* dim table may not exist */ }
                    }
                }
            }
            catch (e) {
                console.warn('[VectorStore] clearEmbeddingsForMeeting: error deleting from vec0 tables:', e);
            }
        }
        console.log(`[VectorStore] Cleared embeddings for meeting ${meetingId} (chunks preserved for re-embedding)`);
    }
    // ============================================
    // Private Helpers
    // ============================================
    rowToChunk(row) {
        return {
            id: row.id,
            meetingId: row.meeting_id,
            chunkIndex: row.chunk_index,
            speaker: row.speaker,
            startMs: row.start_timestamp_ms,
            endMs: row.end_timestamp_ms,
            text: row.cleaned_text,
            tokenCount: row.token_count,
            embedding: undefined // Explicitly avoiding buffer parsing unless needed
        };
    }
    /**
     * Convert embedding array to binary BLOB (Float32)
     */
    embeddingToBlob(embedding) {
        const buffer = Buffer.alloc(embedding.length * 4);
        for (let i = 0; i < embedding.length; i++) {
            buffer.writeFloatLE(embedding[i], i * 4);
        }
        return buffer;
    }
}
exports.VectorStore = VectorStore;
//# sourceMappingURL=VectorStore.js.map
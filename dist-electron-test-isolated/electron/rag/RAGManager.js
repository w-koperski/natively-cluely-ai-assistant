"use strict";
// electron/rag/RAGManager.ts
// Central orchestrator for RAG pipeline
// Coordinates preprocessing, chunking, embedding, and retrieval
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGManager = void 0;
const TranscriptPreprocessor_1 = require("./TranscriptPreprocessor");
const SemanticChunker_1 = require("./SemanticChunker");
const VectorStore_1 = require("./VectorStore");
const EmbeddingPipeline_1 = require("./EmbeddingPipeline");
const RAGRetriever_1 = require("./RAGRetriever");
const LiveRAGIndexer_1 = require("./LiveRAGIndexer");
const prompts_1 = require("./prompts");
/**
 * RAGManager - Central orchestrator for RAG operations
 *
 * Lifecycle:
 * 1. Initialize with database and API key
 * 2. When meeting ends: processMeeting() -> chunks + queue embeddings
 * 3. When user queries: query() -> retrieve + stream response
 */
class RAGManager {
    db;
    vectorStore;
    embeddingPipeline;
    retriever;
    llmHelper = null;
    liveIndexer;
    /** Guards against concurrent reprocessMeeting() calls for the same meeting ID. */
    _reprocessInFlight = new Set();
    constructor(config) {
        this.db = config.db;
        this.vectorStore = new VectorStore_1.VectorStore(config.db, config.dbPath, config.extPath);
        this.embeddingPipeline = new EmbeddingPipeline_1.EmbeddingPipeline(config.db, this.vectorStore);
        this.retriever = new RAGRetriever_1.RAGRetriever(this.vectorStore, this.embeddingPipeline);
        this.liveIndexer = new LiveRAGIndexer_1.LiveRAGIndexer(this.vectorStore, this.embeddingPipeline);
        this.embeddingPipeline.initialize({
            openaiKey: config.openaiKey,
            geminiKey: config.geminiKey,
            ollamaUrl: config.ollamaUrl,
            providerDataScopes: config.providerDataScopes
        }).then(() => {
            // Backfill provider metadata for meetings that were embedded before the
            // embedding_provider column was written (or where the write failed silently).
            this._backfillEmbeddingProviderMetadata();
        }).catch(() => { });
    }
    /**
     * Set LLM helper for generating responses
     */
    setLLMHelper(llmHelper) {
        this.llmHelper = llmHelper;
    }
    getEmbeddingPipeline() {
        return this.embeddingPipeline;
    }
    initializeEmbeddings(keys) {
        const initPromise = this.embeddingPipeline.initialize(keys);
        // After init, backfill embedding_provider on meetings that have embedded chunks
        // but a NULL metadata column (common for meetings embedded before this metadata
        // write was introduced, or where the write silently failed).
        if (initPromise && typeof initPromise.then === 'function') {
            initPromise.then(() => {
                this._backfillEmbeddingProviderMetadata();
            }).catch(() => { });
        }
        else {
            // Synchronous path (shouldn't happen but be safe)
            this._backfillEmbeddingProviderMetadata();
        }
    }
    _backfillEmbeddingProviderMetadata() {
        const providerName = this.embeddingPipeline.getActiveProviderName();
        const provider = this.embeddingPipeline.provider;
        const dimensions = provider?.dimensions;
        if (providerName && dimensions) {
            this.vectorStore.backfillEmbeddingProviderMetadata(providerName, dimensions);
        }
    }
    /**
     * Check if RAG is ready for queries
     */
    isReady() {
        return this.embeddingPipeline.isReady() && this.llmHelper !== null;
    }
    /**
     * Process a meeting after it ends
     * Creates chunks and queues them for embedding
     */
    async processMeeting(meetingId, transcript, summary) {
        console.log(`[RAGManager] Processing meeting ${meetingId} with ${transcript.length} segments`);
        // 1. Preprocess transcript
        const cleaned = (0, TranscriptPreprocessor_1.preprocessTranscript)(transcript);
        console.log(`[RAGManager] Preprocessed to ${cleaned.length} cleaned segments`);
        // 2. Chunk the transcript
        const chunks = (0, SemanticChunker_1.chunkTranscript)(meetingId, cleaned);
        console.log(`[RAGManager] Created ${chunks.length} chunks`);
        if (chunks.length === 0) {
            console.log(`[RAGManager] No chunks to save for meeting ${meetingId}`);
            return { chunkCount: 0 };
        }
        // 3. Save chunks to database
        this.vectorStore.saveChunks(chunks);
        // 4. Save summary if provided
        if (summary) {
            this.vectorStore.saveSummary(meetingId, summary);
        }
        // 5. Queue for embedding (background processing)
        if (this.embeddingPipeline.isReady()) {
            await this.embeddingPipeline.queueMeeting(meetingId);
        }
        else {
            console.log(`[RAGManager] Embeddings not ready, chunks saved without embeddings`);
        }
        return { chunkCount: chunks.length };
    }
    /**
     * Query meeting with RAG
     * Returns streaming generator for response
     */
    async *queryMeeting(meetingId, query, abortSignal) {
        if (!this.llmHelper) {
            throw new Error('LLM helper not initialized');
        }
        // Check if meeting has embeddings (post-meeting RAG)
        const hasEmbeddings = this.vectorStore.hasEmbeddings(meetingId);
        if (!hasEmbeddings) {
            // JIT RAG: Check if live indexer has chunks for this meeting
            const isLiveMeeting = this.liveIndexer.getActiveMeetingId() === meetingId;
            if (isLiveMeeting && this.liveIndexer.hasIndexedChunks()) {
                console.log(`[RAGManager] Using JIT RAG for live meeting ${meetingId} (${this.liveIndexer.getIndexedChunkCount()} chunks)`);
                // Fall through to retrieval — VectorStore already has the JIT chunks
            }
            else {
                // No embeddings at all — trigger wrapper fallback
                throw new Error('NO_MEETING_EMBEDDINGS');
            }
        }
        // Retrieve relevant context
        const context = await this.retriever.retrieve(query, { meetingId });
        if (context.chunks.length === 0) {
            // No context relevant to query - trigger wrapper fallback to use context window
            throw new Error('NO_RELEVANT_CONTEXT_FOUND');
        }
        // Build prompt with intent hint
        const prompt = (0, prompts_1.buildRAGPrompt)(query, context.formattedContext, 'meeting', context.intent);
        // Stream response
        const stream = this.llmHelper.streamChatWithGemini(prompt, undefined, undefined, true);
        for await (const chunk of stream) {
            if (abortSignal?.aborted)
                break;
            yield chunk;
        }
    }
    /**
     * Query across all meetings (global search)
     */
    async *queryGlobal(query, abortSignal) {
        if (!this.llmHelper) {
            throw new Error('LLM helper not initialized');
        }
        // Retrieve from all meetings
        const context = await this.retriever.retrieveGlobal(query);
        if (context.chunks.length === 0) {
            yield prompts_1.NO_GLOBAL_CONTEXT_FALLBACK;
            return;
        }
        // Build prompt with intent hint
        const prompt = (0, prompts_1.buildRAGPrompt)(query, context.formattedContext, 'global', context.intent);
        // Stream response
        const stream = this.llmHelper.streamChatWithGemini(prompt, undefined, undefined, true);
        for await (const chunk of stream) {
            if (abortSignal?.aborted)
                break;
            yield chunk;
        }
    }
    /**
     * Smart query - auto-detects scope
     */
    async *query(query, currentMeetingId, abortSignal) {
        const scope = this.retriever.detectScope(query, currentMeetingId);
        if (scope === 'meeting' && currentMeetingId) {
            yield* this.queryMeeting(currentMeetingId, query, abortSignal);
        }
        else {
            yield* this.queryGlobal(query, abortSignal);
        }
    }
    /**
     * Get embedding queue status
     */
    getQueueStatus() {
        return this.embeddingPipeline.getQueueStatus();
    }
    /**
     * Retry pending embeddings
     */
    async retryPendingEmbeddings() {
        await this.embeddingPipeline.processQueue();
    }
    /**
     * Check if a meeting has been processed for RAG
     */
    isMeetingProcessed(meetingId) {
        return this.vectorStore.hasEmbeddings(meetingId);
    }
    // ─── JIT RAG: Live Meeting Indexing ──────────────────────────────
    /**
     * Start JIT indexing for a live meeting.
     * Call when a meeting session begins.
     */
    startLiveIndexing(meetingId) {
        if (!this.embeddingPipeline.isReady()) {
            console.log('[RAGManager] Embedding pipeline not ready, skipping live indexing');
            return;
        }
        // Ensure meeting row exists in DB to satisfy foreign key constraints for chunks
        try {
            this.db.prepare(`
                INSERT OR IGNORE INTO meetings (id, title, start_time, duration_ms, summary_json, created_at, source, is_processed)
                VALUES (?, 'Live Meeting', ?, 0, '{}', ?, 'manual', 0)
            `).run(meetingId, Date.now(), new Date().toISOString());
        }
        catch (e) {
            console.warn('[RAGManager] Failed to create transient meeting row for live indexing', e);
        }
        this.liveIndexer.start(meetingId);
    }
    /**
     * Feed new transcript segments to the live indexer.
     * Call whenever new transcript arrives during the meeting.
     */
    feedLiveTranscript(segments) {
        this.liveIndexer.feedSegments(segments);
    }
    /**
     * Stop JIT indexing (flushes remaining segments).
     * Call when the meeting session ends.
     * NOTE: The post-meeting processMeeting() will later replace JIT chunks
     * with the complete, properly indexed version.
     */
    async stopLiveIndexing() {
        await this.liveIndexer.stop();
    }
    /**
     * Check if JIT indexing is active for a meeting.
     */
    isLiveIndexingActive(meetingId) {
        if (meetingId) {
            return this.liveIndexer.getActiveMeetingId() === meetingId;
        }
        return this.liveIndexer.isRunning();
    }
    /**
     * Check if JIT indexing has produced at least one queryable (embedded) chunk.
     * Prevents wasted queryMeeting() calls that immediately throw NO_MEETING_EMBEDDINGS.
     */
    hasLiveChunks() {
        return this.liveIndexer.hasIndexedChunks();
    }
    /**
     * Delete RAG data for a meeting
     */
    deleteMeetingData(meetingId) {
        // 1. Delete from vector store (chunks and summaries)
        this.vectorStore.deleteChunksForMeeting(meetingId);
        // 2. Clear embedding queue for this meeting to prevent "Chunk not found" errors on re-processing
        try {
            const info = this.db.prepare('DELETE FROM embedding_queue WHERE meeting_id = ?').run(meetingId);
            if (info.changes > 0) {
                console.log(`[RAGManager] Cleared ${info.changes} items from embedding_queue for meeting ${meetingId}`);
            }
        }
        catch (e) {
            console.warn(`[RAGManager] Failed to clear embedding_queue for meeting ${meetingId}`, e);
        }
        // 3. Clean up transient meeting row if it was a live session
        try {
            if (meetingId === 'live-meeting-current') {
                this.db.prepare('DELETE FROM meetings WHERE id = ?').run(meetingId);
            }
        }
        catch (e) {
            console.warn('[RAGManager] Failed to delete transient meeting row', e);
        }
    }
    /**
     * Manually trigger processing for a meeting
     * Useful for demo meetings or reprocessing failed ones
     */
    async reprocessMeeting(meetingId) {
        // Guard: if this meeting is already being reprocessed, skip to prevent
        // concurrent runs from clearing each other's queue work.
        if (this._reprocessInFlight.has(meetingId)) {
            console.log(`[RAGManager] Reprocessing already in-flight for ${meetingId}, skipping duplicate call`);
            return;
        }
        this._reprocessInFlight.add(meetingId);
        console.log(`[RAGManager] Reprocessing meeting ${meetingId}`);
        try {
            // delete existing RAG data first to avoid duplicates
            this.deleteMeetingData(meetingId);
            // Fetch meeting details from DB
            const { DatabaseManager } = require('../db/DatabaseManager');
            const meeting = DatabaseManager.getInstance().getMeetingDetails(meetingId);
            if (!meeting) {
                console.error(`[RAGManager] Meeting ${meetingId} not found for reprocessing`);
                return;
            }
            if (!meeting.transcript || meeting.transcript.length === 0) {
                console.log(`[RAGManager] Meeting ${meetingId} has no transcript, skipping`);
                return;
            }
            // Convert to RawSegment format
            const segments = meeting.transcript.map((t) => ({
                speaker: t.speaker,
                text: t.text,
                timestamp: t.timestamp
            }));
            // Get summary if available
            let summary;
            if (meeting.detailedSummary) {
                summary = [
                    ...(meeting.detailedSummary.overview ? [meeting.detailedSummary.overview] : []),
                    ...(meeting.detailedSummary.keyPoints || []),
                    ...(meeting.detailedSummary.actionItems || []).map((a) => `Action: ${a}`)
                ].join('. ');
            }
            else if (meeting.summary) {
                summary = meeting.summary;
            }
            await this.processMeeting(meetingId, segments, summary);
        }
        finally {
            this._reprocessInFlight.delete(meetingId);
        }
    }
    /**
     * Ensure demo meeting is processed
     * Checks if demo meeting exists but has no chunks, then processes it
     */
    async ensureDemoMeetingProcessed() {
        const demoId = 'demo-meeting'; // Corrected ID to match DatabaseManager
        // Check if demo meeting exists in DB
        const { DatabaseManager } = require('../db/DatabaseManager');
        const meeting = DatabaseManager.getInstance().getMeetingDetails(demoId);
        if (!meeting) {
            // console.log('[RAGManager] Demo meeting not found in DB, skipping RAG processing');
            return;
        }
        // Check if already processed (has embeddings)
        if (this.isMeetingProcessed(demoId)) {
            // console.log('[RAGManager] Demo meeting already processed');
            return;
        }
        // Guard: also check the in-flight set — reprocessMeeting() itself is guarded,
        // but checking here avoids even printing the "Processing now..." log redundantly.
        if (this._reprocessInFlight.has(demoId)) {
            console.log(`[RAGManager] Demo meeting reprocessing already in-flight, skipping`);
            return;
        }
        console.log('[RAGManager] Demo meeting found but not processed. Processing now...');
        await this.reprocessMeeting(demoId);
    }
    /**
     * Cleanup stale queue items for meetings that no longer exist
     */
    cleanupStaleQueueItems() {
        try {
            const info = this.db.prepare(`
                DELETE FROM embedding_queue 
                WHERE meeting_id NOT IN (SELECT id FROM meetings)
            `).run();
            if (info.changes > 0) {
                console.log(`[RAGManager] Cleaned up ${info.changes} stale queue items`);
            }
        }
        catch (error) {
            console.error('[RAGManager] Failed to cleanup stale queue items:', error);
        }
    }
    /**
     * Trigger bulk re-indexing of meetings with obsolete/incompatible embedding dimensions.
     * Deletes their unreadable geometric BLOBs and requeues them via the active EmbeddingPipeline.
     */
    async reindexIncompatibleMeetings() {
        const providerName = this.embeddingPipeline.getActiveProviderName();
        if (!providerName) {
            console.error('[RAGManager] Cannot re-index: No active embedding provider available.');
            return;
        }
        const count = this.vectorStore.getIncompatibleMeetingsCount(providerName);
        if (count === 0) {
            console.log('[RAGManager] No incompatible meetings found to reindex.');
            return;
        }
        console.log(`[RAGManager] Re-indexing ${count} incompatible meetings for ${providerName} pipeline...`);
        const affectedMeetingIds = this.vectorStore.deleteEmbeddingsForMeetings(providerName);
        for (const meetingId of affectedMeetingIds) {
            // Queue the re-embedding background jobs
            await this.embeddingPipeline.queueMeeting(meetingId);
        }
        console.log(`[RAGManager] Successfully requeued ${affectedMeetingIds.length} meetings for re-embedding.`);
    }
}
exports.RAGManager = RAGManager;
//# sourceMappingURL=RAGManager.js.map
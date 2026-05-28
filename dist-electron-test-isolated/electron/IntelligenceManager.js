"use strict";
// IntelligenceManager.ts
// Thin facade that delegates to focused sub-modules.
// Maintains full backward compatibility — all existing callers continue to work unchanged.
//
// Sub-modules:
//   SessionTracker     — state, transcript arrays, context management, epoch compaction
//   IntelligenceEngine — LLM mode routing (6 modes), event emission
//   MeetingPersistence — meeting stop/save/recovery
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligenceManager = exports.GEMINI_FLASH_MODEL = void 0;
const events_1 = require("events");
const SessionTracker_1 = require("./SessionTracker");
const IntelligenceEngine_1 = require("./IntelligenceEngine");
const MeetingPersistence_1 = require("./MeetingPersistence");
exports.GEMINI_FLASH_MODEL = "gemini-3.1-flash-lite-preview";
/**
 * IntelligenceManager - Facade for the intelligence layer.
 *
 * Delegates to:
 * - SessionTracker:     context, transcripts, epoch summaries
 * - IntelligenceEngine: LLM modes (assist, whatToSay, followUp, recap, clarify, manual, followUpQuestions)
 * - MeetingPersistence: meeting stop/save/recovery
 */
class IntelligenceManager extends events_1.EventEmitter {
    session;
    engine;
    persistence;
    constructor(llmHelper) {
        super();
        this.session = new SessionTracker_1.SessionTracker();
        this.engine = new IntelligenceEngine_1.IntelligenceEngine(llmHelper, this.session);
        this.persistence = new MeetingPersistence_1.MeetingPersistence(this.session, llmHelper);
        // Forward all engine events through the facade
        this.forwardEngineEvents();
    }
    /**
     * Forward all events from IntelligenceEngine through this facade
     * so existing listeners on IntelligenceManager continue to work.
     */
    forwardEngineEvents() {
        const events = [
            'assist_update', 'suggested_answer', 'suggested_answer_token',
            'refined_answer', 'refined_answer_token',
            'recap', 'recap_token', 'clarify', 'clarify_token',
            'follow_up_questions_update', 'follow_up_questions_token',
            'manual_answer_started', 'manual_answer_result',
            'mode_changed', 'error',
            // Sprint 7: dedicated channel for negotiation coaching payloads.
            'negotiation_coaching',
            // Phase 3: Cluely-style dynamic action card emissions.
            'dynamic_action_emitted',
        ];
        for (const event of events) {
            this.engine.on(event, (...args) => {
                this.emit(event, ...args);
            });
        }
    }
    // ============================================
    // LLM Initialization (delegates to engine)
    // ============================================
    initializeLLMs() {
        // Cancel any in-flight streams before swapping LLM clients
        this.engine.reset();
        this.engine.initializeLLMs();
    }
    reinitializeLLMs() {
        this.engine.reset();
        this.engine.reinitializeLLMs();
    }
    // ============================================
    // Context Management (delegates to session)
    // ============================================
    setMeetingMetadata(metadata) {
        this.session.setMeetingMetadata(metadata);
    }
    addTranscript(segment, skipRefinementCheck = false) {
        if (skipRefinementCheck) {
            // Direct add without refinement detection
            this.session.addTranscript(segment);
        }
        else {
            // Let the engine handle transcript + refinement detection
            this.engine.handleTranscript(segment, false);
        }
    }
    addAssistantMessage(text) {
        this.session.addAssistantMessage(text);
    }
    getContext(lastSeconds = 120) {
        return this.session.getContext(lastSeconds);
    }
    getLastAssistantMessage() {
        return this.session.getLastAssistantMessage();
    }
    getFormattedContext(lastSeconds = 120) {
        return this.session.getFormattedContext(lastSeconds);
    }
    getLastInterviewerTurn() {
        return this.session.getLastInterviewerTurn();
    }
    logUsage(type, question, answer) {
        this.session.logUsage(type, question, answer);
    }
    // ============================================
    // Transcript Handling (delegates to engine)
    // ============================================
    handleTranscript(segment) {
        this.engine.handleTranscript(segment);
    }
    async handleSuggestionTrigger(trigger) {
        return this.engine.handleSuggestionTrigger(trigger);
    }
    // ============================================
    // Mode Executors (delegates to engine)
    // ============================================
    async runAssistMode() {
        return this.engine.runAssistMode();
    }
    async runWhatShouldISay(question, confidence, imagePaths, options) {
        return this.engine.runWhatShouldISay(question, confidence, imagePaths, options);
    }
    async runFollowUp(intent, userRequest) {
        return this.engine.runFollowUp(intent, userRequest);
    }
    async runRecap() {
        return this.engine.runRecap();
    }
    async runClarify() {
        return this.engine.runClarify();
    }
    async runFollowUpQuestions() {
        return this.engine.runFollowUpQuestions();
    }
    async runManualAnswer(question) {
        return this.engine.runManualAnswer(question);
    }
    async runCodeHint(imagePaths, problemStatement) {
        return this.engine.runCodeHint(imagePaths, problemStatement);
    }
    setCodingQuestion(question, source) {
        this.session.setCodingQuestion(question, source);
    }
    getDetectedCodingQuestion() {
        return this.session.getDetectedCodingQuestion();
    }
    clearCodingQuestion() {
        this.session.clearCodingQuestion();
    }
    async runBrainstorm(imagePaths, problemStatement) {
        return this.engine.runBrainstorm(imagePaths, problemStatement);
    }
    // ============================================
    // State Management
    // ============================================
    getActiveMode() {
        return this.engine.getActiveMode();
    }
    setMode(mode) {
        // This was private in the original, but kept for compatibility
        this.engine.setMode(mode);
    }
    // ============================================
    // Meeting Lifecycle (delegates to persistence)
    // ============================================
    async stopMeeting() {
        return this.persistence.stopMeeting();
    }
    async recoverUnprocessedMeetings() {
        return this.persistence.recoverUnprocessedMeetings();
    }
    // ============================================
    // Mode Context Management
    // ============================================
    /**
     * Clear mode-specific transient context without resetting the full session.
     * Called when user switches modes to prevent old mode's context (Interviewer
     * Q's, JD context, assistant response history) from bleeding into the new mode.
     */
    clearSessionContext() {
        this.session.clearSessionContext();
    }
    // ============================================
    // Phase 3 — Dynamic Actions facade
    // ============================================
    /**
     * Bind dynamic-action engine to the active meeting/mode.
     * Caller is the IPC handler that starts a meeting (with sessionId) or
     * the modes:set-active handler that switches the active mode mid-meeting.
     */
    setDynamicActionContext(params) {
        this.engine.setDynamicActionContext(params);
    }
    clearDynamicActionContext() {
        this.engine.clearDynamicActionContext();
    }
    acceptDynamicAction(actionId) {
        return this.engine.acceptDynamicAction(actionId);
    }
    dismissDynamicAction(actionId) {
        this.engine.dismissDynamicAction(actionId);
    }
    getActiveDynamicActions() {
        return this.engine.getActiveDynamicActions();
    }
    // ============================================
    // Reset (resets all sub-modules)
    // ============================================
    /**
     * resetEngine: Cancel in-flight LLM streams WITHOUT touching session state.
     * Use this when swapping API keys or providers mid-session so the transcript
     * is not wiped. (full reset() also clears the session — only use that at
     * end of meeting or explicit session teardown.)
     */
    resetEngine() {
        this.engine.reset();
    }
    reset() {
        this.session.reset();
        this.engine.reset();
    }
}
exports.IntelligenceManager = IntelligenceManager;
//# sourceMappingURL=IntelligenceManager.js.map
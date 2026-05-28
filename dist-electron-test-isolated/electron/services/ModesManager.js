"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModesManager = exports.TEMPLATE_NOTE_SECTIONS = exports.MODE_TEMPLATES = void 0;
exports.encodeModeContextPayload = encodeModeContextPayload;
const DatabaseManager_1 = require("../db/DatabaseManager");
const ModeContextRetriever_1 = require("./ModeContextRetriever");
const prompts_1 = require("../llm/prompts");
exports.MODE_TEMPLATES = [
    { type: 'general', label: 'General', description: 'Universal adaptive copilot for any meeting or conversation.' },
    { type: 'sales', label: 'Sales', description: 'Close deals with strategic discovery and objection handling.' },
    { type: 'recruiting', label: 'Recruiting', description: 'Evaluate candidates with structured interview insights.' },
    { type: 'team-meet', label: 'Team Meet', description: 'Track action items and key decisions from meetings.' },
    { type: 'looking-for-work', label: 'Looking for work', description: 'Answer interview questions with confidence and clarity.' },
    { type: 'technical-interview', label: 'Technical Interview', description: 'Whiteboard-style coding and system design support.' },
    { type: 'lecture', label: 'Lecture', description: 'Capture key concepts and content from lectures.' },
];
// Default note sections seeded when a mode is created from a template
exports.TEMPLATE_NOTE_SECTIONS = {
    general: [
        { title: 'Summary', description: 'High-level summary of the conversation.' },
        { title: 'Action items', description: 'Tasks and follow-ups identified.' },
        { title: 'Key points', description: 'Important points discussed.' },
    ],
    'looking-for-work': [
        { title: 'Follow-up actions', description: 'Next interview steps or additional materials I said I would send if applicable.' },
        { title: 'Overview', description: 'Overview of the interview, the company, and general structure.' },
        { title: 'Questions and responses', description: 'All questions asked to me during the interview and answers that gave.' },
        { title: 'Areas to improve', description: 'What I could have done better during the interview.' },
        { title: 'Role details', description: 'Anything discussed about the position, salary expectations, etc.' },
    ],
    sales: [
        { title: 'Action Items', description: 'All action items that were said I would do after the meeting.' },
        { title: 'Outcome', description: 'Did I close the sale and what was the outcome of the conversation.' },
        { title: 'Prospect background', description: 'Background and context on who I was selling to.' },
        { title: 'Discovery', description: 'What the prospect said during discovery.' },
        { title: 'Product', description: "How I pitched the product and the prospect's reaction." },
        { title: 'Objections', description: 'Objections from the prospect if there were any.' },
    ],
    recruiting: [
        { title: 'Action Items', description: 'All action items that I have to do after the meeting.' },
        { title: 'Experience and skills', description: "Candidate's previous work experience and skills discussed." },
        { title: 'Quality of responses', description: 'If there were questions asked, how well and how accurately the candidate answered each question.' },
        { title: 'Interest in company', description: 'What the candidate said about their interest in the company.' },
        { title: 'Role expectations', description: 'Anything discussed about the position, salary expectations, etc.' },
    ],
    'team-meet': [
        { title: 'Action Items', description: 'All action items that were said I would do after the meeting.' },
        { title: 'Announcements', description: 'Any team-wide announcements from the meeting.' },
        { title: 'Team updates', description: "Each team member's progress, accomplishments, and current focus." },
        { title: 'Challenges or blockers', description: 'Any issues or obstacles raised that may affect progress.' },
        { title: 'Decisions made', description: 'Key decisions or agreements reached during the meeting.' },
    ],
    lecture: [
        { title: 'Follow-up work', description: 'Follow-up reading, assignments, or tasks to complete.' },
        { title: 'Topic', description: 'Main subject or theme of the lecture.' },
        { title: 'Key concepts', description: 'Core ideas or frameworks covered.' },
        { title: 'Content', description: 'All content from the lecture with incredibly detailed bullet notes.' },
    ],
    'technical-interview': [
        { title: 'Problems covered', description: 'Each problem asked, the approach used, and the outcome.' },
        { title: 'Concepts tested', description: 'Key algorithms, data structures, or system design concepts that came up.' },
        { title: 'What went well', description: 'Approaches or explanations that landed well.' },
        { title: 'Areas to study', description: 'Topics or gaps identified that need more preparation.' },
        { title: 'Action items', description: 'Follow-up steps — e.g. send code, study specific topics, await next round.' },
    ],
};
const TEMPLATE_SYSTEM_PROMPTS = {
    // General = universal adaptive copilot (own prompt, not technical interview)
    general: prompts_1.MODE_GENERAL_PROMPT,
    'technical-interview': prompts_1.MODE_TECHNICAL_INTERVIEW_PROMPT,
    'looking-for-work': prompts_1.MODE_LOOKING_FOR_WORK_PROMPT,
    sales: prompts_1.MODE_SALES_PROMPT,
    recruiting: prompts_1.MODE_RECRUITING_PROMPT,
    'team-meet': prompts_1.MODE_TEAM_MEET_PROMPT,
    lecture: prompts_1.MODE_LECTURE_PROMPT,
};
// Startup invariant: every MODE_*_PROMPT must begin with one of the two shared
// prefixes so getActiveModeSystemPromptSuffix() can strip duplicated tokens.
// If a future template diverges, we silently regress to shipping ~1.6K duplicate
// tokens per request. Warn loudly here instead so the regression is caught at
// app launch, not by a prod cost spike.
for (const [templateType, prompt] of Object.entries(TEMPLATE_SYSTEM_PROMPTS)) {
    if (!prompt.startsWith(prompts_1.SHARED_MODE_PREFIX) && !prompt.startsWith(prompts_1.SHARED_MODE_PREFIX_SHORT)) {
        console.warn(`[ModesManager] WARN: MODE template '${templateType}' does not start with ` +
            `SHARED_MODE_PREFIX or SHARED_MODE_PREFIX_SHORT. Token deduplication will fall ` +
            `back to sending the full template — duplicate-token regression. See prompts.ts.`);
    }
}
function encodeModeContextPayload(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}
function rowToMode(row) {
    return {
        id: row.id,
        name: row.name,
        templateType: row.template_type,
        customContext: row.custom_context ?? '',
        isActive: row.is_active === 1,
        createdAt: row.created_at,
    };
}
function rowToFile(row) {
    return {
        id: row.id,
        modeId: row.mode_id,
        fileName: row.file_name,
        content: row.content ?? '',
        createdAt: row.created_at,
    };
}
function rowToSection(row) {
    return {
        id: row.id,
        modeId: row.mode_id,
        title: row.title,
        description: row.description ?? '',
        sortOrder: row.sort_order ?? 0,
        createdAt: row.created_at,
    };
}
class ModesManager {
    static instance;
    modeContextRetriever = new ModeContextRetriever_1.ModeContextRetriever();
    constructor() { }
    static getInstance() {
        if (!ModesManager.instance) {
            ModesManager.instance = new ModesManager();
        }
        return ModesManager.instance;
    }
    // ── Modes ─────────────────────────────────────────────────────
    getModes() {
        const modes = DatabaseManager_1.DatabaseManager.getInstance().getModes().map(rowToMode);
        // Always enforce 'general' at the very top of the list.
        // L1: id is the secondary sort key for stable ordering when two modes
        // share createdAt to the millisecond.
        modes.sort((a, b) => {
            if (a.templateType === 'general')
                return -1;
            if (b.templateType === 'general')
                return 1;
            const ta = new Date(a.createdAt).getTime();
            const tb = new Date(b.createdAt).getTime();
            if (ta !== tb)
                return ta - tb;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        return modes;
    }
    // Seed the un-deletable General mode once at app init. Idempotent.
    ensureSeeded() {
        const modes = DatabaseManager_1.DatabaseManager.getInstance().getModes().map(rowToMode);
        if (!modes.some(m => m.templateType === 'general')) {
            this.createMode({ name: 'General', templateType: 'general' });
        }
    }
    getActiveMode() {
        const row = DatabaseManager_1.DatabaseManager.getInstance().getActiveMode();
        return row ? rowToMode(row) : null;
    }
    // Mode templates where a salary-negotiation coaching card would replace the
    // user's expected answer with off-topic content. Technical interviews are
    // coding/system-design only; team meetings and lectures have no salary
    // scope. Issue #272: technical-interview users were getting one-line salary
    // coaching cards instead of technical answers from the "What to Answer"
    // button because the premium negotiation tracker fires on any interviewer
    // utterance regardless of the active mode.
    static NEGOTIATION_INCOMPATIBLE_TEMPLATES = new Set([
        'technical-interview',
        'team-meet',
        'lecture',
    ]);
    /**
     * True when negotiation coaching is contextually appropriate for the active
     * mode. False for technical-interview, team-meet, and lecture — modes where
     * a salary card mid-conversation overwrites the user's expected answer.
     * Defaults to true when no mode is active.
     */
    isNegotiationCoachingAllowed() {
        const mode = this.getActiveMode();
        if (!mode)
            return true;
        return !ModesManager.NEGOTIATION_INCOMPATIBLE_TEMPLATES.has(mode.templateType);
    }
    createMode(params) {
        const id = `mode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        DatabaseManager_1.DatabaseManager.getInstance().createMode({
            id,
            name: params.name,
            templateType: params.templateType,
            customContext: '',
        });
        // Seed default note sections for this template type
        const defaultSections = exports.TEMPLATE_NOTE_SECTIONS[params.templateType] ?? [];
        defaultSections.forEach((s, i) => {
            const sectionId = `ns_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
            DatabaseManager_1.DatabaseManager.getInstance().addNoteSection({
                id: sectionId,
                modeId: id,
                title: s.title,
                description: s.description,
                sortOrder: i,
            });
        });
        return {
            id,
            name: params.name,
            templateType: params.templateType,
            customContext: '',
            isActive: false,
            createdAt: new Date().toISOString(),
        };
    }
    updateMode(id, updates) {
        DatabaseManager_1.DatabaseManager.getInstance().updateMode(id, updates);
    }
    deleteMode(id) {
        DatabaseManager_1.DatabaseManager.getInstance().deleteMode(id);
    }
    setActiveMode(id) {
        DatabaseManager_1.DatabaseManager.getInstance().setActiveMode(id);
    }
    // ── Reference Files ───────────────────────────────────────────
    getReferenceFiles(modeId) {
        return DatabaseManager_1.DatabaseManager.getInstance().getReferenceFiles(modeId).map(rowToFile);
    }
    addReferenceFile(params) {
        const id = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        DatabaseManager_1.DatabaseManager.getInstance().addReferenceFile({
            id,
            modeId: params.modeId,
            fileName: params.fileName,
            content: params.content,
        });
        return {
            id,
            modeId: params.modeId,
            fileName: params.fileName,
            content: params.content,
            createdAt: new Date().toISOString(),
        };
    }
    deleteReferenceFile(id) {
        DatabaseManager_1.DatabaseManager.getInstance().deleteReferenceFile(id);
    }
    // ── Note Sections ─────────────────────────────────────────────
    getNoteSections(modeId) {
        return DatabaseManager_1.DatabaseManager.getInstance().getNoteSections(modeId).map(rowToSection);
    }
    addNoteSection(params) {
        const existingSections = this.getNoteSections(params.modeId);
        const sortOrder = existingSections.length;
        const id = `ns_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        DatabaseManager_1.DatabaseManager.getInstance().addNoteSection({
            id,
            modeId: params.modeId,
            title: params.title,
            description: params.description,
            sortOrder,
        });
        return {
            id,
            modeId: params.modeId,
            title: params.title,
            description: params.description,
            sortOrder,
            createdAt: new Date().toISOString(),
        };
    }
    updateNoteSection(id, updates) {
        DatabaseManager_1.DatabaseManager.getInstance().updateNoteSection(id, updates);
    }
    deleteNoteSection(id) {
        DatabaseManager_1.DatabaseManager.getInstance().deleteNoteSection(id);
    }
    removeAllNoteSections(modeId) {
        DatabaseManager_1.DatabaseManager.getInstance().deleteAllNoteSections(modeId);
    }
    // ── LLM Context ───────────────────────────────────────────────
    /**
     * Returns the system prompt suffix for the active mode's template type.
     * Returns the template's MODE_*_PROMPT (including general's MODE_GENERAL_PROMPT
     * and technical-interview's MODE_TECHNICAL_INTERVIEW_PROMPT). Empty string
     * only when no mode is active.
     */
    getActiveModeSystemPromptSuffix() {
        const mode = this.getActiveMode();
        if (!mode)
            return '';
        const full = TEMPLATE_SYSTEM_PROMPTS[mode.templateType] ?? '';
        // Strip the shared prefix that's already in HARD_SYSTEM_PROMPT, otherwise
        // CORE_IDENTITY + EXECUTION_CONTRACT + CONTEXT_INTELLIGENCE_LAYER (+
        // SHARED_CODING_RULES for coding modes) ship twice per request — ~1.6K
        // duplicated tokens for coding modes, ~1.2K for non-coding.
        //
        // Try the long (4-block) prefix first to handle coding modes, then the
        // short (3-block) prefix for sales/recruiting/team-meet/lecture which
        // intentionally omit SHARED_CODING_RULES. Fall back to unchanged if
        // neither matches — safe default for future template drift.
        for (const prefix of [prompts_1.SHARED_MODE_PREFIX, prompts_1.SHARED_MODE_PREFIX_SHORT]) {
            if (full.startsWith(prefix)) {
                return full.slice(prefix.length).replace(/^\s+/, '');
            }
        }
        return full;
    }
    /**
     * Builds a context block to inject before the user message for the active mode.
     * Includes custom context text and reference file contents.
     *
     * Limits: each file is capped at MAX_FILE_CHARS to prevent context window overflow.
     * Total block is capped at MAX_TOTAL_CHARS across all files.
     */
    static MAX_FILE_CHARS = 12_000;
    static MAX_TOTAL_CHARS = 40_000;
    buildRetrievedActiveModeContextBlock(query, transcript, tokenBudget) {
        const mode = this.getActiveMode();
        if (!mode)
            return '';
        const result = this.modeContextRetriever.retrieve(mode, this.getReferenceFiles(mode.id), {
            query,
            transcript,
            tokenBudget,
        });
        return result.formattedContext;
    }
    /**
     * Phase 4 — async hybrid retrieval (FTS + vector + dedupe + lexical fallback).
     * Callers in async paths (WhatToAnswerLLM, LLMHelper paths) should prefer
     * this. If hybrid throws (DB missing, embedding provider unavailable),
     * we fall back to the existing sync lexical path so the answer flow
     * never breaks. Telemetry distinguishes hybrid hits from lexical fallback.
     */
    async buildRetrievedActiveModeContextBlockHybrid(query, transcript, tokenBudget) {
        const mode = this.getActiveMode();
        if (!mode)
            return '';
        const files = this.getReferenceFiles(mode.id);
        // Telemetry: rag_query / rag_hit / rag_miss / rag_lexical_fallback.
        let usedHybrid = false;
        let usedFallback = false;
        let chunkCount = 0;
        try {
            const { telemetryService } = require('./telemetry/TelemetryService');
            telemetryService.track({
                name: 'rag_query',
                modeId: mode.id,
                properties: { modeTemplateType: mode.templateType, fileCount: files.length, hasTranscript: Boolean(transcript) },
            });
        }
        catch { /* non-fatal */ }
        try {
            const result = await this.modeContextRetriever.retrieveHybrid(mode, files, {
                query,
                transcript,
                tokenBudget,
            });
            usedHybrid = result.usedHybrid;
            usedFallback = result.usedFallback;
            chunkCount = result.chunks?.length ?? 0;
            if (result.formattedContext) {
                try {
                    const { telemetryService } = require('./telemetry/TelemetryService');
                    telemetryService.track({
                        name: usedHybrid ? 'rag_hit' : 'rag_lexical_fallback',
                        modeId: mode.id,
                        properties: { chunkCount, modeTemplateType: mode.templateType },
                    });
                }
                catch { /* non-fatal */ }
                return result.formattedContext;
            }
            // Empty hybrid result — fall through to lexical so we still try.
        }
        catch (err) {
            console.warn('[ModesManager] hybrid retrieval failed, falling back to lexical:', err?.message);
        }
        const lexical = this.buildRetrievedActiveModeContextBlock(query, transcript, tokenBudget);
        try {
            const { telemetryService } = require('./telemetry/TelemetryService');
            telemetryService.track({
                name: lexical ? 'rag_lexical_fallback' : 'rag_miss',
                modeId: mode.id,
                properties: { modeTemplateType: mode.templateType, fileCount: files.length },
            });
        }
        catch { /* non-fatal */ }
        return lexical;
    }
    /**
     * Phase 6 — summary-safe context block for post-call summarization.
     *
     * Includes the mode's `customContext` (low-token, user-authored, trusted) plus
     * up to a small budget of *retrieved* reference snippets. Never returns full
     * raw reference file bodies, even when retrieval misses — that data path is
     * covered by `buildActiveModeContextBlock()` and remains legacy/supporting.
     *
     * Callers can opt out of the retrieved-snippets portion via
     * `options.includeReferenceSnippets = false` to honor the
     * `reference_files` provider data scope without losing mode customContext.
     */
    buildSummarySafeModeContextBlock(modeId, options) {
        const mode = this.getModes().find(m => m.id === modeId);
        if (!mode)
            return '';
        const parts = [];
        if (mode.customContext.trim()) {
            parts.push(`<active_mode_custom_instructions format="json">\n${encodeModeContextPayload({ content: mode.customContext.trim() })}\n</active_mode_custom_instructions>`);
        }
        const includeReferenceSnippets = options?.includeReferenceSnippets !== false;
        if (includeReferenceSnippets) {
            try {
                const result = this.modeContextRetriever.retrieve(mode, this.getReferenceFiles(mode.id), {
                    query: options?.query ?? '',
                    transcript: options?.transcript ?? '',
                    tokenBudget: options?.tokenBudget ?? 1200,
                });
                if (result?.formattedContext) {
                    parts.push(result.formattedContext);
                }
            }
            catch (err) {
                console.warn('[ModesManager] summary-safe retrieval failed (non-fatal):', err?.message);
            }
        }
        return parts.length > 0 ? '\n' + parts.join('\n\n') + '\n' : '';
    }
    buildActiveModeContextBlock() {
        const mode = this.getActiveMode();
        if (!mode)
            return '';
        const parts = [];
        if (mode.customContext.trim()) {
            parts.push(`<active_mode_custom_instructions format="json">\n${encodeModeContextPayload({ content: mode.customContext.trim() })}\n</active_mode_custom_instructions>`);
        }
        const files = this.getReferenceFiles(mode.id);
        const MARKER = '[...truncated]';
        let totalChars = 0;
        for (const file of files) {
            const raw = file.content.trim();
            if (!raw)
                continue;
            const remaining = ModesManager.MAX_TOTAL_CHARS - totalChars;
            if (remaining <= 0)
                break;
            // Cap per-file. Only append the truncation marker when there's
            // headroom for the full marker — never emit a partial '[...truncat'.
            const fileCap = ModesManager.MAX_FILE_CHARS;
            let capped;
            if (raw.length > fileCap) {
                if (fileCap > MARKER.length + 1) {
                    capped = raw.slice(0, fileCap - MARKER.length - 1) + '\n' + MARKER;
                }
                else {
                    capped = raw.slice(0, fileCap);
                }
            }
            else {
                capped = raw;
            }
            // Apply the cross-file budget. If the slice would split the marker, drop it.
            let content;
            if (capped.length <= remaining) {
                content = capped;
            }
            else if (remaining >= MARKER.length + 1) {
                content = capped.slice(0, remaining - MARKER.length - 1) + '\n' + MARKER;
            }
            else {
                content = capped.slice(0, remaining);
            }
            const payload = encodeModeContextPayload({ fileName: file.fileName, content });
            parts.push(`<reference_file format="json">\n${payload}\n</reference_file>`);
            totalChars += content.length;
        }
        return parts.join('\n\n');
    }
}
exports.ModesManager = ModesManager;
//# sourceMappingURL=ModesManager.js.map
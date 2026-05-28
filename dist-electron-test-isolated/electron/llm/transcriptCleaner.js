"use strict";
// electron/llm/transcriptCleaner.ts
// Deterministic transcript cleaner - NO LLM calls
// Fast string-based processing for interview copilot
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanTranscript = cleanTranscript;
exports.sparsifyTranscript = sparsifyTranscript;
exports.formatTranscriptForLLM = formatTranscriptForLLM;
exports.prepareTranscriptForWhatToAnswer = prepareTranscriptForWhatToAnswer;
/**
 * Filler words and verbal acknowledgements to remove
 */
const FILLER_WORDS = new Set([
    'uh', 'um', 'ah', 'hmm', 'hm', 'er', 'erm',
    'like', 'you know', 'i mean', 'basically', 'actually',
    'so', 'well', 'anyway', 'anyways'
]);
const ACKNOWLEDGEMENTS = new Set([
    'okay', 'ok', 'yeah', 'yes', 'right', 'sure', 'got it',
    'gotcha', 'uh-huh', 'uh huh', 'mm-hmm', 'mm hmm', 'mhm',
    'cool', 'great', 'nice', 'perfect', 'alright', 'all right'
]);
/**
 * Clean a single turn's text
 * Removes fillers, acknowledgements, and cleans up formatting
 */
function cleanText(text) {
    let result = text.toLowerCase().trim();
    // Remove repeated words (yeah yeah, okay okay)
    result = result.replace(/\b(\w+)(\s+\1)+\b/gi, '$1');
    // Split into words and filter
    const words = result.split(/\s+/);
    const cleaned = words.filter(word => {
        const normalized = word.replace(/[.,!?;:]/g, '');
        return !FILLER_WORDS.has(normalized) &&
            !ACKNOWLEDGEMENTS.has(normalized);
    });
    // Reconstruct
    result = cleaned.join(' ').trim();
    // Clean up punctuation
    result = result.replace(/\s+([.,!?;:])/g, '$1');
    result = result.replace(/([.,!?;:])+/g, '$1');
    result = result.replace(/\s+/g, ' ');
    return result;
}
/**
 * Check if a turn is meaningful enough to keep
 */
function isMeaningfulTurn(turn, cleanedText) {
    // Always keep interviewer speech (priority)
    if (turn.role === 'interviewer' && cleanedText.length >= 5) {
        return true;
    }
    // Minimum 3 words for other roles
    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < 3) {
        return false;
    }
    // Skip pure filler turns
    if (cleanedText.length < 10) {
        return false;
    }
    return true;
}
/**
 * Clean transcript buffer
 * Removes fillers, acknowledgements, and non-meaningful turns
 * Returns cleaned array preserving order
 */
function cleanTranscript(turns) {
    const cleaned = [];
    for (const turn of turns) {
        const cleanedText = cleanText(turn.text);
        if (isMeaningfulTurn(turn, cleanedText)) {
            cleaned.push({
                role: turn.role,
                text: cleanedText,
                timestamp: turn.timestamp
            });
        }
    }
    return cleaned;
}
/**
 * Sparsify transcript to target turn count
 * Prioritizes interviewer speech, keeps recent context
 * Target: 8-12 turns, ~300-600 tokens
 */
function sparsifyTranscript(turns, maxTurns = 12) {
    if (turns.length <= maxTurns) {
        return [...turns].sort((a, b) => a.timestamp - b.timestamp);
    }
    // Separate by role
    const interviewerTurns = turns.filter(t => t.role === 'interviewer');
    const otherTurns = turns.filter(t => t.role !== 'interviewer');
    // Keep all interviewer turns if under limit
    const result = [];
    // Prioritize recent interviewer turns (last 6)
    const recentInterviewer = interviewerTurns.slice(-6);
    // Fill remaining with recent other turns
    const remainingSlots = maxTurns - recentInterviewer.length;
    const recentOther = otherTurns.slice(-remainingSlots);
    // Merge and sort by timestamp
    result.push(...recentInterviewer, ...recentOther);
    result.sort((a, b) => a.timestamp - b.timestamp);
    return result;
}
/**
 * Format cleaned transcript for LLM input
 */
function formatTranscriptForLLM(turns) {
    return turns.map(turn => {
        const label = turn.role === 'interviewer' ? 'INTERVIEWER' :
            turn.role === 'user' ? 'ME' : 'ASSISTANT';
        return `[${label}]: ${turn.text}`;
    }).join('\n');
}
/**
 * Full pipeline: clean, sparsify, format
 */
function prepareTranscriptForWhatToAnswer(turns, maxTurns = 12) {
    const cleaned = cleanTranscript(turns);
    const sparsified = sparsifyTranscript(cleaned, maxTurns);
    return formatTranscriptForLLM(sparsified);
}
//# sourceMappingURL=transcriptCleaner.js.map
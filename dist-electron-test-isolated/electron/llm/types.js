"use strict";
// electron/llm/types.ts
// Shared types for the Natively LLM system
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODE_CONFIGS = void 0;
/**
 * Mode-specific token limits
 */
exports.MODE_CONFIGS = {
    answer: {
        maxOutputTokens: 65536,
        temperature: 0.25,
        topP: 0.85,
    },
    assist: {
        maxOutputTokens: 65536,
        temperature: 0.25,
        topP: 0.85,
    },
    followUp: {
        maxOutputTokens: 65536,
        temperature: 0.25,
        topP: 0.85,
    },
    recap: {
        maxOutputTokens: 65536,
        temperature: 0.25,
        topP: 0.85,
    },
    followUpQuestions: {
        maxOutputTokens: 65536,
        temperature: 0.4, // Slightly higher creative freedom
        topP: 0.9,
    },
};
//# sourceMappingURL=types.js.map
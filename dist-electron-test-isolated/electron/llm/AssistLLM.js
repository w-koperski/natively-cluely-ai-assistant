"use strict";
// electron/llm/AssistLLM.ts
// MODE: Assist - Passive observation (low priority)
// Provides brief observational insights, NEVER suggests what to say
// Uses LLMHelper for centralized routing and universal prompts
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistLLM = void 0;
const prompts_1 = require("./prompts");
const tinyPrompts_1 = require("./tinyPrompts");
class AssistLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    /**
     * Generate passive observational insight
     * @param context - Current conversation context
     * @returns Insight (no post-clamp; prompt enforces brevity)
     */
    async generate(context) {
        try {
            if (!context.trim()) {
                return "";
            }
            // Centralized LLM logic
            // providing a specific instruction as message, using UNIVERSAL_ASSIST_PROMPT as system prompt
            const instruction = "Briefly summarize what is happening right now in 1-2 sentences. Do not give advice, just observation.";
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_ASSIST_PROMPT : prompts_1.UNIVERSAL_ASSIST_PROMPT;
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            return await this.llmHelper.chat(instruction, undefined, fittedContext, promptOverride, true);
        }
        catch (error) {
            console.error("[AssistLLM] Generation failed:", error);
            return "";
        }
    }
}
exports.AssistLLM = AssistLLM;
//# sourceMappingURL=AssistLLM.js.map
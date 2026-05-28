"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClarifyLLM = void 0;
const prompts_1 = require("./prompts");
const tinyPrompts_1 = require("./tinyPrompts");
class ClarifyLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    /**
     * Generate a clarification question
     */
    async generate(context) {
        if (!context.trim())
            return "";
        try {
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_CLARIFY_PROMPT : prompts_1.CLARIFY_MODE_PROMPT;
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            const stream = this.llmHelper.streamChat(fittedContext, undefined, undefined, promptOverride);
            let fullResponse = "";
            for await (const chunk of stream)
                fullResponse += chunk;
            return fullResponse.trim();
        }
        catch (error) {
            console.error("[ClarifyLLM] Generation failed:", error);
            return "";
        }
    }
    /**
     * Generate a clarification question (Streamed)
     */
    async *generateStream(context) {
        if (!context.trim())
            return;
        try {
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_CLARIFY_PROMPT : prompts_1.CLARIFY_MODE_PROMPT;
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            yield* this.llmHelper.streamChat(fittedContext, undefined, undefined, promptOverride);
        }
        catch (error) {
            console.error("[ClarifyLLM] Streaming generation failed:", error);
        }
    }
}
exports.ClarifyLLM = ClarifyLLM;
//# sourceMappingURL=ClarifyLLM.js.map
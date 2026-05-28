"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrainstormLLM = void 0;
const prompts_1 = require("./prompts");
const tinyPrompts_1 = require("./tinyPrompts");
class BrainstormLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    /**
     * Generate a "thinking out loud" spoken script (streamed)
     * Context is passed directly as the user message so the LLM sees the problem.
     */
    async *generateStream(context, imagePaths) {
        if (!context.trim() && !imagePaths?.length)
            return;
        try {
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_BRAINSTORM_PROMPT : prompts_1.BRAINSTORM_MODE_PROMPT;
            const fittedContext = context ? this.llmHelper.fitContextForCurrentModel(context) : context;
            yield* this.llmHelper.streamChat(fittedContext, imagePaths, undefined, promptOverride);
        }
        catch (error) {
            console.error("[BrainstormLLM] Stream failed:", error);
            yield "I couldn't generate brainstorm approaches. Make sure your question is visible and try again.";
        }
    }
}
exports.BrainstormLLM = BrainstormLLM;
//# sourceMappingURL=BrainstormLLM.js.map
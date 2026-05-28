"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnswerLLM = void 0;
const prompts_1 = require("./prompts");
const tinyPrompts_1 = require("./tinyPrompts");
class AnswerLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    /**
     * Generate a spoken interview answer
     */
    async generate(question, context) {
        try {
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_ANSWER_PROMPT : prompts_1.UNIVERSAL_ANSWER_PROMPT;
            const fittedContext = context ? this.llmHelper.fitContextForCurrentModel(context) : context;
            const stream = this.llmHelper.streamChat(question, undefined, fittedContext, promptOverride);
            let fullResponse = "";
            for await (const chunk of stream) {
                fullResponse += chunk;
            }
            return fullResponse.trim();
        }
        catch (error) {
            console.error("[AnswerLLM] Generation failed:", error);
            return "";
        }
    }
}
exports.AnswerLLM = AnswerLLM;
//# sourceMappingURL=AnswerLLM.js.map
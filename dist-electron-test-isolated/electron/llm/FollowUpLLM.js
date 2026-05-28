"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpLLM = void 0;
const prompts_1 = require("./prompts");
const tinyPrompts_1 = require("./tinyPrompts");
class FollowUpLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    resolvePrompt() {
        return this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_FOLLOWUP_PROMPT : prompts_1.UNIVERSAL_FOLLOWUP_PROMPT;
    }
    async generate(previousAnswer, refinementRequest, context) {
        try {
            const message = `PREVIOUS ANSWER:\n${previousAnswer}\n\nREQUEST: ${refinementRequest}`;
            const fittedContext = context ? this.llmHelper.fitContextForCurrentModel(context) : context;
            const stream = this.llmHelper.streamChat(message, undefined, fittedContext, this.resolvePrompt());
            let full = "";
            for await (const chunk of stream)
                full += chunk;
            return full;
        }
        catch (e) {
            console.error("[FollowUpLLM] Failed:", e);
            return "";
        }
    }
    async *generateStream(previousAnswer, refinementRequest, context) {
        try {
            const message = `PREVIOUS ANSWER:\n${previousAnswer}\n\nREQUEST: ${refinementRequest}`;
            const fittedContext = context ? this.llmHelper.fitContextForCurrentModel(context) : context;
            yield* this.llmHelper.streamChat(message, undefined, fittedContext, this.resolvePrompt());
        }
        catch (e) {
            console.error("[FollowUpLLM] Stream Failed:", e);
        }
    }
}
exports.FollowUpLLM = FollowUpLLM;
//# sourceMappingURL=FollowUpLLM.js.map
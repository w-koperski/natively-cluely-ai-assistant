"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpQuestionsLLM = void 0;
const prompts_1 = require("./prompts");
const tinyPrompts_1 = require("./tinyPrompts");
class FollowUpQuestionsLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    resolvePrompt() {
        return this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_FOLLOW_UP_QUESTIONS_PROMPT : prompts_1.UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT;
    }
    async generate(context) {
        try {
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            const stream = this.llmHelper.streamChat(fittedContext, undefined, undefined, this.resolvePrompt());
            let full = "";
            for await (const chunk of stream)
                full += chunk;
            return full;
        }
        catch (e) {
            console.error("[FollowUpQuestionsLLM] Failed:", e);
            return "";
        }
    }
    async *generateStream(context) {
        try {
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            yield* this.llmHelper.streamChat(fittedContext, undefined, undefined, this.resolvePrompt());
        }
        catch (e) {
            console.error("[FollowUpQuestionsLLM] Stream Failed:", e);
        }
    }
}
exports.FollowUpQuestionsLLM = FollowUpQuestionsLLM;
//# sourceMappingURL=FollowUpQuestionsLLM.js.map
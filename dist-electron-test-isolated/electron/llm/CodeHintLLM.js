"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeHintLLM = void 0;
const prompts_1 = require("./prompts");
const tinyPrompts_1 = require("./tinyPrompts");
class CodeHintLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    async *generateStream(imagePaths, questionContext, questionSource, transcriptContext) {
        try {
            // Vision-required + small model lacking image support → fail loud, not malformed.
            if (imagePaths?.length) {
                const caps = this.llmHelper.getCapabilities();
                if (!caps.supportsImages) {
                    yield `The current local model (${caps.name}) doesn't support image input. Switch to a vision-capable model (e.g. llava, llama3.2-vision, gemma3) or use a cloud model.`;
                    return;
                }
            }
            const message = (0, prompts_1.buildCodeHintMessage)(questionContext ?? null, questionSource ?? null, transcriptContext ?? null);
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_CODE_HINT_PROMPT : prompts_1.CODE_HINT_PROMPT;
            const fittedMessage = this.llmHelper.fitContextForCurrentModel(message);
            yield* this.llmHelper.streamChat(fittedMessage, imagePaths, undefined, promptOverride);
        }
        catch (error) {
            console.error("[CodeHintLLM] Stream failed:", error);
            yield "I couldn't analyze the screenshot. Make sure your code is visible and try again.";
        }
    }
}
exports.CodeHintLLM = CodeHintLLM;
//# sourceMappingURL=CodeHintLLM.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecapLLM = void 0;
const prompts_1 = require("./prompts");
const tinyPrompts_1 = require("./tinyPrompts");
class RecapLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    /**
     * Generate a neutral conversation summary
     */
    async generate(context) {
        if (!context.trim())
            return "";
        try {
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_RECAP_PROMPT : prompts_1.UNIVERSAL_RECAP_PROMPT;
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            const stream = this.llmHelper.streamChat(fittedContext, undefined, undefined, promptOverride);
            let fullResponse = "";
            for await (const chunk of stream)
                fullResponse += chunk;
            return this.clampRecapResponse(fullResponse);
        }
        catch (error) {
            console.error("[RecapLLM] Generation failed:", error);
            return "";
        }
    }
    /**
     * Generate a neutral conversation summary (Streamed)
     */
    async *generateStream(context) {
        if (!context.trim())
            return;
        try {
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? tinyPrompts_1.TINY_RECAP_PROMPT : prompts_1.UNIVERSAL_RECAP_PROMPT;
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            yield* this.llmHelper.streamChat(fittedContext, undefined, undefined, promptOverride);
        }
        catch (error) {
            console.error("[RecapLLM] Streaming generation failed:", error);
        }
    }
    clampRecapResponse(text) {
        if (!text)
            return "";
        const lines = text.split('\n');
        const isBulletStart = (s) => /^\s*([-*•]|\d+\.)\s+/.test(s);
        const groups = [];
        let cur = null;
        let anyBullet = false;
        for (const raw of lines) {
            const line = raw.trim();
            if (!line)
                continue;
            if (isBulletStart(raw)) {
                anyBullet = true;
                cur = [line];
                groups.push(cur);
            }
            else if (cur) {
                cur.push(line);
            }
            else {
                // Pre-bullet leading lines: treat as standalone groups (used in fallback path).
                groups.push([line]);
            }
        }
        if (!anyBullet) {
            // Fallback: original behavior — first 5 non-empty lines.
            return lines.map(l => l.trim()).filter(Boolean).slice(0, 5).join('\n');
        }
        const bullets = groups.filter(g => isBulletStart(g[0])).slice(0, 5);
        return bullets.map(g => g.join(' ')).join('\n');
    }
}
exports.RecapLLM = RecapLLM;
//# sourceMappingURL=RecapLLM.js.map
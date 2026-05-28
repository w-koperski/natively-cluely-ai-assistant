"use strict";
/**
 * WhatToAnswer Latency Test
 * ==========================
 * Runs real LLM calls with MEASURE_LATENCY=true to capture per-stage timing
 * in the WhatToAnswerLLM pipeline.
 *
 * Run with:
 *   cd /Users/evin/natively-cluely-ai-assistant/electron
 *   MEASURE_LATENCY=true npx tsx test/what-to-answer-latency.test.ts
 *
 * Prerequisites:
 *   - API keys configured via env vars (GROQ_API_KEY, GEMINI_API_KEY, etc.)
 *   - Real LLM calls — expect API costs and ~30s run time
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const path = __importStar(require("path"));
(0, dotenv_1.config)({ path: path.join(__dirname, '..', '..', '.env') });
const LLMHelper_1 = require("../LLMHelper");
const WhatToAnswerLLM_1 = require("../llm/WhatToAnswerLLM");
// ── Test cases ─────────────────────────────────────────────────────────────
const CASES = [
    {
        label: 'Short query (general)',
        transcript: [
            'INTERVIEWER: Hello, how are you today?',
            'USER: I am good, thank you.',
            'INTERVIEWER: What did you do yesterday?',
            'USER: I worked on a project.',
        ].join('\n'),
        question: 'Summarize the conversation.',
    },
    {
        label: 'ERP purchasing process',
        transcript: [
            'INTERVIEWER: Tell me about your purchasing process.',
            'USER: We start with a purchase requisition in Excel.',
            'INTERVIEWER: Who approves it?',
            'USER: The purchasing manager approves anything under five thousand euros.',
            'INTERVIEWER: What happens above that amount?',
            'USER: The CFO needs to sign off, which takes three days.',
        ].join('\n'),
        question: 'What are the key approval thresholds?',
    },
    {
        label: 'Technical distributed systems',
        transcript: [
            'INTERVIEWER: What is Raft consensus?',
            'USER: It is a consensus algorithm for replicated log state.',
            'INTERVIEWER: How does leader election work?',
            'USER: A candidate sends RequestVote RPCs and wins if it gets a quorum.',
            'INTERVIEWER: What is the quorum size?',
            'USER: Majority of nodes — so with five nodes, three are needed.',
        ].join('\n'),
        question: 'Explain the quorum requirement in Raft.',
    },
];
// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
    console.log('═'.repeat(70));
    console.log('WHATTOANSWER LATENCY TEST');
    console.log('═'.repeat(70));
    console.log(`  MEASURE_LATENCY: ${process.env.MEASURE_LATENCY}`);
    console.log(`  Cases: ${CASES.length}`);
    console.log();
    if (process.env.MEASURE_LATENCY !== 'true') {
        console.log('⚠️  Run with MEASURE_LATENCY=true to see per-stage timing.');
        console.log('   Example: MEASURE_LATENCY=true npx tsx test/what-to-answer-latency.test.ts');
        console.log();
    }
    const llm = new LLMHelper_1.LLMHelper(process.env.GEMINI_API_KEY || '', false, undefined, undefined, process.env.GROQ_API_KEY || '', process.env.OPENAI_API_KEY || '', process.env.ANTHROPIC_API_KEY || '');
    const whatToAnswer = new WhatToAnswerLLM_1.WhatToAnswerLLM(llm);
    const results = [];
    for (const tc of CASES) {
        console.log(`─ Running: ${tc.label}`);
        try {
            let fullAnswer = '';
            const stream = await whatToAnswer.generateStream(tc.transcript, undefined, // temporalContext
            undefined, // intentResult
            undefined // imagePaths
            );
            for await (const token of stream) {
                fullAnswer += token;
            }
            const answerLen = fullAnswer.length;
            console.log(`  ✅ Got ${answerLen} chars response`);
            results.push({ label: tc.label, passed: true });
        }
        catch (err) {
            console.log(`  ❌ Error: ${err.message.slice(0, 80)}`);
            results.push({ label: tc.label, passed: false, error: err.message });
        }
        console.log();
    }
    // Summary
    const passed = results.filter(r => r.passed).length;
    console.log('─'.repeat(70));
    console.log(`Results: ${passed}/${CASES.length} cases succeeded`);
    console.log('Check console output above for [LATENCY] per-stage breakdown.');
    console.log('─'.repeat(70));
    process.exit(passed === CASES.length ? 0 : 1);
}
main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
//# sourceMappingURL=what-to-answer-latency.test.js.map
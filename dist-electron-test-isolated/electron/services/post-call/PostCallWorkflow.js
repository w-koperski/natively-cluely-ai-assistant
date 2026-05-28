"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPostCallEnhancements = buildPostCallEnhancements;
exports.extractStructuredActionItems = extractStructuredActionItems;
exports.buildFollowUpDraft = buildFollowUpDraft;
exports.generateCoachingInsights = generateCoachingInsights;
const ACTION_PATTERNS = [
    /\b(?:i|we|you|he|she|they|[A-Z][a-z]+)\s+(?:will|should|need to|needs to|must|can|could)\s+(.+?)(?:\s+(?:by|before|on|after)\s+([^.!?]+))?[.!?]?$/i,
    /\b(?:action|todo|follow up):\s*(.+?)(?:\s+(?:by|before|on|after)\s+([^.!?]+))?[.!?]?$/i,
    /\b(?:send|share|schedule|book|prepare|review|follow up|circle back|introduce|email)\s+(.+?)(?:\s+(?:by|before|on|after)\s+([^.!?]+))?[.!?]?$/i,
];
const OWNER_PATTERN = /\b(I|we|you|he|she|they|[A-Z][a-z]+)\s+(?:will|should|need to|needs to|must|can|could)\b/;
const DEADLINE_PATTERN = /\b(?:by|before|on|after)\s+([^.!?]+)$/i;
function buildPostCallEnhancements(params) {
    const actionItemsStructured = extractStructuredActionItems(params.transcript, params.summaryData?.actionItems ?? []);
    const coachingInsights = generateCoachingInsights(params.transcript, params.modeTemplateType, params.summaryData);
    return {
        schemaVersion: 2,
        actionItemsStructured,
        followUpDraft: buildFollowUpDraft(params.modeTemplateType, actionItemsStructured, params.summaryData),
        coachingInsights,
    };
}
function extractStructuredActionItems(transcript, summaryActionItems = []) {
    const items = [];
    const seen = new Set();
    const addItem = (text, sourceTimestamp, owner, deadline) => {
        const cleaned = normalizeActionText(text);
        if (!cleaned)
            return;
        const key = cleaned.toLowerCase();
        if (seen.has(key))
            return;
        seen.add(key);
        items.push({
            id: `action_${items.length + 1}`,
            text: cleaned,
            ...(owner ? { owner } : {}),
            ...(deadline ? { deadline: deadline.trim() } : {}),
            ...(typeof sourceTimestamp === 'number' ? { sourceTimestamp } : {}),
        });
    };
    for (const segment of transcript) {
        const text = segment.text.trim();
        if (!text)
            continue;
        for (const pattern of ACTION_PATTERNS) {
            const match = text.match(pattern);
            if (!match)
                continue;
            const owner = text.match(OWNER_PATTERN)?.[1];
            const deadline = match[2] ?? text.match(DEADLINE_PATTERN)?.[1];
            addItem(match[1] ?? text, segment.timestamp, normalizeOwner(owner), deadline);
            break;
        }
    }
    for (const item of summaryActionItems) {
        addItem(item);
    }
    return items.slice(0, 8);
}
function buildFollowUpDraft(modeTemplateType, actionItems, summaryData) {
    const greeting = modeTemplateType === 'sales' || modeTemplateType === 'recruiting'
        ? 'Hi,'
        : 'Hi team,';
    const lines = [greeting, '', 'Thanks for the conversation today.'];
    if (summaryData?.overview) {
        lines.push('', summaryData.overview.trim());
    }
    const nextSteps = actionItems.map(item => {
        const owner = item.owner ? `${item.owner}: ` : '';
        const deadline = item.deadline ? ` by ${item.deadline}` : '';
        return `- ${owner}${item.text}${deadline}`;
    });
    if (nextSteps.length > 0) {
        lines.push('', 'Next steps:', ...nextSteps);
    }
    if (nextSteps.length === 0) {
        lines.push('', 'I will follow up if anything else is needed.');
    }
    lines.push('', 'Best,');
    return lines.join('\n');
}
function generateCoachingInsights(transcript, modeTemplateType, summaryData) {
    const text = transcript.map(segment => segment.text).join('\n');
    const insights = [];
    const add = (type, title, detail, severity, evidence) => {
        insights.push({ id: `coach_${insights.length + 1}`, type, title, detail, severity, ...(evidence ? { evidence } : {}) });
    };
    if (modeTemplateType === 'sales') {
        const hasObjection = /\b(price|pricing|cost|expensive|competitor|budget|too much|not sure)\b/i.test(text);
        const hasNextStep = /\b(next step|follow up|send|schedule|pilot|trial|contract|proposal)\b/i.test(text);
        if (hasObjection && !sectionHasContent(summaryData, 'Objections')) {
            add('missed_objection', 'Objection may need a clearer note', 'The conversation included objection language, but the objection section is empty.', 'opportunity', firstMatch(text, /[^.!?]*(?:price|pricing|cost|expensive|competitor|budget|too much|not sure)[^.!?]*/i));
        }
        if (!hasNextStep) {
            add('missing_next_step', 'Next step was not explicit', 'Consider ending sales calls with a concrete owner and follow-up date.', 'opportunity');
        }
    }
    else if (modeTemplateType === 'recruiting') {
        if (!/\b(compensation|salary|timeline|notice period|availability|start date)\b/i.test(text)) {
            add('missing_logistics', 'Recruiting logistics not captured', 'Consider confirming compensation, timing, and availability before closing the screen.', 'opportunity');
        }
    }
    else if (modeTemplateType === 'looking-for-work' || modeTemplateType === 'technical-interview') {
        if (/\b(i don'?t know|not sure|maybe|i think)\b/i.test(text)) {
            add('uncertainty_pattern', 'Uncertainty appeared in answers', 'Review these moments and prepare a tighter explanation or fallback answer.', 'info', firstMatch(text, /[^.!?]*(?:i don'?t know|not sure|maybe|i think)[^.!?]*/i));
        }
    }
    else if (modeTemplateType === 'team-meet') {
        if (!/\b(owner|by|deadline|due|next step|action item)\b/i.test(text)) {
            add('missing_ownership', 'Ownership may be unclear', 'Team meetings are more useful when decisions include owners and dates.', 'opportunity');
        }
    }
    else if (modeTemplateType === 'lecture') {
        if (/\b(homework|assignment|read|chapter|due|exam|quiz)\b/i.test(text)) {
            add('study_follow_up', 'Study follow-up detected', 'Add the assignment or study item to follow-up work so it is not missed.', 'info', firstMatch(text, /[^.!?]*(?:homework|assignment|read|chapter|due|exam|quiz)[^.!?]*/i));
        }
    }
    return insights.slice(0, 5);
}
function normalizeActionText(value) {
    return value
        .replace(/^\s*(?:action|todo|follow up):\s*/i, '')
        .replace(/\s+/g, ' ')
        .replace(/[.!?]+$/, '')
        .trim();
}
function normalizeOwner(owner) {
    if (!owner)
        return undefined;
    const normalized = owner.trim();
    if (/^i$/i.test(normalized))
        return 'Me';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
function sectionHasContent(summaryData, title) {
    return Boolean(summaryData?.sections?.some(section => section.title.toLowerCase() === title.toLowerCase() && section.bullets.length > 0));
}
function firstMatch(text, pattern) {
    return text.match(pattern)?.[0]?.trim();
}
//# sourceMappingURL=PostCallWorkflow.js.map
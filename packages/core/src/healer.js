"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelfHealingEngine = void 0;
const HEAL_SYSTEM = `You are TestPilot's self-healing engine. A UI test step failed because an element could not be found.

Your job is to suggest an alternative way to find the same element based on the current page structure.

Return ONLY valid JSON (no markdown):
{
  "healedTarget": "the alternative selector or label to use",
  "confidence": 0.85,
  "reasoning": "brief explanation of why this alternative should work"
}

confidence: 0.0 = not sure, 1.0 = very confident`;
class SelfHealingEngine {
    llm;
    constructor(llm) {
        this.llm = llm;
    }
    /**
     * Attempt to find an alternative selector when the original fails.
     * Returns the healed step or null if healing couldn't be determined.
     */
    async heal(failedStep, pageContent, // current page HTML or accessibility tree text
    error) {
        const prompt = buildHealPrompt(failedStep, pageContent, error);
        try {
            console.log(`  🔧 Self-healing: trying to find alternative for "${failedStep.target}"...`);
            const response = await this.llm.reason(prompt, HEAL_SYSTEM);
            const result = parseHealResponse(response.text);
            if (!result || result.confidence < 0.5) {
                console.log('  ⚠️  Self-healing: confidence too low, skipping');
                return null;
            }
            const healedStep = {
                ...failedStep,
                target: result.healedTarget,
            };
            console.log(`  ✅ Self-healing: using "${result.healedTarget}" (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
            return { healedStep, reasoning: result.reasoning };
        }
        catch (err) {
            console.log(`  ⚠️  Self-healing failed: ${err}`);
            return null;
        }
    }
}
exports.SelfHealingEngine = SelfHealingEngine;
function buildHealPrompt(step, pageContent, error) {
    return `Failed test step:
Action: ${step.action}
Original target: "${step.target}"
Error: ${error}

Current page structure (truncated to 3000 chars):
${pageContent.slice(0, 3000)}

Find an alternative target for the same element.`;
}
function parseHealResponse(text) {
    const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            }
            catch {
                return null;
            }
        }
        return null;
    }
}

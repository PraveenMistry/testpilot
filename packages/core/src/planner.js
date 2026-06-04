"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestPlanner = void 0;
const uuid_1 = require("uuid");
const PLANNER_SYSTEM = `You are TestPilot's test planner. Your job is to convert a natural language testing goal into a structured, executable test plan as JSON.

Rules:
- Return ONLY valid JSON — no markdown, no explanation, no backticks
- Use semantic targets (visible labels, button text, aria labels) NOT CSS selectors
- Keep steps minimal and focused — only what's needed to achieve the goal
- Every plan must end with a screenshot_matches_baseline assertion
- Supported actions: navigate, click, type, scroll, wait, assert, screenshot
- Supported assertTypes: screen_contains, screen_not_contains, url_equals, url_contains, screenshot_matches_baseline, element_visible, element_not_visible

Return this exact JSON shape:
{
  "name": "short descriptive name",
  "steps": [
    {
      "id": "step-1",
      "action": "navigate",
      "target": "https://example.com",
      "description": "Open the app"
    },
    {
      "id": "step-2", 
      "action": "click",
      "target": "Sign in button",
      "description": "Click the sign in button"
    },
    {
      "id": "step-3",
      "action": "type",
      "target": "Email input",
      "value": "test@example.com",
      "description": "Enter email address"
    },
    {
      "id": "step-4",
      "action": "assert",
      "assertType": "screen_contains",
      "value": "Welcome",
      "description": "Verify welcome message is visible"
    },
    {
      "id": "step-5",
      "action": "assert",
      "assertType": "screenshot_matches_baseline",
      "description": "Visual regression check"
    }
  ]
}`;
class TestPlanner {
    llm;
    constructor(llm) {
        this.llm = llm;
    }
    async generate(goal, baseUrl, platforms = ['web'], context) {
        const prompt = buildPlannerPrompt(goal, baseUrl, context);
        console.log('  🧠 Planning test steps...');
        const response = await this.llm.plan(prompt, PLANNER_SYSTEM);
        const parsed = parseJsonResponse(response.text);
        const plan = {
            id: (0, uuid_1.v4)(),
            name: parsed.name || goal.slice(0, 60),
            goal,
            platforms,
            steps: normaliseSteps(parsed.steps || []),
            generatedAt: new Date().toISOString(),
            modelUsed: this.llm.capabilities().model,
        };
        console.log(`  ✅ Generated ${plan.steps.length} steps: ${plan.name}`);
        return plan;
    }
}
exports.TestPlanner = TestPlanner;
// ── Helpers ───────────────────────────────────
function buildPlannerPrompt(goal, baseUrl, context) {
    let prompt = `App base URL: ${baseUrl}\n\nTesting goal: ${goal}`;
    if (context)
        prompt += `\n\nAdditional context:\n${context}`;
    return prompt;
}
function parseJsonResponse(text) {
    // Strip markdown code fences if model included them despite instructions
    const cleaned = text
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        // Try to extract JSON object from the text
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            }
            catch {
                throw new Error(`Planner returned invalid JSON.\nRaw response:\n${text.slice(0, 500)}`);
            }
        }
        throw new Error(`Planner returned no JSON.\nRaw response:\n${text.slice(0, 500)}`);
    }
}
function normaliseSteps(steps) {
    return steps.map((s, i) => ({
        id: s.id || `step-${i + 1}`,
        action: s.action,
        target: s.target,
        value: s.value,
        assertType: s.assertType,
        optional: s.optional ?? false,
        screenshotAfter: s.screenshotAfter ?? true,
        description: s.description || `Step ${i + 1}`,
    }));
}

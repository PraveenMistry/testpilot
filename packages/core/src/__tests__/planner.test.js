"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const planner_1 = require("../planner");
(0, vitest_1.describe)('TestPlanner', () => {
    (0, vitest_1.it)('should generate a structured test plan from a goal', async () => {
        const mockLLM = {
            plan: vitest_1.vi.fn().mockResolvedValue({
                text: JSON.stringify({
                    name: 'Test Goal',
                    steps: [
                        { id: '1', action: 'navigate', target: 'https://example.com', description: 'Open app' },
                        { id: '2', action: 'assert', assertType: 'screen_contains', value: 'Welcome', description: 'Check welcome' }
                    ]
                }),
                usage: { inputTokens: 100, outputTokens: 50, estimatedUsd: 0.01 }
            }),
            reason: vitest_1.vi.fn(),
            vision: vitest_1.vi.fn(),
            capabilities: vitest_1.vi.fn().mockReturnValue({ model: 'mock-model' })
        };
        const planner = new planner_1.TestPlanner(mockLLM);
        const plan = await planner.generate('user can log in', 'https://example.com');
        (0, vitest_1.expect)(plan.name).toBe('Test Goal');
        (0, vitest_1.expect)(plan.steps).toHaveLength(2);
        (0, vitest_1.expect)(plan.steps[0].action).toBe('navigate');
        (0, vitest_1.expect)(plan.steps[1].assertType).toBe('screen_contains');
    });
    (0, vitest_1.it)('should handle markdown code fences in LLM response', async () => {
        const mockLLM = {
            plan: vitest_1.vi.fn().mockResolvedValue({
                text: '```json\n{"name": "Fenced Plan", "steps": []}\n```',
                usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }
            }),
            reason: vitest_1.vi.fn(),
            vision: vitest_1.vi.fn(),
            capabilities: vitest_1.vi.fn().mockReturnValue({ model: 'mock-model' })
        };
        const planner = new planner_1.TestPlanner(mockLLM);
        const plan = await planner.generate('goal', 'https://example.com');
        (0, vitest_1.expect)(plan.name).toBe('Fenced Plan');
    });
});

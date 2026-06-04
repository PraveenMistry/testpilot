import { describe, it, expect, vi } from 'vitest';
import { TestPlanner } from '../planner';
import { LLMInterface } from '../types';

describe('TestPlanner', () => {
  it('should generate a structured test plan from a goal', async () => {
    const mockLLM: LLMInterface = {
      plan: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          name: 'Test Goal',
          steps: [
            { id: '1', action: 'navigate', target: 'https://example.com', description: 'Open app' },
            { id: '2', action: 'assert', assertType: 'screen_contains', value: 'Welcome', description: 'Check welcome' }
          ]
        }),
        usage: { inputTokens: 100, outputTokens: 50, estimatedUsd: 0.01 }
      }),
      reason: vi.fn(),
      vision: vi.fn(),
      capabilities: vi.fn().mockReturnValue({ model: 'mock-model' })
    };

    const planner = new TestPlanner(mockLLM);
    const plan = await planner.generate('user can log in', 'https://example.com');

    expect(plan.name).toBe('Test Goal');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].action).toBe('navigate');
    expect(plan.steps[1].assertType).toBe('screen_contains');
  });

  it('should handle markdown code fences in LLM response', async () => {
    const mockLLM: LLMInterface = {
      plan: vi.fn().mockResolvedValue({
        text: '```json\n{"name": "Fenced Plan", "steps": []}\n```',
        usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }
      }),
      reason: vi.fn(),
      vision: vi.fn(),
      capabilities: vi.fn().mockReturnValue({ model: 'mock-model' })
    };

    const planner = new TestPlanner(mockLLM);
    const plan = await planner.generate('goal', 'https://example.com');

    expect(plan.name).toBe('Fenced Plan');
  });
});

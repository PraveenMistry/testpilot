// ─────────────────────────────────────────────
// TestPilot Core Types
// ─────────────────────────────────────────────

export type Platform = 'web' | 'android' | 'ios';
export type StepAction = 'navigate' | 'tap' | 'click' | 'type' | 'scroll' | 'wait' | 'assert' | 'screenshot';
export type AssertType = 'screen_contains' | 'screen_not_contains' | 'url_equals' | 'url_contains' | 'screenshot_matches_baseline' | 'element_visible' | 'element_not_visible';
export type RunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error';
export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'healed';
export type ModelProvider = 'gemini' | 'claude' | 'openai' | 'deepseek' | 'ollama' | 'custom';

// ── Test Plan ─────────────────────────────────

export interface TestStep {
  id: string;
  action: StepAction;
  target?: string;          // element label, selector, or URL
  value?: string;           // text to type, assertion value
  assertType?: AssertType;
  optional?: boolean;
  screenshotAfter?: boolean;
  description?: string;     // human-readable description of this step
}

export interface TestPlan {
  id: string;
  name: string;
  goal: string;             // original natural-language description
  platforms: Platform[];
  steps: TestStep[];
  generatedAt: string;
  modelUsed: string;
}

// ── Test Run ──────────────────────────────────

export interface StepResult {
  stepId: string;
  status: StepStatus;
  duration: number;         // ms
  screenshotPath?: string;
  error?: string;
  healedSelector?: string;  // if self-healing was applied
}

export interface PlatformResult {
  platform: Platform;
  status: RunStatus;
  duration: number;
  steps: StepResult[];
  screenshotPaths: string[];
  error?: string;
}

export interface VisualAnalysis {
  passed: boolean;
  diffScore: number;        // 0-1, where 0 = identical
  description: string;      // AI description of what changed
  isBaseline: boolean;      // true if this was the first run (baseline set)
  baselinePath?: string;
  currentPath?: string;
  diffPath?: string;
  method: 'ai_vision' | 'pixel_diff'; // which method was used
}

export interface TestRun {
  id: string;
  planId: string;
  planName: string;
  goal: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  platforms: PlatformResult[];
  visualAnalysis?: VisualAnalysis;
  modelUsed: string;
  cost?: RunCost;
}

export interface RunCost {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  provider: ModelProvider;
}

// ── Config ────────────────────────────────────

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ProjectConfig {
  project: {
    name: string;
    baseUrl: string;
  };
  ai: ModelConfig & {
    plannerModel?: ModelConfig;
    visionModel?: ModelConfig;
  };
  execution: {
    timeout: number;
    screenshotOnEveryStep: boolean;
    headless: boolean;
    viewport: { width: number; height: number };
  };
  reporting: {
    outputDir: string;
    baseline: { autoApproveFirst: boolean };
    notifications: { slack?: string; email?: string };
  };
  platforms: Platform[];
}

// ── LLM Interface ─────────────────────────────

export interface ModelCapabilities {
  hasVision: boolean;
  maxContextTokens: number;
  provider: ModelProvider;
  model: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

export interface LLMResponse {
  text: string;
  usage: LLMUsage;
}

export interface LLMInterface {
  plan(prompt: string, context?: string): Promise<LLMResponse>;
  reason(prompt: string, context?: string): Promise<LLMResponse>;
  vision(imageBuffer: Buffer, prompt: string): Promise<LLMResponse>;
  capabilities(): ModelCapabilities;
}

// ── VCS & CI/CD ───────────────────────────────

export type CommitStatus = 'pending' | 'success' | 'failure' | 'error';

export interface FileDiff {
  path: string;
  hunks: string[];
}

export interface VCSAdapter {
  getDiff(prId: string): Promise<FileDiff[]>;
  postComment(prId: string, body: string): Promise<void>;
  postStatus(commitSha: string, status: CommitStatus, targetUrl?: string): Promise<void>;
}

// ── Notifications ─────────────────────────────

export interface NotificationDispatcher {
  send(run: TestRun): Promise<void>;
}

// ── Storage & Artifacts ───────────────────────

export interface RunStore {
  saveRun(run: TestRun): Promise<void>;
  getRun(runId: string): Promise<TestRun | null>;
  listRuns(limit?: number): Promise<TestRun[]>;
  savePlan(plan: TestPlan): Promise<void>;
  getPlan(planId: string): Promise<TestPlan | null>;
  getBaselinePath(planId: string, platform: string): string;
}

export interface ArtifactStore {
  upload(runId: string, filePath: string, platform: string): Promise<string>;
  download(path: string): Promise<Buffer>;
}

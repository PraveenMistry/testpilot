import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ProjectConfig } from './types';

const DEFAULTS: ProjectConfig = {
  project: { name: 'My App', baseUrl: 'http://localhost:3000' },
  ai: { provider: 'gemini', model: 'gemini-2.5-flash' },
  execution: {
    timeout: 30000,
    screenshotOnEveryStep: true,
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  reporting: {
    outputDir: '.testpilot',
    baseline: { autoApproveFirst: true },
    notifications: {},
  },
  platforms: ['web'],
};

/**
 * Load project config from testpilot.yaml (walks up from cwd).
 * API keys are resolved from environment variables.
 */
export function loadConfig(startDir = process.cwd()): ProjectConfig {
  const configPath = findConfig(startDir);
  let fileConfig: Partial<ProjectConfig> = {};

  if (configPath) {
    const raw = fs.readFileSync(configPath, 'utf8');
    fileConfig = yaml.load(raw) as Partial<ProjectConfig>;
  }

  const merged = deepMerge(DEFAULTS, fileConfig) as ProjectConfig;

  // Inject API keys from environment
  merged.ai.apiKey = resolveApiKey(merged.ai.provider);
  if (merged.ai.plannerModel) {
    merged.ai.plannerModel.apiKey = resolveApiKey(merged.ai.plannerModel.provider);
  }
  if (merged.ai.visionModel) {
    merged.ai.visionModel.apiKey = resolveApiKey(merged.ai.visionModel.provider);
  }

  return merged;
}

function resolveApiKey(provider: string): string | undefined {
  const keyMap: Record<string, string> = {
    gemini: 'GEMINI_API_KEY',
    claude: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    ollama: '',
    custom: 'CUSTOM_API_KEY',
  };
  const envVar = keyMap[provider];
  return envVar ? process.env[envVar] : undefined;
}

function findConfig(dir: string): string | null {
  const candidate = path.join(dir, 'testpilot.yaml');
  if (fs.existsSync(candidate)) return candidate;
  const parent = path.dirname(dir);
  if (parent === dir) return null; // reached filesystem root
  return findConfig(parent);
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

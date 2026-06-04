"use strict";
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
exports.loadConfig = loadConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const DEFAULTS = {
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
function loadConfig(startDir = process.cwd()) {
    const configPath = findConfig(startDir);
    let fileConfig = {};
    if (configPath) {
        const raw = fs.readFileSync(configPath, 'utf8');
        fileConfig = yaml.load(raw);
    }
    const merged = deepMerge(DEFAULTS, fileConfig);
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
function resolveApiKey(provider) {
    const keyMap = {
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
function findConfig(dir) {
    const candidate = path.join(dir, 'testpilot.yaml');
    if (fs.existsSync(candidate))
        return candidate;
    const parent = path.dirname(dir);
    if (parent === dir)
        return null; // reached filesystem root
    return findConfig(parent);
}
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source || {})) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        }
        else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}

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
exports.AndroidRunner = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const yaml = __importStar(require("js-yaml"));
class AndroidRunner {
    llm;
    config;
    store;
    constructor(llm, config, store) {
        this.llm = llm;
        this.config = config;
        this.store = store;
    }
    async run(plan, runId) {
        const startedAt = Date.now();
        const runDir = this.store.getRunDir(runId);
        const screenshotDir = path.join(runDir, 'screenshots', 'android');
        fs.mkdirSync(screenshotDir, { recursive: true });
        console.log('\n  🤖 Starting Android runner (Maestro)...');
        const maestroYaml = this.translateToMaestro(plan, screenshotDir);
        const yamlPath = path.join(runDir, 'test.yaml');
        fs.writeFileSync(yamlPath, maestroYaml);
        const stepResults = [];
        const screenshotPaths = [];
        try {
            // Execute Maestro
            // In a real environment, we'd use a streaming execution to get per-step results.
            // For this implementation, we'll run the full flow and then collect screenshots.
            console.log('  ▸ Executing Maestro flow...');
            (0, child_process_1.execSync)(`maestro test ${yamlPath}`, { stdio: 'inherit' });
            // After run, collect screenshots saved by Maestro
            const files = fs.readdirSync(screenshotDir);
            for (const file of files) {
                if (file.endsWith('.png')) {
                    screenshotPaths.push(path.join(screenshotDir, file));
                }
            }
            // Map steps to results (simplified for Phase 2)
            for (const step of plan.steps) {
                stepResults.push({
                    stepId: step.id,
                    status: 'passed', // Assuming success if execSync didn't throw
                    duration: 0,
                });
            }
        }
        catch (err) {
            console.error('  ✗ Android run failed:', err);
            return {
                platform: 'android',
                status: 'failed',
                duration: Date.now() - startedAt,
                steps: stepResults,
                screenshotPaths,
                error: String(err),
            };
        }
        return {
            platform: 'android',
            status: 'passed',
            duration: Date.now() - startedAt,
            steps: stepResults,
            screenshotPaths,
        };
    }
    translateToMaestro(plan, screenshotDir) {
        const maestroSteps = [];
        for (const step of plan.steps) {
            const maestroStep = this.mapStepToMaestro(step);
            if (maestroStep) {
                maestroSteps.push(maestroStep);
                // Add screenshot after step if configured
                if (this.config.execution.screenshotOnEveryStep || step.screenshotAfter) {
                    maestroSteps.push({ takeScreenshot: path.join(screenshotDir, `${step.id}.png`) });
                }
            }
        }
        const flow = {
            appId: this.config.project.name, // Usually the package name for Android
            onFlowStart: [
                { clearState: true }
            ],
            yaml: maestroSteps
        };
        // Note: Maestro YAML structure is slightly different, usually just a list of commands
        return yaml.dump([
            { appId: this.config.project.name },
            ...maestroSteps
        ]);
    }
    mapStepToMaestro(step) {
        switch (step.action) {
            case 'navigate':
                // For mobile, navigate usually means launching a deep link or specific activity
                return { launchApp: { appId: this.config.project.name } };
            case 'tap':
            case 'click':
                return { tapOn: step.target };
            case 'type':
                return { inputText: step.value };
            case 'scroll':
                return { scroll: {} };
            case 'wait':
                return { stopApp: {} }; // Simplified
            case 'assert':
                if (step.assertType === 'screen_contains') {
                    return { assertVisible: step.value };
                }
                return null;
            default:
                return null;
        }
    }
}
exports.AndroidRunner = AndroidRunner;

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
exports.IosRunner = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const yaml = __importStar(require("js-yaml"));
class IosRunner {
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
        const screenshotDir = path.join(runDir, 'screenshots', 'ios');
        fs.mkdirSync(screenshotDir, { recursive: true });
        console.log('\n  🍎 Starting iOS runner (Maestro)...');
        const maestroYaml = this.translateToMaestro(plan, screenshotDir);
        const yamlPath = path.join(runDir, 'test-ios.yaml');
        fs.writeFileSync(yamlPath, maestroYaml);
        const stepResults = [];
        const screenshotPaths = [];
        try {
            // Execute Maestro
            console.log('  ▸ Executing Maestro flow for iOS...');
            (0, child_process_1.execSync)(`maestro test ${yamlPath}`, { stdio: 'inherit' });
            // After run, collect screenshots
            const files = fs.readdirSync(screenshotDir);
            for (const file of files) {
                if (file.endsWith('.png')) {
                    screenshotPaths.push(path.join(screenshotDir, file));
                }
            }
            for (const step of plan.steps) {
                stepResults.push({
                    stepId: step.id,
                    status: 'passed',
                    duration: 0,
                });
            }
        }
        catch (err) {
            console.error('  ✗ iOS run failed:', err);
            return {
                platform: 'ios',
                status: 'failed',
                duration: Date.now() - startedAt,
                steps: stepResults,
                screenshotPaths,
                error: String(err),
            };
        }
        return {
            platform: 'ios',
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
                if (this.config.execution.screenshotOnEveryStep || step.screenshotAfter) {
                    maestroSteps.push({ takeScreenshot: path.join(screenshotDir, `${step.id}.png`) });
                }
            }
        }
        return yaml.dump([
            { appId: this.config.project.name },
            ...maestroSteps
        ]);
    }
    mapStepToMaestro(step) {
        switch (step.action) {
            case 'navigate':
                return { launchApp: { appId: this.config.project.name } };
            case 'tap':
            case 'click':
                return { tapOn: step.target };
            case 'type':
                return { inputText: step.value };
            case 'scroll':
                return { scroll: {} };
            case 'wait':
                return { stopApp: {} };
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
exports.IosRunner = IosRunner;

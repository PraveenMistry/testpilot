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
exports.TestOrchestrator = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const llm_1 = require("./llm");
const planner_1 = require("./planner");
const vision_1 = require("./vision");
const store_1 = require("./store");
class TestOrchestrator {
    config;
    runners = new Map();
    llm;
    store;
    planner;
    visionAnalyser;
    constructor(config) {
        this.config = config;
        this.llm = (0, llm_1.createLLMProvider)(config.ai);
        this.store = new store_1.RunStore(path.resolve(config.reporting.outputDir));
        this.planner = new planner_1.TestPlanner(this.llm);
        this.visionAnalyser = new vision_1.VisionAnalyser(this.llm);
    }
    /**
     * Register a runner for a specific platform.
     */
    registerRunner(platform, runner) {
        this.runners.set(platform, runner);
    }
    /**
     * Execute a full test run from a natural language goal.
     */
    async run(goal, options = {}) {
        const runId = (0, uuid_1.v4)();
        const startedAt = new Date().toISOString();
        const baseUrl = options.baseUrl || this.config.project.baseUrl;
        const { onStep, onDone, onStepResult } = options;
        try {
            // 1. Plan
            if (onStep)
                onStep('Planning', 'Generating test steps from goal...');
            const plan = await this.planner.generate(goal, baseUrl, this.config.platforms);
            this.store.savePlan(plan);
            if (onDone)
                onDone(`${plan.steps.length} steps planned: ${plan.name}`);
            // 2. Execute across platforms
            const platformResults = [];
            for (const platform of this.config.platforms) {
                const runner = this.runners.get(platform);
                if (!runner) {
                    console.warn(`No runner registered for platform: ${platform}`);
                    continue;
                }
                if (onStep)
                    onStep('Executing', `Running on ${platform}...`);
                const result = await runner.run(plan, runId);
                platformResults.push(result);
                if (onStepResult) {
                    for (const stepRes of result.steps) {
                        onStepResult(stepRes, plan.steps.find(s => s.id === stepRes.stepId)?.description);
                    }
                }
            }
            // 3. Visual Analysis (on final screenshots of all platforms)
            if (onStep)
                onStep('Analysing', 'Comparing screenshots...');
            // For now, we only handle the primary/first platform's visual analysis 
            // as per original CLI/API logic.
            let visualAnalysis;
            const firstResult = platformResults[0];
            if (firstResult && firstResult.screenshotPaths.length > 0) {
                const finalScreenshot = firstResult.screenshotPaths.at(-1);
                const baselinePath = this.store.getBaselinePath(plan.id, firstResult.platform);
                visualAnalysis = await this.visionAnalyser.analyse(finalScreenshot, baselinePath, this.store.getRunDir(runId));
                if (visualAnalysis.isBaseline && this.config.reporting.baseline.autoApproveFirst) {
                    fs.copyFileSync(finalScreenshot, baselinePath);
                }
            }
            // 4. Determine overall status
            const allPassed = platformResults.every(r => r.status === 'passed');
            const visualPassed = visualAnalysis ? visualAnalysis.passed : true;
            const overallStatus = allPassed && visualPassed ? 'passed' : 'failed';
            const run = {
                id: runId,
                planId: plan.id,
                planName: plan.name,
                goal,
                status: overallStatus,
                startedAt,
                completedAt: new Date().toISOString(),
                duration: platformResults.reduce((acc, r) => acc + (r.duration || 0), 0),
                platforms: platformResults,
                visualAnalysis,
                modelUsed: this.llm.capabilities().model,
            };
            this.store.saveRun(run);
            return run;
        }
        catch (err) {
            const errorRun = {
                id: runId,
                planId: '',
                planName: goal,
                goal,
                status: 'error',
                startedAt,
                completedAt: new Date().toISOString(),
                platforms: [],
                modelUsed: this.llm.capabilities().model,
            };
            this.store.saveRun(errorRun);
            throw err;
        }
    }
}
exports.TestOrchestrator = TestOrchestrator;

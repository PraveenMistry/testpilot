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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const core_1 = require("@testpilot/core");
const web_runner_1 = require("@testpilot/web-runner");
const android_runner_1 = require("@testpilot/android-runner");
const ios_runner_1 = require("@testpilot/ios-runner");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || 3001;
// ── Run a test ────────────────────────────────
app.post('/api/run', async (req, res) => {
    const { goal, baseUrl, configDir } = req.body;
    if (!goal)
        return res.status(400).json({ error: 'goal is required' });
    const config = (0, core_1.loadConfig)(configDir || process.cwd());
    const orchestrator = new TestOrchestrator(config);
    // Register runners
    orchestrator.registerRunner('web', new web_runner_1.WebRunner(orchestrator.llm, config, orchestrator.store));
    orchestrator.registerRunner('android', new android_runner_1.AndroidRunner(orchestrator.llm, config, orchestrator.store));
    orchestrator.registerRunner('ios', new ios_runner_1.IosRunner(orchestrator.llm, config, orchestrator.store));
    const runId = (0, uuid_1.v4)();
    const effectiveBaseUrl = baseUrl || config.project.baseUrl;
    // Kick off async — respond immediately with run ID
    res.json({ runId, status: 'running', message: 'Test run started' });
    // Execute in background
    orchestrator.run(goal, { baseUrl: effectiveBaseUrl }).catch((err) => console.error('Run error:', err));
});
// ── Get run status/result ─────────────────────
app.get('/api/run/:runId', (req, res) => {
    const config = (0, core_1.loadConfig)(process.cwd());
    const store = new core_1.RunStore(path.resolve(config.reporting.outputDir));
    const run = store.getRun(req.params.runId);
    if (!run)
        return res.status(404).json({ error: 'Run not found' });
    res.json(run);
});
// ── List recent runs ──────────────────────────
app.get('/api/runs', (req, res) => {
    const config = (0, core_1.loadConfig)(process.cwd());
    const store = new core_1.RunStore(path.resolve(config.reporting.outputDir));
    const runs = store.listRuns(20);
    res.json(runs);
});
// ── Health check ──────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
});
app.listen(PORT, () => {
    console.log(`\n🚀 TestPilot API running at http://localhost:${PORT}`);
    console.log(`   POST /api/run     — start a test`);
    console.log(`   GET  /api/run/:id — get run result`);
    console.log(`   GET  /api/runs    — list recent runs\n`);
});

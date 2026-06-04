#!/usr/bin/env node
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
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const core_1 = require("@testpilot/core");
const web_runner_1 = require("@testpilot/web-runner");
const android_runner_1 = require("@testpilot/android-runner");
const ios_runner_1 = require("@testpilot/ios-runner");
const program = new commander_1.Command();
program
    .name('testpilot')
    .description('AI-powered cross-platform QA automation')
    .version('0.1.0');
// ── testpilot test "goal" ─────────────────────
program
    .command('test <goal>')
    .description('Run a test described in natural language')
    .option('-u, --url <url>', 'Override the base URL from config')
    .option('--headed', 'Run browser in headed mode (visible window)')
    .option('--model <provider>', 'Override AI model provider (gemini|claude|openai|deepseek|ollama)')
    .action(async (goal, options) => {
    printBanner();
    const config = (0, core_1.loadConfig)(process.cwd());
    if (options.url)
        config.project.baseUrl = options.url;
    if (options.headed)
        config.execution.headless = false;
    if (options.model)
        config.ai.provider = options.model;
    // Validate API key before starting
    const keyCheck = checkApiKey(config.ai.provider);
    if (keyCheck) {
        console.error(chalk_1.default.red('\n✗ ' + keyCheck));
        process.exit(1);
    }
    const orchestrator = new core_1.TestOrchestrator(config);
    // Register runners
    orchestrator.registerRunner('web', new web_runner_1.WebRunner(orchestrator.llm, config, orchestrator.store));
    orchestrator.registerRunner('android', new android_runner_1.AndroidRunner(orchestrator.llm, config, orchestrator.store));
    orchestrator.registerRunner('ios', new ios_runner_1.IosRunner(orchestrator.llm, config, orchestrator.store));
    const caps = orchestrator.llm.capabilities();
    console.log(chalk_1.default.dim('━'.repeat(56)));
    console.log(chalk_1.default.bold('  Goal:    ') + chalk_1.default.white(goal));
    console.log(chalk_1.default.bold('  URL:     ') + chalk_1.default.cyan(config.project.baseUrl));
    console.log(chalk_1.default.bold('  Model:   ') + chalk_1.default.magenta(`${caps.provider} / ${caps.model}`));
    console.log(chalk_1.default.bold('  Vision:  ') + (caps.hasVision ? chalk_1.default.green('enabled') : chalk_1.default.yellow('disabled — using pixel diff')));
    console.log(chalk_1.default.dim('━'.repeat(56)) + '\n');
    try {
        const run = await orchestrator.run(goal, {
            baseUrl: options.url,
            onStep: (label, message) => printStep(label, message),
            onDone: (message) => printDone(message),
            onStepResult: (res, desc) => printStepResult(res, desc),
        });
        // Final summary
        printSummary(run, path.resolve(config.reporting.outputDir));
    }
    catch (err) {
        console.error(chalk_1.default.red('\n✗ Error: ') + err.message);
        if (err.message.includes('API_KEY') || err.message.includes('api key')) {
            console.log(chalk_1.default.dim('\nTip: Set your API key in .env or as an environment variable.'));
            console.log(chalk_1.default.dim('     See README.md for setup instructions.\n'));
        }
        process.exit(1);
    }
});
// ── testpilot runs ────────────────────────────
program
    .command('runs')
    .description('List recent test runs')
    .option('-n, --limit <n>', 'Number of runs to show', '10')
    .action(async (options) => {
    const config = (0, core_1.loadConfig)(process.cwd());
    const store = new core_1.RunStore(path.resolve(config.reporting.outputDir));
    const runs = await store.listRuns(parseInt(options.limit));
    if (runs.length === 0) {
        console.log(chalk_1.default.dim('\nNo test runs yet. Run: testpilot test "your goal"\n'));
        return;
    }
    console.log('');
    console.log(chalk_1.default.bold('  Recent test runs'));
    console.log(chalk_1.default.dim('  ' + '─'.repeat(72)));
    console.log(chalk_1.default.dim('  ' + 'STATUS'.padEnd(10) + 'GOAL'.padEnd(40) + 'DURATION'.padEnd(12) + 'RUN ID'));
    console.log(chalk_1.default.dim('  ' + '─'.repeat(72)));
    for (const run of runs) {
        const statusStr = run.status === 'passed'
            ? chalk_1.default.green('✓ passed')
            : run.status === 'failed'
                ? chalk_1.default.red('✗ failed')
                : chalk_1.default.yellow('⚠ ' + run.status);
        const duration = run.duration ? `${(run.duration / 1000).toFixed(1)}s` : '—';
        const goal = run.goal.slice(0, 38).padEnd(40);
        console.log(`  ${statusStr.padEnd(18)} ${goal} ${duration.padEnd(12)} ${chalk_1.default.dim(run.id.slice(0, 8))}`);
    }
    console.log('');
});
// ── testpilot show <runId> ────────────────────
program
    .command('show <runId>')
    .description('Show details of a specific run')
    .action(async (runId) => {
    const config = (0, core_1.loadConfig)(process.cwd());
    const store = new core_1.RunStore(path.resolve(config.reporting.outputDir));
    // Support partial IDs
    const runs = await store.listRuns(100);
    const run = runs.find((r) => r.id.startsWith(runId));
    if (!run) {
        console.error(chalk_1.default.red(`\nRun not found: ${runId}\n`));
        process.exit(1);
    }
    console.log('');
    console.log(chalk_1.default.bold('  Test Run Details'));
    console.log(chalk_1.default.dim('  ' + '─'.repeat(56)));
    console.log(`  ${chalk_1.default.dim('ID:')}       ${run.id}`);
    console.log(`  ${chalk_1.default.dim('Goal:')}     ${run.goal}`);
    console.log(`  ${chalk_1.default.dim('Status:')}   ${statusLabel(run.status)}`);
    console.log(`  ${chalk_1.default.dim('Model:')}    ${run.modelUsed}`);
    console.log(`  ${chalk_1.default.dim('Started:')}  ${new Date(run.startedAt).toLocaleString()}`);
    console.log(`  ${chalk_1.default.dim('Duration:')} ${run.duration ? (run.duration / 1000).toFixed(1) + 's' : '—'}`);
    if (run.visualAnalysis) {
        console.log('');
        console.log(chalk_1.default.bold('  Visual Analysis'));
        console.log(chalk_1.default.dim('  ' + '─'.repeat(56)));
        console.log(`  ${chalk_1.default.dim('Result:')}  ${run.visualAnalysis.passed ? chalk_1.default.green('passed') : chalk_1.default.red('failed')}`);
        console.log(`  ${chalk_1.default.dim('Method:')}  ${run.visualAnalysis.method}`);
        console.log(`  ${chalk_1.default.dim('Score:')}   ${(run.visualAnalysis.diffScore * 100).toFixed(2)}% changed`);
        console.log(`  ${chalk_1.default.dim('Notes:')}   ${run.visualAnalysis.description}`);
    }
    for (const platform of run.platforms) {
        console.log('');
        console.log(chalk_1.default.bold(`  Steps — ${platform.platform}`));
        console.log(chalk_1.default.dim('  ' + '─'.repeat(56)));
        for (const step of platform.steps) {
            printStepResult(step, undefined, '  ');
        }
    }
    console.log('');
});
// ── testpilot init ────────────────────────────
program
    .command('init')
    .description('Create a testpilot.yaml config in the current directory')
    .action(() => {
    const dest = path.join(process.cwd(), 'testpilot.yaml');
    const src = path.join(__dirname, '../../../config/testpilot.yaml');
    if (fs.existsSync(dest)) {
        console.log(chalk_1.default.yellow('\ntestpilot.yaml already exists in this directory.\n'));
        return;
    }
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
    }
    else {
        // Write inline default if config template not found
        fs.writeFileSync(dest, DEFAULT_CONFIG);
    }
    console.log(chalk_1.default.green('\n✓ Created testpilot.yaml'));
    console.log(chalk_1.default.dim('\nNext steps:'));
    console.log(chalk_1.default.dim('  1. Edit testpilot.yaml — set your baseUrl'));
    console.log(chalk_1.default.dim('  2. Set your API key: export GEMINI_API_KEY=your_key'));
    console.log(chalk_1.default.dim('  3. Run: testpilot test "user can sign in"\n'));
});
program.parse(process.argv);
// ── Print Helpers ─────────────────────────────
function printBanner() {
    console.log('');
    console.log(chalk_1.default.bold.blue('  ✈  TestPilot') + chalk_1.default.dim(' — AI-powered QA'));
    console.log('');
}
function printStep(label, message) {
    console.log(chalk_1.default.bold.cyan(`\n  [${label}]`) + chalk_1.default.dim(' ' + message));
}
function printDone(message) {
    console.log(chalk_1.default.green('  ✓ ') + message);
}
function printStepResult(stepResult, description, indent = '') {
    const icons = {
        passed: chalk_1.default.green('  ✓'),
        failed: chalk_1.default.red('  ✗'),
        healed: chalk_1.default.yellow('  ⚡'),
        skipped: chalk_1.default.dim('  −'),
        pending: chalk_1.default.dim('  ○'),
        running: chalk_1.default.blue('  ●'),
    };
    const icon = icons[stepResult.status] || '  ?';
    const label = description ? description.slice(0, 50) : stepResult.stepId;
    const duration = chalk_1.default.dim(` ${stepResult.duration}ms`);
    const healed = stepResult.healedSelector ? chalk_1.default.yellow(` (healed → "${stepResult.healedSelector}")`) : '';
    const error = stepResult.error ? chalk_1.default.red(`\n${indent}     ↳ ${stepResult.error.slice(0, 100)}`) : '';
    console.log(`${indent}${icon} ${label}${duration}${healed}${error}`);
}
function printSummary(run, outputDir) {
    const passed = run.status === 'passed';
    const border = chalk_1.default.dim('━'.repeat(56));
    console.log(`\n  ${border}`);
    console.log(`  ${passed ? chalk_1.default.bold.green('✅  PASSED') : chalk_1.default.bold.red('❌  FAILED')}`);
    console.log(`  ${chalk_1.default.dim('Duration:')}  ${run.duration ? (run.duration / 1000).toFixed(1) + 's' : '—'}`);
    if (run.visualAnalysis) {
        const visIcon = run.visualAnalysis.passed ? chalk_1.default.green('✓') : chalk_1.default.red('✗');
        console.log(`  ${chalk_1.default.dim('Visual:')}    ${visIcon} ${run.visualAnalysis.description.slice(0, 60)}`);
    }
    console.log(`  ${chalk_1.default.dim('Run ID:')}    ${run.id.slice(0, 16)}...`);
    console.log(`  ${chalk_1.default.dim('Saved to:')}  ${path.join(outputDir, 'runs', run.id.slice(0, 8) + '...')}`);
    console.log(`  ${border}\n`);
}
function statusLabel(status) {
    const map = {
        passed: chalk_1.default.green('passed'),
        failed: chalk_1.default.red('failed'),
        error: chalk_1.default.red('error'),
        pending: chalk_1.default.dim('pending'),
        running: chalk_1.default.blue('running'),
    };
    return map[status] || status;
}
function checkApiKey(provider) {
    const checks = {
        gemini: { env: 'GEMINI_API_KEY', url: 'https://aistudio.google.com/apikey' },
        claude: { env: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com' },
        openai: { env: 'OPENAI_API_KEY', url: 'https://platform.openai.com/api-keys' },
        deepseek: { env: 'DEEPSEEK_API_KEY', url: 'https://platform.deepseek.com' },
        ollama: { env: '', url: '' },
        custom: { env: 'CUSTOM_API_KEY', url: '' },
    };
    const check = checks[provider];
    if (!check || !check.env)
        return null;
    if (process.env[check.env])
        return null;
    return `${check.env} is not set.\nGet a free key at: ${check.url}\nThen: export ${check.env}=your_key`;
}
const DEFAULT_CONFIG = `project:
  name: "My App"
  baseUrl: "http://localhost:3000"

ai:
  provider: "gemini"
  model: "gemini-2.5-flash"

execution:
  timeout: 30000
  screenshotOnEveryStep: true
  headless: true
  viewport:
    width: 1280
    height: 800

reporting:
  outputDir: ".testpilot"
  baseline:
    autoApproveFirst: true

platforms:
  - web
`;

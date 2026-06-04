#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuid } from 'uuid';
import {
  loadConfig,
  TestOrchestrator,
  RunStore,
  TestRun,
  RunStatus,
  StepStatus,
} from '@testpilot/core';
import { WebRunner } from '@testpilot/web-runner';
import { AndroidRunner } from '@testpilot/android-runner';
import { IosRunner } from '@testpilot/ios-runner';

const program = new Command();

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
  .action(async (goal: string, options) => {
    printBanner();

    const config = loadConfig(process.cwd());
    if (options.url) config.project.baseUrl = options.url;
    if (options.headed) config.execution.headless = false;
    if (options.model) config.ai.provider = options.model;

    // Validate API key before starting
    const keyCheck = checkApiKey(config.ai.provider);
    if (keyCheck) {
      console.error(chalk.red('\n✗ ' + keyCheck));
      process.exit(1);
    }

    const orchestrator = new TestOrchestrator(config);
    
    // Register runners
    orchestrator.registerRunner('web', new WebRunner(
      (orchestrator as any).llm, 
      config, 
      (orchestrator as any).store
    ));
    orchestrator.registerRunner('android', new AndroidRunner(
      (orchestrator as any).llm,
      config,
      (orchestrator as any).store
    ));
    orchestrator.registerRunner('ios', new IosRunner(
      (orchestrator as any).llm,
      config,
      (orchestrator as any).store
    ));

    const caps = (orchestrator as any).llm.capabilities();

    console.log(chalk.dim('━'.repeat(56)));
    console.log(chalk.bold('  Goal:    ') + chalk.white(goal));
    console.log(chalk.bold('  URL:     ') + chalk.cyan(config.project.baseUrl));
    console.log(chalk.bold('  Model:   ') + chalk.magenta(`${caps.provider} / ${caps.model}`));
    console.log(chalk.bold('  Vision:  ') + (caps.hasVision ? chalk.green('enabled') : chalk.yellow('disabled — using pixel diff')));
    console.log(chalk.dim('━'.repeat(56)) + '\n');

    try {
      const run = await orchestrator.run(goal, {
        baseUrl: options.url,
        onStep: (label, message) => printStep(label, message),
        onDone: (message) => printDone(message),
        onStepResult: (res, desc) => printStepResult(res, desc),
      });

      // Final summary
      printSummary(run, path.resolve(config.reporting.outputDir));
    } catch (err: any) {
      console.error(chalk.red('\n✗ Error: ') + err.message);
      if (err.message.includes('API_KEY') || err.message.includes('api key')) {
        console.log(chalk.dim('\nTip: Set your API key in .env or as an environment variable.'));
        console.log(chalk.dim('     See README.md for setup instructions.\n'));
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
    const config = loadConfig(process.cwd());
    const store = new RunStore(path.resolve(config.reporting.outputDir));
    const runs = await store.listRuns(parseInt(options.limit));

    if (runs.length === 0) {
      console.log(chalk.dim('\nNo test runs yet. Run: testpilot test "your goal"\n'));
      return;
    }

    console.log('');
    console.log(chalk.bold('  Recent test runs'));
    console.log(chalk.dim('  ' + '─'.repeat(72)));
    console.log(
      chalk.dim('  ' + 'STATUS'.padEnd(10) + 'GOAL'.padEnd(40) + 'DURATION'.padEnd(12) + 'RUN ID')
    );
    console.log(chalk.dim('  ' + '─'.repeat(72)));

    for (const run of runs) {
      const statusStr = run.status === 'passed'
        ? chalk.green('✓ passed')
        : run.status === 'failed'
          ? chalk.red('✗ failed')
          : chalk.yellow('⚠ ' + run.status);
      const duration = run.duration ? `${(run.duration / 1000).toFixed(1)}s` : '—';
      const goal = run.goal.slice(0, 38).padEnd(40);
      console.log(`  ${statusStr.padEnd(18)} ${goal} ${duration.padEnd(12)} ${chalk.dim(run.id.slice(0, 8))}`);
    }
    console.log('');
  });

// ── testpilot show <runId> ────────────────────

program
  .command('show <runId>')
  .description('Show details of a specific run')
  .action(async (runId: string) => {
    const config = loadConfig(process.cwd());
    const store = new RunStore(path.resolve(config.reporting.outputDir));

    // Support partial IDs
    const runs = await store.listRuns(100);
    const run = runs.find((r: any) => r.id.startsWith(runId));

    if (!run) {
      console.error(chalk.red(`\nRun not found: ${runId}\n`));
      process.exit(1);
    }

    console.log('');
    console.log(chalk.bold('  Test Run Details'));
    console.log(chalk.dim('  ' + '─'.repeat(56)));
    console.log(`  ${chalk.dim('ID:')}       ${run.id}`);
    console.log(`  ${chalk.dim('Goal:')}     ${run.goal}`);
    console.log(`  ${chalk.dim('Status:')}   ${statusLabel(run.status)}`);
    console.log(`  ${chalk.dim('Model:')}    ${run.modelUsed}`);
    console.log(`  ${chalk.dim('Started:')}  ${new Date(run.startedAt).toLocaleString()}`);
    console.log(`  ${chalk.dim('Duration:')} ${run.duration ? (run.duration / 1000).toFixed(1) + 's' : '—'}`);

    if (run.visualAnalysis) {
      console.log('');
      console.log(chalk.bold('  Visual Analysis'));
      console.log(chalk.dim('  ' + '─'.repeat(56)));
      console.log(`  ${chalk.dim('Result:')}  ${run.visualAnalysis.passed ? chalk.green('passed') : chalk.red('failed')}`);
      console.log(`  ${chalk.dim('Method:')}  ${run.visualAnalysis.method}`);
      console.log(`  ${chalk.dim('Score:')}   ${(run.visualAnalysis.diffScore * 100).toFixed(2)}% changed`);
      console.log(`  ${chalk.dim('Notes:')}   ${run.visualAnalysis.description}`);
    }

    for (const platform of run.platforms) {
      console.log('');
      console.log(chalk.bold(`  Steps — ${platform.platform}`));
      console.log(chalk.dim('  ' + '─'.repeat(56)));
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
      console.log(chalk.yellow('\ntestpilot.yaml already exists in this directory.\n'));
      return;
    }

    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      // Write inline default if config template not found
      fs.writeFileSync(dest, DEFAULT_CONFIG);
    }

    console.log(chalk.green('\n✓ Created testpilot.yaml'));
    console.log(chalk.dim('\nNext steps:'));
    console.log(chalk.dim('  1. Edit testpilot.yaml — set your baseUrl'));
    console.log(chalk.dim('  2. Set your API key: export GEMINI_API_KEY=your_key'));
    console.log(chalk.dim('  3. Run: testpilot test "user can sign in"\n'));
  });

program.parse(process.argv);

// ── Print Helpers ─────────────────────────────

function printBanner() {
  console.log('');
  console.log(chalk.bold.blue('  ✈  TestPilot') + chalk.dim(' — AI-powered QA'));
  console.log('');
}

function printStep(label: string, message: string) {
  console.log(chalk.bold.cyan(`\n  [${label}]`) + chalk.dim(' ' + message));
}

function printDone(message: string) {
  console.log(chalk.green('  ✓ ') + message);
}

function printStepResult(stepResult: any, description?: string, indent = '') {
  const icons: Record<StepStatus, string> = {
    passed: chalk.green('  ✓'),
    failed: chalk.red('  ✗'),
    healed: chalk.yellow('  ⚡'),
    skipped: chalk.dim('  −'),
    pending: chalk.dim('  ○'),
    running: chalk.blue('  ●'),
  };
  const icon = icons[stepResult.status as StepStatus] || '  ?';
  const label = description ? description.slice(0, 50) : stepResult.stepId;
  const duration = chalk.dim(` ${stepResult.duration}ms`);
  const healed = stepResult.healedSelector ? chalk.yellow(` (healed → "${stepResult.healedSelector}")`) : '';
  const error = stepResult.error ? chalk.red(`\n${indent}     ↳ ${stepResult.error.slice(0, 100)}`) : '';
  console.log(`${indent}${icon} ${label}${duration}${healed}${error}`);
}

function printSummary(run: TestRun, outputDir: string) {
  const passed = run.status === 'passed';
  const border = chalk.dim('━'.repeat(56));
  console.log(`\n  ${border}`);
  console.log(`  ${passed ? chalk.bold.green('✅  PASSED') : chalk.bold.red('❌  FAILED')}`);
  console.log(`  ${chalk.dim('Duration:')}  ${run.duration ? (run.duration / 1000).toFixed(1) + 's' : '—'}`);
  if (run.visualAnalysis) {
    const visIcon = run.visualAnalysis.passed ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${chalk.dim('Visual:')}    ${visIcon} ${run.visualAnalysis.description.slice(0, 60)}`);
  }
  console.log(`  ${chalk.dim('Run ID:')}    ${run.id.slice(0, 16)}...`);
  console.log(`  ${chalk.dim('Saved to:')}  ${path.join(outputDir, 'runs', run.id.slice(0, 8) + '...')}`);
  console.log(`  ${border}\n`);
}

function statusLabel(status: RunStatus): string {
  const map: Record<RunStatus, string> = {
    passed: chalk.green('passed'),
    failed: chalk.red('failed'),
    error: chalk.red('error'),
    pending: chalk.dim('pending'),
    running: chalk.blue('running'),
  };
  return map[status] || status;
}

function checkApiKey(provider: string): string | null {
  const checks: Record<string, { env: string; url: string }> = {
    gemini: { env: 'GEMINI_API_KEY', url: 'https://aistudio.google.com/apikey' },
    claude: { env: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com' },
    openai: { env: 'OPENAI_API_KEY', url: 'https://platform.openai.com/api-keys' },
    deepseek: { env: 'DEEPSEEK_API_KEY', url: 'https://platform.deepseek.com' },
    ollama: { env: '', url: '' },
    custom: { env: 'CUSTOM_API_KEY', url: '' },
  };

  const check = checks[provider];
  if (!check || !check.env) return null;
  if (process.env[check.env]) return null;

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

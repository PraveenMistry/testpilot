import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import {
  loadConfig,
  TestOrchestrator,
  RunStore,
  TestRun,
  RunStatus,
} from '@testpilot/core';
import { WebRunner } from '@testpilot/web-runner';
import { AndroidRunner } from '@testpilot/android-runner';
import { IosRunner } from '@testpilot/ios-runner';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ── Run a test ────────────────────────────────

app.post('/api/run', async (req, res) => {
  const { goal, baseUrl, configDir } = req.body as {
    goal: string;
    baseUrl?: string;
    configDir?: string;
  };

  if (!goal) return res.status(400).json({ error: 'goal is required' });

  const config = loadConfig(configDir || process.cwd());
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

  const runId = uuid();
  const effectiveBaseUrl = baseUrl || config.project.baseUrl;

  // Kick off async — respond immediately with run ID
  res.json({ runId, status: 'running', message: 'Test run started' });

  // Execute in background
  orchestrator.run(goal, { baseUrl: effectiveBaseUrl }).catch(
    (err: any) => console.error('Run error:', err)
  );
});

// ── Get run status/result ─────────────────────

app.get('/api/run/:runId', (req, res) => {
  const config = loadConfig(process.cwd());
  const store = new RunStore(path.resolve(config.reporting.outputDir));
  const run = store.getRun(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// ── List recent runs ──────────────────────────

app.get('/api/runs', (req, res) => {
  const config = loadConfig(process.cwd());
  const store = new RunStore(path.resolve(config.reporting.outputDir));
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

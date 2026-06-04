import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import {
  ProjectConfig,
  LLMInterface,
  TestRun,
  RunStatus,
  PlatformResult,
} from './types';
import { createLLMProvider } from './llm';
import { TestPlanner as Planner } from './planner';
import { VisionAnalyser as Vision } from './vision';
import { RunStore as Store } from './store';

/**
 * Registry for platform runners.
 * In Phase 1, only 'web' is supported.
 */
export interface PlatformRunner {
  run(plan: any, runId: string): Promise<PlatformResult>;
}

export class TestOrchestrator {
  private runners: Map<string, PlatformRunner> = new Map();
  private llm: LLMInterface;
  private store: Store;
  private planner: Planner;
  private visionAnalyser: Vision;

  constructor(private config: ProjectConfig) {
    this.llm = createLLMProvider(config.ai);
    this.store = new Store(path.resolve(config.reporting.outputDir));
    this.planner = new Planner(this.llm);
    this.visionAnalyser = new Vision(this.llm);
  }

  /**
   * Register a runner for a specific platform.
   */
  registerRunner(platform: string, runner: PlatformRunner) {
    this.runners.set(platform, runner);
  }

  /**
   * Execute a full test run from a natural language goal.
   */
  async run(goal: string, options: { 
    baseUrl?: string; 
    onStep?: (label: string, message: string) => void;
    onDone?: (message: string) => void;
    onStepResult?: (result: any, description?: string) => void;
  } = {}): Promise<TestRun> {
    const runId = uuid();
    const startedAt = new Date().toISOString();
    const baseUrl = options.baseUrl || this.config.project.baseUrl;
    const { onStep, onDone, onStepResult } = options;

    try {
      // 1. Plan
      if (onStep) onStep('Planning', 'Generating test steps from goal...');
      const plan = await this.planner.generate(goal, baseUrl, this.config.platforms);
      this.store.savePlan(plan);
      if (onDone) onDone(`${plan.steps.length} steps planned: ${plan.name}`);

      // 2. Execute across platforms
      const platformResults: PlatformResult[] = [];
      
      for (const platform of this.config.platforms) {
        const runner = this.runners.get(platform);
        if (!runner) {
          console.warn(`No runner registered for platform: ${platform}`);
          continue;
        }

        if (onStep) onStep('Executing', `Running on ${platform}...`);
        const result = await runner.run(plan, runId);
        platformResults.push(result);

        if (onStepResult) {
          for (const stepRes of result.steps) {
            onStepResult(stepRes, plan.steps.find(s => s.id === stepRes.stepId)?.description);
          }
        }
      }

      // 3. Visual Analysis (on final screenshots of all platforms)
      if (onStep) onStep('Analysing', 'Comparing screenshots...');
      
      // For now, we only handle the primary/first platform's visual analysis 
      // as per original CLI/API logic.
      let visualAnalysis;
      const firstResult = platformResults[0];
      if (firstResult && firstResult.screenshotPaths.length > 0) {
        const finalScreenshot = firstResult.screenshotPaths.at(-1)!;
        const baselinePath = this.store.getBaselinePath(plan.id, firstResult.platform);

        visualAnalysis = await this.visionAnalyser.analyse(
          finalScreenshot, 
          baselinePath, 
          this.store.getRunDir(runId)
        );

        if (visualAnalysis.isBaseline && this.config.reporting.baseline.autoApproveFirst) {
          fs.copyFileSync(finalScreenshot, baselinePath);
        }
      }

      // 4. Determine overall status
      const allPassed = platformResults.every(r => r.status === 'passed');
      const visualPassed = visualAnalysis ? visualAnalysis.passed : true;
      const overallStatus: RunStatus = allPassed && visualPassed ? 'passed' : 'failed';

      const run: TestRun = {
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
    } catch (err) {
      const errorRun: TestRun = {
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

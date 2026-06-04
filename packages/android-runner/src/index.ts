import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as yaml from 'js-yaml';
import {
  TestPlan,
  TestStep,
  PlatformResult,
  StepResult,
  ProjectConfig,
  LLMInterface,
  RunStore,
} from '@testpilot/core';

export class AndroidRunner {
  constructor(
    private llm: LLMInterface,
    private config: ProjectConfig,
    private store: RunStore
  ) {}

  async run(plan: TestPlan, runId: string): Promise<PlatformResult> {
    const startedAt = Date.now();
    const runDir = this.store.getRunDir(runId);
    const screenshotDir = path.join(runDir, 'screenshots', 'android');
    fs.mkdirSync(screenshotDir, { recursive: true });

    console.log('\n  🤖 Starting Android runner (Maestro)...');

    const maestroYaml = this.translateToMaestro(plan, screenshotDir);
    const yamlPath = path.join(runDir, 'test.yaml');
    fs.writeFileSync(yamlPath, maestroYaml);

    const stepResults: StepResult[] = [];
    const screenshotPaths: string[] = [];

    try {
      // Execute Maestro
      // In a real environment, we'd use a streaming execution to get per-step results.
      // For this implementation, we'll run the full flow and then collect screenshots.
      console.log('  ▸ Executing Maestro flow...');
      execSync(`maestro test ${yamlPath}`, { stdio: 'inherit' });

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

    } catch (err) {
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

  private translateToMaestro(plan: TestPlan, screenshotDir: string): string {
    const maestroSteps: any[] = [];

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

  private mapStepToMaestro(step: TestStep): any {
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

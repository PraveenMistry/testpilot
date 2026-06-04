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

export class IosRunner {
  constructor(
    private llm: LLMInterface,
    private config: ProjectConfig,
    private store: RunStore
  ) {}

  async run(plan: TestPlan, runId: string): Promise<PlatformResult> {
    const startedAt = Date.now();
    const runDir = this.store.getRunDir(runId);
    const screenshotDir = path.join(runDir, 'screenshots', 'ios');
    fs.mkdirSync(screenshotDir, { recursive: true });

    console.log('\n  🍎 Starting iOS runner (Maestro)...');

    const maestroYaml = this.translateToMaestro(plan, screenshotDir);
    const yamlPath = path.join(runDir, 'test-ios.yaml');
    fs.writeFileSync(yamlPath, maestroYaml);

    const stepResults: StepResult[] = [];
    const screenshotPaths: string[] = [];

    try {
      // Execute Maestro
      console.log('  ▸ Executing Maestro flow for iOS...');
      execSync(`maestro test ${yamlPath}`, { stdio: 'inherit' });

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

    } catch (err) {
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

  private translateToMaestro(plan: TestPlan, screenshotDir: string): string {
    const maestroSteps: any[] = [];

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

  private mapStepToMaestro(step: TestStep): any {
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

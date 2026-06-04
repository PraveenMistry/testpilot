import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import {
  TestPlan,
  TestStep,
  PlatformResult,
  StepResult,
  StepStatus,
  ProjectConfig,
  LLMInterface,
  SelfHealingEngine,
  VisionAnalyser,
  RunStore,
} from '@testpilot/core';

export class WebRunner {
  private healer: SelfHealingEngine;
  private visionAnalyser: VisionAnalyser;

  constructor(
    private llm: LLMInterface,
    private config: ProjectConfig,
    private store: RunStore
  ) {
    this.healer = new SelfHealingEngine(llm);
    this.visionAnalyser = new VisionAnalyser(llm);
  }

  async run(plan: TestPlan, runId: string): Promise<PlatformResult> {
    const startedAt = Date.now();
    const runDir = this.store.getRunDir(runId);
    const screenshotDir = path.join(runDir, 'screenshots', 'web');
    fs.mkdirSync(screenshotDir, { recursive: true });

    const stepResults: StepResult[] = [];
    const screenshotPaths: string[] = [];

    let browser: Browser | null = null;
    let overallStatus: PlatformResult['status'] = 'passed';

    console.log('\n  🌐 Starting web runner (Playwright)...');

    try {
      browser = await chromium.launch({ headless: this.config.execution.headless });
      const context = await browser.newContext({
        viewport: this.config.execution.viewport,
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();

      for (const step of plan.steps) {
        const stepResult = await this.executeStep(
          step, page, context, screenshotDir, screenshotPaths, plan.id
        );
        stepResults.push(stepResult);

        if (stepResult.status === 'failed' && !step.optional) {
          overallStatus = 'failed';
          break;
        }
      }

      // Final screenshot for visual analysis
      const finalScreenshot = path.join(screenshotDir, 'final.png');
      await page.screenshot({ path: finalScreenshot, fullPage: false });
      screenshotPaths.push(finalScreenshot);

      await context.close();
    } catch (err) {
      overallStatus = 'error';
      stepResults.push({
        stepId: 'runner-error',
        status: 'failed',
        duration: 0,
        error: String(err),
      });
    } finally {
      if (browser) await browser.close();
    }

    return {
      platform: 'web',
      status: overallStatus,
      duration: Date.now() - startedAt,
      steps: stepResults,
      screenshotPaths,
    };
  }

  // ── Step Execution ────────────────────────────

  private async executeStep(
    step: TestStep,
    page: Page,
    _context: BrowserContext,
    screenshotDir: string,
    screenshotPaths: string[],
    planId: string
  ): Promise<StepResult> {
    const start = Date.now();
    console.log(`  ▸ [${step.id}] ${step.description || step.action} ${step.target ? `"${step.target}"` : ''}`);

    try {
      await this.performAction(step, page);

      // Screenshot after every step (if configured)
      if (this.config.execution.screenshotOnEveryStep) {
        const screenshotPath = path.join(screenshotDir, `${step.id}.png`);
        await page.screenshot({ path: screenshotPath });
        screenshotPaths.push(screenshotPath);
      }

      return { stepId: step.id, status: 'passed', duration: Date.now() - start };
    } catch (err) {
      const error = String(err);

      // Attempt self-healing for element-not-found errors
      if (isElementError(error) && step.target) {
        const pageContent = await getPageContent(page);
        const healed = await this.healer.heal(step, pageContent, error);

        if (healed) {
          try {
            await this.performAction(healed.healedStep, page);
            const screenshotPath = path.join(screenshotDir, `${step.id}-healed.png`);
            await page.screenshot({ path: screenshotPath });
            screenshotPaths.push(screenshotPath);

            return {
              stepId: step.id,
              status: 'healed',
              duration: Date.now() - start,
              screenshotPath,
              healedSelector: healed.healedStep.target,
            };
          } catch (healErr) {
            console.log(`  ✗ Self-healing attempt also failed: ${healErr}`);
          }
        }
      }

      console.log(`  ✗ Step failed: ${error.slice(0, 120)}`);
      return { stepId: step.id, status: 'failed', duration: Date.now() - start, error };
    }
  }

  // ── Action Dispatch ───────────────────────────

  private async performAction(step: TestStep, page: Page): Promise<void> {
    const timeout = this.config.execution.timeout;

    switch (step.action) {
      case 'navigate':
        await page.goto(step.target!, { waitUntil: 'domcontentloaded', timeout });
        await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 10000) }).catch(() => {});
        break;

      case 'click':
      case 'tap': {
        const locator = await smartLocate(page, step.target!);
        await locator.click({ timeout });
        break;
      }

      case 'type': {
        const locator = await smartLocate(page, step.target!);
        await locator.fill(step.value || '', { timeout });
        break;
      }

      case 'scroll':
        await page.evaluate((direction) => {
          window.scrollBy(0, direction === 'up' ? -300 : 300);
        }, step.value || 'down');
        break;

      case 'wait': {
        const ms = parseInt(step.value || '1000', 10);
        await page.waitForTimeout(ms);
        break;
      }

      case 'assert':
        await this.performAssertion(step, page, timeout);
        break;

      case 'screenshot':
        // Handled by screenshotOnEveryStep — no-op here
        break;

      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }

  private async performAssertion(step: TestStep, page: Page, timeout: number): Promise<void> {
    switch (step.assertType) {
      case 'screen_contains': {
        const text = step.value ?? '';

        await page.waitForFunction(
          (expectedText) =>
            document.body?.innerText?.includes(expectedText),
          text,
          { timeout }
        );

        break;
      }

      case 'screen_not_contains': {
        const bodyText = await page.evaluate(() => document.body?.innerText || '');
        if (bodyText.includes(step.value || '')) {
          throw new Error(`Expected page NOT to contain "${step.value}" but it does`);
        }
        break;
      }

      case 'url_equals': {
        const url = page.url();
        if (url !== step.value) throw new Error(`Expected URL "${step.value}" but got "${url}"`);
        break;
      }

      case 'url_contains': {
        const url = page.url();
        if (!url.includes(step.value || '')) throw new Error(`Expected URL to contain "${step.value}" but got "${url}"`);
        break;
      }

      case 'element_visible': {
        const loc = await smartLocate(page, step.target || step.value || '');
        await loc.waitFor({ state: 'visible', timeout });
        break;
      }

      case 'element_not_visible': {
        const loc = page.locator(step.target || step.value || '');
        const count = await loc.count();
        if (count > 0) {
          const visible = await loc.first().isVisible();
          if (visible) throw new Error(`Expected element "${step.target}" to not be visible`);
        }
        break;
      }

      case 'screenshot_matches_baseline':
        // Handled by VisionAnalyser after the run — no-op here
        break;

      default:
        throw new Error(`Unknown assertType: ${step.assertType}`);
    }
  }
}

// ── Helpers ───────────────────────────────────

/**
 * Smart locator: tries role/text/label/placeholder/testid before falling back to CSS.
 */
async function smartLocate(page: Page, target: string) {
  // Try accessible role + name combos
  const strategies = [
    () => page.getByRole('button', { name: target, exact: false }),
    () => page.getByRole('link', { name: target, exact: false }),
    () => page.getByRole('textbox', { name: target, exact: false }),
    () => page.getByLabel(target, { exact: false }),
    () => page.getByPlaceholder(target, { exact: false }),
    () => page.getByText(target, { exact: false }),
    () => page.getByTestId(target),
    () => page.locator(target), // last resort: CSS/XPath
  ];

  for (const strategy of strategies) {
    try {
      const loc = strategy();
      const count = await loc.count();
      if (count > 0) return loc.first();
    } catch { /* try next */ }
  }

  throw new Error(`Could not find element: "${target}"`);
}

async function getPageContent(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => {
      // Return simplified accessibility tree text
      const elements = Array.from(document.querySelectorAll('button, a, input, textarea, select, [role], h1, h2, h3, label'));
      return elements.map(el => {
        const element = el as HTMLElement;
        const tag = element.tagName.toLowerCase();
        const text = element.innerText?.trim() || '';
        const aria = el.getAttribute('aria-label') || '';
        const placeholder = (el as HTMLInputElement).placeholder || '';
        const role = el.getAttribute('role') || '';
        return `${tag}${role ? `[role=${role}]` : ''}: ${text || aria || placeholder}`.trim();
      }).filter(Boolean).slice(0, 100).join('\n');
    });
  } catch {
    return '';
  }
}

function isElementError(error: string): boolean {
  return (
    error.includes('not found') ||
    error.includes('Could not find') ||
    error.includes('locator') ||
    error.includes('timeout') ||
    error.includes('No element') ||
    error.includes('element is not visible')
  );
}

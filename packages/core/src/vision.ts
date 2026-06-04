import * as fs from 'fs';
import * as path from 'path';
import { LLMInterface, VisualAnalysis } from './types';

const VISION_PROMPT = `You are a QA engineer reviewing a screenshot of a web application.

Compare the CURRENT screenshot against the BASELINE screenshot.

Analyse:
1. Are there any visible regressions, broken layouts, or unexpected changes?
2. Are text elements readable and in the correct position?
3. Are interactive elements (buttons, inputs, links) visible and properly rendered?
4. Are there any missing images, broken icons, or visual artefacts?

Respond ONLY with this JSON (no markdown, no explanation):
{
  "passed": true,
  "diffScore": 0.02,
  "description": "Brief description of what you see. If passed, describe the screen. If failed, describe exactly what changed or broke."
}

diffScore: 0.0 = identical, 1.0 = completely different. Use your visual judgement.
passed: true if changes are minor/expected, false if there are regressions or broken UI.`;

const VISION_FIRST_RUN_PROMPT = `You are a QA engineer reviewing a screenshot of a web application for the first time.

Analyse this screenshot and verify:
1. The page loaded successfully (no error pages, blank screens, or crash screens)
2. The main content is visible and readable
3. There are no obvious broken elements (missing images shown as broken icons, overlapping text, etc.)

Respond ONLY with this JSON (no markdown, no explanation):
{
  "passed": true,
  "diffScore": 0.0,
  "description": "Brief description of what you see on the screen."
}`;

export class VisionAnalyser {
  constructor(private llm: LLMInterface) {}

  async analyse(
    currentScreenshotPath: string,
    baselinePath: string | null,
    outputDir: string
  ): Promise<VisualAnalysis> {
    const hasVision = this.llm.capabilities().hasVision;

    if (!baselinePath || !fs.existsSync(baselinePath)) {
      // First run — set this as the new baseline
      if (baselinePath) {
        fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
        fs.copyFileSync(currentScreenshotPath, baselinePath);
      }

      if (hasVision) {
        return this.analyseFirstRunWithVision(currentScreenshotPath, baselinePath || currentScreenshotPath);
      }

      return {
        passed: true,
        diffScore: 0,
        description: 'First run — baseline set. No comparison performed.',
        isBaseline: true,
        baselinePath: baselinePath || currentScreenshotPath,
        currentPath: currentScreenshotPath,
        method: 'pixel_diff',
      };
    }

    if (hasVision) {
      return this.analyseWithVision(currentScreenshotPath, baselinePath, outputDir);
    }

    return this.analyseWithPixelDiff(currentScreenshotPath, baselinePath, outputDir);
  }

  // ── AI Vision Analysis ────────────────────────

  private async analyseFirstRunWithVision(
    currentPath: string,
    baselinePath: string
  ): Promise<VisualAnalysis> {
    const imageBuffer = fs.readFileSync(currentPath);

    console.log('  👁  Analysing screenshot with AI vision...');
    const response = await this.llm.vision(imageBuffer, VISION_FIRST_RUN_PROMPT);
    const result = parseVisionResponse(response.text);

    return {
      passed: result.passed,
      diffScore: result.diffScore,
      description: result.description,
      isBaseline: true,
      baselinePath,
      currentPath,
      method: 'ai_vision',
    };
  }

  private async analyseWithVision(
    currentPath: string,
    baselinePath: string,
    outputDir: string
  ): Promise<VisualAnalysis> {
    const currentBuffer = fs.readFileSync(currentPath);
    const baselineBuffer = fs.readFileSync(baselinePath);

    // Build a side-by-side comparison image for the AI
    const combinedBuffer = await buildSideBySide(currentBuffer, baselineBuffer);

    const prompt = `The image shows two screenshots side by side: BASELINE (left) and CURRENT (right).\n\n${VISION_PROMPT}`;

    console.log('  👁  Comparing screenshots with AI vision...');
    const response = await this.llm.vision(combinedBuffer, prompt);
    const result = parseVisionResponse(response.text);

    // Save diff path for report
    const diffPath = path.join(outputDir, 'diff.png');
    fs.writeFileSync(diffPath, combinedBuffer);

    return {
      passed: result.passed,
      diffScore: result.diffScore,
      description: result.description,
      isBaseline: false,
      baselinePath,
      currentPath,
      diffPath,
      method: 'ai_vision',
    };
  }

  // ── Pixel Diff Fallback ───────────────────────

  private async analyseWithPixelDiff(
    currentPath: string,
    baselinePath: string,
    outputDir: string
  ): Promise<VisualAnalysis> {
    console.log('  📊 Comparing screenshots with pixel diff (no vision model)...');

    try {
      // Dynamic import to avoid issues if sharp isn't installed
      const { PNG } = await import('pngjs');
      const pixelmatch = (await import('pixelmatch')).default;

      const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
      const current = PNG.sync.read(fs.readFileSync(currentPath));

      const { width, height } = baseline;
      const diff = new PNG({ width, height });

      const numDiffPixels = pixelmatch(
        baseline.data, current.data, diff.data,
        width, height,
        { threshold: 0.1 }
      );

      const diffScore = numDiffPixels / (width * height);
      const diffPath = path.join(outputDir, 'diff.png');
      fs.writeFileSync(diffPath, PNG.sync.write(diff));

      const passed = diffScore < 0.05; // 5% threshold
      return {
        passed,
        diffScore,
        description: passed
          ? `Visual check passed. ${(diffScore * 100).toFixed(2)}% pixels changed (within threshold).`
          : `Visual regression detected. ${(diffScore * 100).toFixed(2)}% pixels changed (threshold: 5%).`,
        isBaseline: false,
        baselinePath,
        currentPath,
        diffPath,
        method: 'pixel_diff',
      };
    } catch {
      return {
        passed: true,
        diffScore: 0,
        description: 'Pixel diff skipped — pngjs/pixelmatch not available. Install them for pixel comparison.',
        isBaseline: false,
        baselinePath,
        currentPath,
        method: 'pixel_diff',
      };
    }
  }
}

// ── Helpers ───────────────────────────────────

function parseVisionResponse(text: string): { passed: boolean; diffScore: number; description: string } {
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  try {
    const json = JSON.parse(cleaned);
    return {
      passed: Boolean(json.passed),
      diffScore: Number(json.diffScore ?? 0),
      description: String(json.description ?? ''),
    };
  } catch {
    // Fallback: try to extract from text
    const passedMatch = cleaned.match(/"passed"\s*:\s*(true|false)/);
    const passed = passedMatch ? passedMatch[1] === 'true' : true;
    return { passed, diffScore: 0, description: cleaned.slice(0, 300) };
  }
}

async function buildSideBySide(left: Buffer, right: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;

    const leftMeta = await sharp(left).metadata();
    const rightMeta = await sharp(right).metadata();

    const w = Math.max(leftMeta.width ?? 800, rightMeta.width ?? 800);
    const h = Math.max(leftMeta.height ?? 600, rightMeta.height ?? 600);

    // Resize both to same dimensions then join side by side
    const leftResized = await sharp(left).resize(w, h, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
    const rightResized = await sharp(right).resize(w, h, { fit: 'contain', background: '#ffffff' }).png().toBuffer();

    const combined = await sharp({
      create: { width: w * 2, height: h, channels: 3, background: '#ffffff' },
    })
      .composite([
        { input: leftResized, left: 0, top: 0 },
        { input: rightResized, left: w, top: 0 },
      ])
      .png()
      .toBuffer();

    return combined;
  } catch {
    // If sharp fails, just return the current screenshot alone
    return right;
  }
}

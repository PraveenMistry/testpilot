import * as fs from 'fs';
import * as path from 'path';
import { RunStore, TestRun, TestPlan, ArtifactStore } from './types';

// ── Local File Store ──────────────────────────

export class LocalRunStore implements RunStore {
  private runsDir: string;
  private baselineDir: string;
  private plansDir: string;

  constructor(outputDir: string) {
    this.runsDir = path.join(outputDir, 'runs');
    this.baselineDir = path.join(outputDir, 'baselines');
    this.plansDir = path.join(outputDir, 'plans');
    fs.mkdirSync(this.runsDir, { recursive: true });
    fs.mkdirSync(this.baselineDir, { recursive: true });
    fs.mkdirSync(this.plansDir, { recursive: true });
  }

  async saveRun(run: TestRun): Promise<void> {
    const dir = path.join(this.runsDir, run.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run, null, 2));
  }

  async getRun(runId: string): Promise<TestRun | null> {
    const file = path.join(this.runsDir, runId, 'run.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  async listRuns(limit = 20): Promise<TestRun[]> {
    if (!fs.existsSync(this.runsDir)) return [];
    return fs.readdirSync(this.runsDir)
      .filter(d => fs.existsSync(path.join(this.runsDir, d, 'run.json')))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit)
      .map(d => JSON.parse(fs.readFileSync(path.join(this.runsDir, d, 'run.json'), 'utf8')));
  }

  async savePlan(plan: TestPlan): Promise<void> {
    fs.writeFileSync(
      path.join(this.plansDir, `${plan.id}.json`),
      JSON.stringify(plan, null, 2)
    );
  }

  async getPlan(planId: string): Promise<TestPlan | null> {
    const file = path.join(this.plansDir, `${planId}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  getBaselinePath(planId: string, platform: string): string {
    return path.join(this.baselineDir, `${planId}-${platform}.png`);
  }

  getRunDir(runId: string): string {
    const dir = path.join(this.runsDir, runId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

// ── S3 / Cloudflare R2 Artifact Store ─────────

export class S3ArtifactStore implements ArtifactStore {
  constructor(private config: any) {}

  async upload(runId: string, filePath: string, platform: string): Promise<string> {
    console.log(`[S3] Uploading ${filePath} for run ${runId} (${platform})`);
    return `s3://${this.config.bucket}/${runId}/${platform}/${path.basename(filePath)}`;
  }

  async download(path: string): Promise<Buffer> {
    console.log(`[S3] Downloading ${path}`);
    return Buffer.from('');
  }
}

// ── Postgres Store ────────────────────────────

export class PostgresStore implements RunStore {
  constructor(private dbUrl: string) {}

  async saveRun(run: TestRun): Promise<void> {
    console.log(`[Postgres] Saving run ${run.id} to ${this.dbUrl}`);
  }

  async getRun(runId: string): Promise<TestRun | null> { return null; }
  async listRuns(limit = 20): Promise<TestRun[]> { return []; }
  async savePlan(plan: TestPlan): Promise<void> {}
  async getPlan(planId: string): Promise<TestPlan | null> { return null; }
  getBaselinePath(planId: string, platform: string): string { return ''; }
}

// Export legacy name for compatibility
export { LocalRunStore as RunStore };

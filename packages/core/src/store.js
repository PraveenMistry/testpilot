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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunStore = exports.PostgresStore = exports.S3ArtifactStore = exports.LocalRunStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ── Local File Store ──────────────────────────
class LocalRunStore {
    runsDir;
    baselineDir;
    plansDir;
    constructor(outputDir) {
        this.runsDir = path.join(outputDir, 'runs');
        this.baselineDir = path.join(outputDir, 'baselines');
        this.plansDir = path.join(outputDir, 'plans');
        fs.mkdirSync(this.runsDir, { recursive: true });
        fs.mkdirSync(this.baselineDir, { recursive: true });
        fs.mkdirSync(this.plansDir, { recursive: true });
    }
    async saveRun(run) {
        const dir = path.join(this.runsDir, run.id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run, null, 2));
    }
    async getRun(runId) {
        const file = path.join(this.runsDir, runId, 'run.json');
        if (!fs.existsSync(file))
            return null;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    async listRuns(limit = 20) {
        if (!fs.existsSync(this.runsDir))
            return [];
        return fs.readdirSync(this.runsDir)
            .filter(d => fs.existsSync(path.join(this.runsDir, d, 'run.json')))
            .sort((a, b) => b.localeCompare(a))
            .slice(0, limit)
            .map(d => JSON.parse(fs.readFileSync(path.join(this.runsDir, d, 'run.json'), 'utf8')));
    }
    async savePlan(plan) {
        fs.writeFileSync(path.join(this.plansDir, `${plan.id}.json`), JSON.stringify(plan, null, 2));
    }
    async getPlan(planId) {
        const file = path.join(this.plansDir, `${planId}.json`);
        if (!fs.existsSync(file))
            return null;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    getBaselinePath(planId, platform) {
        return path.join(this.baselineDir, `${planId}-${platform}.png`);
    }
    getRunDir(runId) {
        const dir = path.join(this.runsDir, runId);
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    }
}
exports.LocalRunStore = LocalRunStore;
exports.RunStore = LocalRunStore;
// ── S3 / Cloudflare R2 Artifact Store ─────────
class S3ArtifactStore {
    config;
    constructor(config) {
        this.config = config;
    }
    async upload(runId, filePath, platform) {
        console.log(`[S3] Uploading ${filePath} for run ${runId} (${platform})`);
        return `s3://${this.config.bucket}/${runId}/${platform}/${path.basename(filePath)}`;
    }
    async download(path) {
        console.log(`[S3] Downloading ${path}`);
        return Buffer.from('');
    }
}
exports.S3ArtifactStore = S3ArtifactStore;
// ── Postgres Store ────────────────────────────
class PostgresStore {
    dbUrl;
    constructor(dbUrl) {
        this.dbUrl = dbUrl;
    }
    async saveRun(run) {
        console.log(`[Postgres] Saving run ${run.id} to ${this.dbUrl}`);
    }
    async getRun(runId) { return null; }
    async listRuns(limit = 20) { return []; }
    async savePlan(plan) { }
    async getPlan(planId) { return null; }
    getBaselinePath(planId, platform) { return ''; }
}
exports.PostgresStore = PostgresStore;

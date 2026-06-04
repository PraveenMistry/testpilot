"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubAdapter = void 0;
class GitHubAdapter {
    token;
    owner;
    repo;
    baseUrl = 'https://api.github.com';
    constructor(token, owner, repo) {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
    }
    async getDiff(prId) {
        const res = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${prId}`, {
            headers: {
                Authorization: `token ${this.token}`,
                Accept: 'application/vnd.github.v3.diff',
            },
        });
        if (!res.ok)
            throw new Error(`GitHub API error: ${res.statusText}`);
        const diffText = await res.text();
        // Minimal parsing for Phase 3
        return [{ path: 'diff.txt', hunks: [diffText.slice(0, 2000)] }];
    }
    async postComment(prId, body) {
        const res = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${prId}/comments`, {
            method: 'POST',
            headers: {
                Authorization: `token ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ body }),
        });
        if (!res.ok)
            throw new Error(`GitHub API error: ${res.statusText}`);
    }
    async postStatus(commitSha, status, targetUrl) {
        const stateMap = {
            pending: 'pending',
            success: 'success',
            failure: 'failure',
            error: 'error',
        };
        const res = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/statuses/${commitSha}`, {
            method: 'POST',
            headers: {
                Authorization: `token ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                state: stateMap[status],
                target_url: targetUrl,
                description: `TestPilot run: ${status}`,
                context: 'testpilot/ci',
            }),
        });
        if (!res.ok)
            throw new Error(`GitHub API error: ${res.statusText}`);
    }
}
exports.GitHubAdapter = GitHubAdapter;

import { VCSAdapter, CommitStatus, FileDiff } from './types';

export class GitHubAdapter implements VCSAdapter {
  private token: string;
  private owner: string;
  private repo: string;
  private baseUrl = 'https://api.github.com';

  constructor(token: string, owner: string, repo: string) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
  }

  async getDiff(prId: string): Promise<FileDiff[]> {
    const res = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${prId}`, {
      headers: {
        Authorization: `token ${this.token}`,
        Accept: 'application/vnd.github.v3.diff',
      },
    });

    if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
    const diffText = await res.text();
    
    // Minimal parsing for Phase 3
    return [{ path: 'diff.txt', hunks: [diffText.slice(0, 2000)] }];
  }

  async postComment(prId: string, body: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${prId}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `token ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  }

  async postStatus(commitSha: string, status: CommitStatus, targetUrl?: string): Promise<void> {
    const stateMap: Record<CommitStatus, string> = {
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

    if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  }
}

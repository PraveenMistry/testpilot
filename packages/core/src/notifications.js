"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailDispatcher = exports.SlackDispatcher = void 0;
class SlackDispatcher {
    webhookUrl;
    constructor(webhookUrl) {
        this.webhookUrl = webhookUrl;
    }
    async send(run) {
        const icon = run.status === 'passed' ? '✅' : '❌';
        const message = {
            text: `${icon} *TestPilot Run ${run.status.toUpperCase()}*`,
            attachments: [
                {
                    color: run.status === 'passed' ? '#3ecf8e' : '#f06565',
                    fields: [
                        { title: 'Goal', value: run.goal, short: false },
                        { title: 'Run ID', value: run.id, short: true },
                        { title: 'Duration', value: `${((run.duration || 0) / 1000).toFixed(1)}s`, short: true }
                    ]
                }
            ]
        };
        const res = await fetch(this.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });
        if (!res.ok)
            console.error(`Slack notification failed: ${res.statusText}`);
    }
}
exports.SlackDispatcher = SlackDispatcher;
class EmailDispatcher {
    smtpConfig;
    constructor(smtpConfig) {
        this.smtpConfig = smtpConfig;
    }
    async send(run) {
        // Simplified: in a real app, use nodemailer
        console.log(`[Email] Sending run report to ${this.smtpConfig.to} for run ${run.id}`);
    }
}
exports.EmailDispatcher = EmailDispatcher;

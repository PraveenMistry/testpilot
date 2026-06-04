"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLLMProvider = createLLMProvider;
// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const COST_PER_1M = {
    'gemini-2.5-flash': { input: 0.075, output: 0.30 },
    'gemini-2.0-flash': { input: 0.075, output: 0.30 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
    'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
    'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
    'gpt-4o': { input: 2.5, output: 10.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'deepseek-chat': { input: 0.14, output: 0.28 },
};
function estimateCost(model, input, output) {
    const r = COST_PER_1M[model] ?? { input: 1.0, output: 3.0 };
    return (input * r.input + output * r.output) / 1_000_000;
}
function isRetryable(msg) {
    return (msg.includes('503') || msg.includes('529') ||
        msg.includes('UNAVAILABLE') || msg.includes('overloaded') ||
        msg.includes('high demand') || msg.includes('RATE_LIMIT') ||
        msg.includes('429') || msg.includes('quota'));
}
/** Retry a single model up to maxAttempts with exponential backoff, then give up. */
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 2000) {
    let lastErr = new Error('unknown');
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            if (!isRetryable(err.message ?? ''))
                throw err;
            if (attempt < maxAttempts) {
                const delay = baseDelayMs * attempt;
                console.log(`  ⏳ API busy (attempt ${attempt}/${maxAttempts}), retrying in ${delay / 1000}s...`);
                await sleep(delay);
            }
        }
    }
    throw lastErr;
}
// ─────────────────────────────────────────────
// Gemini Provider — free default
// Fallback chain: 2.5-flash → 2.0-flash → 1.5-flash → 1.5-flash-8b
// ─────────────────────────────────────────────
class GeminiProvider {
    apiKey;
    model;
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    fallbackChain = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
    ];
    constructor(config) {
        this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || '';
        this.model = config.model || 'gemini-2.5-flash';
    }
    capabilities() {
        return { hasVision: true, maxContextTokens: 1_000_000, provider: 'gemini', model: this.model };
    }
    async plan(prompt, context) {
        return this.complete(`${context ? context + '\n\n' : ''}${prompt}`);
    }
    async reason(prompt, context) {
        return this.complete(`${context ? context + '\n\n' : ''}${prompt}`);
    }
    async vision(imageBuffer, prompt) {
        return this.complete(prompt, imageBuffer.toString('base64'));
    }
    async complete(text, imageBase64) {
        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY is not set.\n' +
                'Get a free key at: https://aistudio.google.com/apikey\n' +
                'Then: export GEMINI_API_KEY=your_key_here');
        }
        // Build model chain starting from configured model
        const chain = [this.model, ...this.fallbackChain.filter(m => m !== this.model)];
        let lastErr = new Error('unknown');
        for (const modelName of chain) {
            try {
                const result = await withRetry(() => this.callModel(text, imageBase64, modelName), 2, 2000);
                if (modelName !== this.model) {
                    console.log(`  ⚠️  Used fallback model: ${modelName} (${this.model} was unavailable)`);
                }
                return result;
            }
            catch (err) {
                lastErr = err;
                if (isRetryable(err.message ?? ''))
                    continue; // try next model
                throw err; // non-retryable — propagate immediately
            }
        }
        throw new Error(`All Gemini models unavailable. Last error: ${lastErr.message}\n` +
            `Try again in a few minutes, or switch provider:\n` +
            `  testpilot test "..." --model claude\n` +
            `  testpilot test "..." --model openai`);
    }
    async callModel(text, imageBase64, modelName) {
        const parts = [];
        if (imageBase64)
            parts.push({ inlineData: { mimeType: 'image/png', data: imageBase64 } });
        parts.push({ text });
        const res = await fetch(`${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
            }),
        });
        if (!res.ok)
            throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
        const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
        return { text: responseText, usage: { inputTokens, outputTokens, estimatedUsd: estimateCost(modelName, inputTokens, outputTokens) } };
    }
}
// ─────────────────────────────────────────────
// Anthropic (Claude) Provider
// Fallback chain: Sonnet 4 → Haiku 4.5
// ─────────────────────────────────────────────
class AnthropicProvider {
    apiKey;
    model;
    fallbackChain = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'];
    constructor(config) {
        this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
        this.model = config.model || 'claude-sonnet-4-20250514';
    }
    capabilities() {
        return { hasVision: true, maxContextTokens: 200_000, provider: 'claude', model: this.model };
    }
    async plan(prompt, context) {
        return this.callApi([{ role: 'user', content: `${context ? context + '\n\n' : ''}${prompt}` }]);
    }
    async reason(prompt, context) {
        return this.callApi([{ role: 'user', content: `${context ? context + '\n\n' : ''}${prompt}` }]);
    }
    async vision(imageBuffer, prompt) {
        return this.callApi([{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBuffer.toString('base64') } },
                    { type: 'text', text: prompt },
                ],
            }]);
    }
    async callApi(messages) {
        if (!this.apiKey)
            throw new Error('ANTHROPIC_API_KEY is not set.\nGet a key at: https://console.anthropic.com');
        const chain = [this.model, ...this.fallbackChain.filter(m => m !== this.model)];
        let lastErr = new Error('unknown');
        for (const modelName of chain) {
            try {
                const result = await withRetry(async () => {
                    const res = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': this.apiKey,
                            'anthropic-version': '2023-06-01',
                        },
                        body: JSON.stringify({ model: modelName, max_tokens: 4096, messages }),
                    });
                    if (!res.ok)
                        throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
                    const data = await res.json();
                    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
                    const inputTokens = data.usage?.input_tokens ?? 0;
                    const outputTokens = data.usage?.output_tokens ?? 0;
                    return { text, usage: { inputTokens, outputTokens, estimatedUsd: estimateCost(modelName, inputTokens, outputTokens) } };
                }, 2, 2000);
                if (modelName !== this.model)
                    console.log(`  ⚠️  Used fallback model: ${modelName}`);
                return result;
            }
            catch (err) {
                lastErr = err;
                if (isRetryable(err.message ?? ''))
                    continue;
                throw err;
            }
        }
        throw new Error(`All Claude models unavailable. Last error: ${lastErr.message}`);
    }
}
// ─────────────────────────────────────────────
// OpenAI Provider
// Fallback chain: gpt-4o → gpt-4o-mini
// ─────────────────────────────────────────────
class OpenAIProvider {
    apiKey;
    model;
    baseUrl;
    fallbackChain = ['gpt-4o', 'gpt-4o-mini'];
    constructor(config) {
        this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
        this.model = config.model || 'gpt-4o';
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    }
    capabilities() {
        const hasVision = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-vision-preview'].some(m => this.model.startsWith(m));
        return { hasVision, maxContextTokens: 128_000, provider: 'openai', model: this.model };
    }
    async plan(prompt, context) {
        return this.callApi([{ role: 'user', content: `${context ? context + '\n\n' : ''}${prompt}` }]);
    }
    async reason(prompt, context) {
        return this.callApi([{ role: 'user', content: `${context ? context + '\n\n' : ''}${prompt}` }]);
    }
    async vision(imageBuffer, prompt) {
        return this.callApi([{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBuffer.toString('base64')}`, detail: 'high' } },
                    { type: 'text', text: prompt },
                ],
            }]);
    }
    async callApi(messages) {
        if (!this.apiKey)
            throw new Error('OPENAI_API_KEY is not set.\nGet a key at: https://platform.openai.com/api-keys');
        const chain = [this.model, ...this.fallbackChain.filter(m => m !== this.model)];
        let lastErr = new Error('unknown');
        for (const modelName of chain) {
            try {
                const result = await withRetry(async () => {
                    const res = await fetch(`${this.baseUrl}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
                        body: JSON.stringify({ model: modelName, max_tokens: 4096, messages, temperature: 0.1 }),
                    });
                    if (!res.ok)
                        throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
                    const data = await res.json();
                    const text = data.choices?.[0]?.message?.content ?? '';
                    const inputTokens = data.usage?.prompt_tokens ?? 0;
                    const outputTokens = data.usage?.completion_tokens ?? 0;
                    return { text, usage: { inputTokens, outputTokens, estimatedUsd: estimateCost(modelName, inputTokens, outputTokens) } };
                }, 2, 2000);
                if (modelName !== this.model)
                    console.log(`  ⚠️  Used fallback model: ${modelName}`);
                return result;
            }
            catch (err) {
                lastErr = err;
                if (isRetryable(err.message ?? ''))
                    continue;
                throw err;
            }
        }
        throw new Error(`All OpenAI models unavailable. Last error: ${lastErr.message}`);
    }
}
// ─────────────────────────────────────────────
// DeepSeek Provider (OpenAI-compatible, no vision)
// ─────────────────────────────────────────────
class DeepSeekProvider extends OpenAIProvider {
    constructor(config) {
        super({
            ...config,
            baseUrl: 'https://api.deepseek.com/v1',
            apiKey: config.apiKey || process.env.DEEPSEEK_API_KEY,
            model: config.model || 'deepseek-chat',
        });
    }
    capabilities() {
        return { hasVision: false, maxContextTokens: 64_000, provider: 'deepseek', model: this.model };
    }
    async vision(_imageBuffer, _prompt) {
        throw new Error('DeepSeek does not support vision. Use a vision model for screenshot analysis.');
    }
}
// ─────────────────────────────────────────────
// Ollama Provider (local, free, no vision)
// ─────────────────────────────────────────────
class OllamaProvider {
    baseUrl;
    model;
    constructor(config) {
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        this.model = config.model || 'llama3.2';
    }
    capabilities() {
        return { hasVision: false, maxContextTokens: 32_000, provider: 'ollama', model: this.model };
    }
    async plan(prompt, context) {
        return this.complete(`${context ? context + '\n\n' : ''}${prompt}`);
    }
    async reason(prompt, context) {
        return this.complete(`${context ? context + '\n\n' : ''}${prompt}`);
    }
    async vision(_imageBuffer, _prompt) {
        throw new Error('Ollama (non-vision model) cannot analyse screenshots. Pixel diff will be used instead.');
    }
    async complete(text) {
        const res = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: this.model, prompt: text, stream: false }),
        });
        if (!res.ok)
            throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return { text: data.response ?? '', usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 } };
    }
}
// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────
function createLLMProvider(config) {
    switch (config.provider) {
        case 'gemini': return new GeminiProvider(config);
        case 'claude': return new AnthropicProvider(config);
        case 'openai': return new OpenAIProvider(config);
        case 'deepseek': return new DeepSeekProvider(config);
        case 'ollama': return new OllamaProvider(config);
        case 'custom': return new OpenAIProvider(config);
        default:
            throw new Error(`Unknown AI provider: ${config.provider}`);
    }
}

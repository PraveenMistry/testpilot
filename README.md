# ✈ TestPilot

AI-powered cross-platform QA automation for **iOS**, **Android**, and **Web**.

TestPilot allows you to write test descriptions in natural language and run them autonomously across all target platforms. It uses LLMs to plan the test steps, execute them using native runners, and validate the results using AI vision.

## 🚀 Features

- **Natural Language Testing:** Describe your goal (e.g., "User can sign in and see dashboard") and let TestPilot do the rest.
- **Cross-Platform:** One test goal runs on Web (Playwright), Android (Maestro), and iOS (Maestro).
- **AI Vision:** Semantic visual regression detection that understands UI changes like a human.
- **Self-Healing:** Automatically fixes broken selectors using AI reasoning.
- **VCS Integrated:** Posts results as PR comments and commit statuses on GitHub.
- **Notifications:** Real-time alerts via Slack and Email.
- **Visual Dashboard:** Browse run history and approve UI baselines in a modern web UI.

## 🛠 Tech Stack

- **Core:** TypeScript, Node.js
- **Web Automation:** Playwright
- **Mobile Automation:** Maestro
- **AI:** Gemini 2.5 Flash (Default), Claude, OpenAI, DeepSeek, Ollama
- **Frontend:** Next.js, Tailwind CSS
- **Backend:** Express

## 📦 Project Structure

```text
├── apps/
│   ├── api/            # Orchestration Backend
│   └── web/            # Next.js Dashboard
├── packages/
│   ├── cli/            # Command Line Interface
│   ├── core/           # Shared AI Agents & Logic
│   ├── web-runner/     # Playwright Runner
│   ├── android-runner/ # Maestro Android Runner
│   └── ios-runner/     # Maestro iOS Runner
└── testpilot.yaml      # Project Configuration
```

## 🚥 Getting Started

### 1. Prerequisites
- **Node.js 18+** and **pnpm**
- **Maestro CLI** (for mobile): `curl -Ls "https://get.maestro.mobile.dev" | bash`
- **Android Studio / Xcode** (for local emulators/simulators)
- **API Key:** A free Gemini key from [Google AI Studio](https://aistudio.google.com/apikey)

### 2. Installation
```bash
git clone https://github.com/your-repo/testpilot.git
cd testpilot
pnpm install
pnpm build
```

### 3. Configuration
Create a `testpilot.yaml` in your project root:
```yaml
project:
  name: "My App"
  baseUrl: "https://example.com"

ai:
  provider: "gemini"
  model: "gemini-2.5-flash"

platforms:
  - web
  - android
  - ios
```

Set your API key:
```bash
export GEMINI_API_KEY=your_key_here
```

### 4. NPM Usage (CLI)
You can install the CLI globally to run tests from anywhere:
```bash
# If published to npm
npm install -g @testpilot/cli

# Then run
testpilot test "your goal"
```

### 5. Programmatic Usage
You can also use TestPilot as a library in your own project:

```bash
npm install @testpilot/core @testpilot/web-runner
```

```typescript
import { TestOrchestrator, loadConfig } from '@testpilot/core';
import { WebRunner } from '@testpilot/web-runner';

const config = loadConfig(process.cwd());
const orchestrator = new TestOrchestrator(config);

// Register runners
orchestrator.registerRunner('web', new WebRunner(
  (orchestrator as any).llm, 
  config, 
  (orchestrator as any).store
));

const run = await orchestrator.run("user can log in");
console.log('Test status:', run.status);
```

## 🚥 Prerequisites & Setup

### AI Provider
TestPilot defaults to Gemini. Get a free API key at [Google AI Studio](https://aistudio.google.com/apikey) and set it:
```bash
export GEMINI_API_KEY=your_key
```

### Web Testing
TestPilot uses Playwright for web tests. Ensure browsers are installed:
```bash
npx playwright install
```

### Mobile Testing (Android/iOS)
Mobile automation requires **Maestro**:
1. Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`
2. Ensure you have an emulator (Android) or simulator (iOS) running.
3. For Android, ensure `adb` is in your PATH.
4. For iOS, ensure `xcrun` is available (requires Xcode).

## 📖 Documentation
- [Project Progress](./PROGRESS.md)
- [Architecture Details](./GEMINI.md)

## 📄 License
TBD

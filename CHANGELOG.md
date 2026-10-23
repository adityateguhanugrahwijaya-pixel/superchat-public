# Changelog

All notable changes to the **SuperChat** private AI workspace project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-10-23

### 🚀 Major Features & Capabilities

* **Autonomous Sandbox Agent System**:
  * Integrated multi-turn autonomous tool execution engine with native function calling and text fallback parsing.
  * Supported tools: `write_file`, `read_file`, `list_files`, `bash`, `python_run`, `node_run`, `preview_file`, and `present_files`.
  * Safe session isolation under `sandbox/{userEmail}/{chatId}/` with retention limits and idle janitor cleanup.

* **Dynamic Agent Trigger**:
  * Standard conversation queries, reasoning, and greetings (e.g. *"halo"*) use clean conversational typing/thinking UI without activating background agent banners or fake tool cards.
  * Agent loop mode and background banner only activate when the LLM explicitly executes tools.

* **Visual File Preview & Interactive In-Chat Canvas**:
  * Added `preview_file` tool to preview HTML, SVG, Markdown, code, and text files.
  * Headless screenshot rendering for HTML and SVG with automated visual context injection for vision-capable models.
  * Side-panel in-chat Canvas for syntax-highlighted code inspection, file copy, and download.

* **Admin Model Control Center (`/admin`)**:
  * Model Management dashboard with live search and capability filters (*Vision*, *Reasoning*, *Web Search*, *Large Context*).
  * 1-click toggle switches to enable or disable specific models dynamically for all users without restarting the server.
  * Capability detection badges (`👁️ Vision`, `🧠 Reasoning`, `🌐 Search`, `Context Window`).
  * 1-click **Refresh Models** button in the chat model selector.

* **Repository & Workflow Hardening**:
  * Added `.github/workflows/ci.yml` for automated TypeScript verification on push and pull requests.
  * Hardened `.github/workflows/release.yml` with comprehensive exclusion filters for archives and update bundles.
  * Untracked AI rule/guideline files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) from git to keep release trees clean.

---

## [1.0.0] - 2026-09-11

### 🚀 Major Features & Capabilities

* **SuperChat Brand & UX Overhaul**:
  * Designed modern, glassmorphic UI shell with customizable sidebar, topbar model selection, and responsive mobile header.
  * Added SuperChat purple brand mark (`SuperChatLogo`) in the top sidebar header and mobile topbar.

* **Universal LLM API Router Client**:
  * Native streaming connection to Bynara AI Router (`https://router.bynara.id/v1`), OpenAI (`api.openai.com`), DeepSeek (`api.deepseek.com`), OpenRouter, or local offline Ollama (`localhost:11434`).
  * Dynamic model fetcher (`/api/models`) with fallback support for `agnes-2.5-flash`, `deepseek-v4-flash`, `deepseek-v4-pro`, and custom BYO router endpoints.
  * Live status dot indicator and router error badge detection (formatting `429 Rate Limit`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, and `500+ Server Error` responses directly in the message stream).

* **Privacy-First Hybrid Storage Architecture**:
  * **SQLite Database (`local.db`)**: High-performance SQLite engine with WAL mode enabled (`journal_mode = WAL`) for user authentication, accounts, user settings, and system logs.
  * **File-Based Per-User Chat Store (`chats/{userEmail}/{chatId}.json`)**: Isolated JSON files per user for instant chat reading, editing, and backup.

* **Message Editing & Branching System**:
  * Inline message editor for past user messages.
  * Automatic truncation/dropping of subsequent messages in both local state and backend disk store.
  * Instant resubmission of edited messages to stream fresh assistant responses from the edit point forward.

* **Popular System Prompt Presets**:
  * Built-in prompt library (`lib/presets.ts`) featuring curated prompts:
    * 💻 **Senior Software Engineer**: Clean, modular code with concise technical explanations.
    * 🧠 **Deep Reasoning & Logic**: Step-by-step problem breakdown before delivering solutions.
    * ⚡ **Concise & Direct**: Bulleted, to-the-point answers with zero conversational filler.
    * ✍️ **Creative Copywriter**: High-impact marketing copy and persuasive content.
    * 🔬 **Academic Researcher**: Rigorous analysis, logical frameworks, and LaTeX math notation.
    * 🤖 **SuperChat Assistant**: Balanced, friendly, and versatile AI assistant.
  * Integrated preset picker grid in `/settings` (Custom Instructions tab) and in-chat settings popover.

* **Real-Time Token Usage & Activity Statistics**:
  * Live daily token consumption tracking on `/api/usage`.
  * Dynamic, non-hardcoded daily token limits tailored for varied AI model endpoints.
  * Lifetime token statistics, daily usage history table (last 14 days), and model consumption breakdown in `/settings`.

* **Web Search Grounding Engine**:
  * Built-in free web search module (`lib/websearch.ts`) leveraging Wikipedia and Wikinews APIs.
  * Toggle button in chat input bar for live web context injection.

* **Admin Workspace (`/admin`)**:
  * Restricted Control Room for administrators (`role: 'admin'`).
  * 30-day system-wide token analytics and user account management (suspensions and role elevation).

* **Automated Admin Account Bootstrap**:
  * Startup script (`lib/bootstrap-admin.ts`) that reads `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` from `.env.local` or `appconfig.json`.
  * Automatically creates or updates the admin account in SQLite (`local.db`) on application launch with hashed `scrypt` password.

* **Environment & Config Templates**:
  * Created `example.env.local` and `appconfig.json.example` templates.
  * Configured `.gitignore` to protect real credentials while keeping templates tracked.

* **Rich Chat Export**:
  * 1-click export of chat history to Markdown (`.md`), JSON (`.json`), or styled HTML (`.html`).

---

## [0.1.0] - Initial Prototype
* Initial Next.js project setup and authentication scaffolding.

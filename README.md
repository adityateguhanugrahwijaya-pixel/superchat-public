# ⚡ SuperChat

**SuperChat** is a state-of-the-art, private AI workspace and universal LLM router interface built with Next.js, SQLite, and custom API router integration. It offers a fast, glassmorphic chat UI designed for deep reasoning, software engineering, and multi-model AI workflows.

---

## ✨ Features

* 🚀 **Universal LLM Router Connection**:
  * Connects to **Bynara AI Router** (`https://router.bynara.id/v1`), **OpenAI**, **DeepSeek**, **OpenRouter**, or local **Ollama** (`http://localhost:11434/v1`).
  * Live model dropdown selector (`agnes-2.5-flash`, `deepseek-v4-flash`, `deepseek-v4-pro`, etc.).
  * Built-in HTTP router error status badges (`429 Rate Limit`, `401 Unauthorized`, `404 Not Found`, `500+`).

* 🌿 **Conversation Branching & Message Editing**:
  * Edit any previous user message in the chat stream.
  * Automatically drops all subsequent messages and resubmits the prompt to generate a fresh AI response from that point.

* 🎯 **Curated Popular Prompt Presets**:
  * Quick-apply specialized personas (*Senior Software Engineer*, *Deep Reasoning & Logic*, *Concise & Direct*, *Creative Copywriter*, *Academic Researcher*).
  * Accessible from global Settings and the in-chat settings popover.

* 🔒 **Privacy-First Hybrid Storage**:
  * **SQLite (`local.db`)**: High-speed WAL-mode SQLite database for user authentication, accounts, and system metrics.
  * **Per-User JSON Files (`chats/{email}/{id}.json`)**: Isolated chat history storage per user account for fast backup, reading, and portability.

* 📊 **Real-Time Token Usage Statistics**:
  * Track daily token usage, total lifetime tokens, and 14-day history breakdown in `/settings`.
  * Dynamic, non-hardcoded token tracking adapted for varied router limits.

* 🌐 **Free Web Search Grounding**:
  * Integrated web search powered by Wikipedia & Wikinews APIs with a 1-click toggle.

* 👤 **Account & Profile Management**:
  * Change username and password with secure `scrypt` password hashing.
  * Read-only email binding for conversation storage integrity.

* 🛡️ **Admin Workspace (`/admin`)**:
  * Dedicated Control Room for administrators.
  * System-wide 30-day usage charts and user account controls (role elevation and account suspension).

* ⚙️ **Automated Admin Account Bootstrap**:
  * Automatically creates or updates the admin account in SQLite on application startup using environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) or `appconfig.json`.

* 📄 **Multi-Format Export**:
  * Export conversations in 1-click to **Markdown (`.md`)**, **JSON**, or self-contained **HTML**.

---

## 🛠️ Technology Stack

* **Framework**: Next.js 16 (App Router)
* **Language**: TypeScript & React
* **Styling**: Vanilla CSS with Design System Tokens (`globals.css`)
* **Database**: SQLite (`better-sqlite3` with WAL mode)
* **Auth**: BetterAuth (`emailAndPassword` provider)
* **Markdown & Syntax**: `react-markdown`, `remark-gfm`, Lucide Icons

---

## 📦 Getting Started

### ⚡ 1-Click Automated Setup & Launcher (Recommended)

SuperChat includes interactive 1-click launcher scripts for **Linux**, **macOS**, and **Windows**. They automatically check dependencies, guide first-time setup with Bynara API key instructions, build, and launch the server.

* **Linux / macOS**:
  ```bash
  chmod +x start.sh
  ./start.sh
  ```

* **Windows**:
  Double-click `start.bat` or run in Command Prompt / Terminal:
  ```cmd
  start.bat
  ```

---

### Manual Setup & Installation

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/superchat.git
cd superchat
npm install
```

### 2. Configuration Setup

Copy the example environment template:

```bash
cp example.env.local .env.local
```

Or configure `appconfig.json`:

```bash
cp appconfig.json.example appconfig.json
```

#### `.env.local` Example:

```env
# Admin Bootstrap Configuration (Auto-created/updated on app startup)
ADMIN_EMAIL=admin@superchat.local
ADMIN_NAME=SuperChat Admin
ADMIN_PASSWORD=AdminPassword123!

# Custom SQLite Database File Path (Optional)
SQLITE_PATH=local.db

# Base URL (Optional)
BETTER_AUTH_URL=http://localhost:3000
```

### 3. Running the App

#### Development Mode:
```bash
npm run dev
```

#### Production Mode:
Build the production bundle (uses Webpack configuration):
```bash
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Directory Structure

```
superchat/
├── app/
│   ├── admin/             # Admin Workspace page & API
│   ├── api/               # API Routes (chat, chats, usage, user/profile, settings)
│   ├── settings/          # Account & API Router Settings page
│   ├── sign-in/           # Authentication pages
│   ├── sign-up/
│   ├── globals.css        # Core Design System CSS
│   └── page.tsx           # Home Chat UI Page
├── components/
│   └── superchat.tsx      # Main SuperChat Shell & Conversation Component
├── lib/
│   ├── auth.ts            # BetterAuth configuration
│   ├── bootstrap-admin.ts # Admin account startup bootstrap utility
│   ├── chats.ts           # JSON file-based per-user chat store
│   ├── db.ts              # SQLite database initialization & WAL mode
│   ├── presets.ts         # Popular system prompt presets library
│   └── websearch.ts       # Wikipedia/Wikinews web search grounding
├── chats/                 # Per-user chat storage directory
├── example.env.local      # Environment configuration template
├── appconfig.json.example # JSON configuration template
├── local.db               # SQLite database file
├── CHANGELOG.md           # Version release notes
└── README.md              # Project documentation
```

---

## 🔒 Security & Privacy

* Passwords are hashed using Node `scrypt` algorithm with unique 16-byte random salts.
* Chat histories are stored locally in isolated user directories (`chats/{userEmail}/`).
* Local SQLite database operates with WAL (Write-Ahead Logging) for atomic transactions.

---

## 📝 License

This project is licensed under the MIT License.

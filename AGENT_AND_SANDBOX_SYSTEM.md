# DOKUMENTASI TEKNIS SISTEM AGENT LOOP DAN SANDBOX (SUPERCHAT)

Dokumen ini disusun berdasarkan analisis langsung terhadap codebase asli project **SuperChat** (`/data/data/com.termux/files/home/lu/superchat-public`). Seluruh temuan, path file, nama fungsi/class, dan potongan kode disajikan secara akurat dan verbatim tanpa spekulasi untuk keperluan redesign sistem.

---

## 1. GAMBARAN UMUM

### Bahasa, Framework, dan LLM/Provider
- **Bahasa & Runtime**: TypeScript 5.7.3, Node.js (App Router compatible).
- **Framework Web**: Next.js 16.3.0 dengan React 19 (`react`, `react-dom`).
- **Database & Storage**:
  - SQLite via `better-sqlite3` (v12.11.1) dengan WAL mode (`lib/db.ts`) untuk tabel users, sessions, accounts, settings, dan usage logs.
  - Per-user JSON flat files di folder `chats/{safeEmail}/{chatId}.json` (`lib/chats.ts`) untuk riwayat pesan chat.
- **Autentikasi**: `better-auth` (v1.7.1) dengan adapter SQLite (`emailAndPassword`).
- **LLM Router & Provider**:
  - Antarmuka berbasis HTTP request standar OpenAI-compatible chat completions (`/v1/chat/completions`).
  - **Default Router**: Bynara AI Router (`https://router.bynara.id/v1/chat/completions`), kunci API dari env `BYNARA_API_KEY` (`app/api/chat/route.ts`).
  - **BYO (Bring Your Own) Router**: Pengguna dapat memasukkan router URL kustom (misal Ollama `http://localhost:11434/v1`, OpenAI, OpenRouter, DeepSeek) dan API key sendiri yang disimpan terenkripsi AES-256-GCM di SQLite (`lib/crypto.ts`).
  - Model default fallback: `deepseek/deepseek-chat` (`app/api/chat/route.ts`).

---

### Struktur Folder Level Atas (Tree 2 Level) dan Fungsinya

```text
.
├── app/                      # Next.js App Router (UI Pages & Route Handlers)
│   ├── [id]/                 # Halaman dynamic conversation berdasarkan chat ID
│   ├── admin/                # Admin Control Room dashboard
│   ├── api/                  # Backend API routes (chat, chats, sandbox, models, auth, settings, usage)
│   ├── settings/             # Halaman pengaturan pengguna (API keys, prompt global, preferences)
│   ├── sign-in/ & sign-up/   # Halaman autentikasi login dan register
├── components/               # Komponen UI React
│   ├── ui/                   # Primitif UI button dan form
│   ├── approval-card.tsx     # Kartu konfirmasi timeout untuk aksi berisiko tinggi
│   ├── file-card.tsx         # Kartu preview/download file hasil kerja sandbox
│   ├── side-canvas.tsx       # Drawer samping untuk viewer interaktif (PDF, CSV, HTML, Code)
│   ├── superchat.tsx         # Komponen utama antarmuka chat dan streaming
│   └── PdfViewerClient.tsx   # Client component pembaca PDF (pdfjs-dist)
├── lib/                      # Core business logic dan engine sandbox
│   ├── sandbox/              # Modul engine sandbox (executor, runtime, safety, index)
│   ├── auth.ts & session.ts  # Autentikasi server, proteksi rute, dan session handling
│   ├── chats.ts              # Engine persistensi file JSON riwayat percakapan
│   ├── crypto.ts             # Enkripsi/dekripsi AES-256-GCM untuk API key pengguna
│   ├── db.ts                 # Koneksi SQLite instance dan inisialisasi skema tabel
│   ├── presets.ts            # Daftar prompt preset persona statis
│   ├── updater.ts            # Skrip auto-updater via git
│   └── websearch.ts          # Integrasi pencarian web DuckDuckGo Lite & Wikipedia
├── scripts/                  # Skrip setup otomatis environment
│   └── setup-sandbox.js      # Pembuat venv Python (.sandbox-venv) dan installer package
├── public/                   # Asset statis, logo, dan worker pdf.worker.min.mjs
├── chats/                    # [Runtime] Folder penyimpanan file riwayat chat per user ({email}/{id}.json)
└── sandbox/                  # [Runtime] Root direktori filesystem sandbox per sesi ({email}/{id}/)
```

---

### Alur Singkat dari Pesan User sampai Jawaban Keluar

1. **Pengiriman dari Browser**: Di `components/superchat.tsx` fungsi `sendMessage()`:
   - Jika ada file yang di-upload dari UI, file dibaca via `FileReader.readAsText()` lalu teksnya di-prepend langsung ke dalam input teks prompt user.
   - Frontend melakukan HTTP POST ke `/api/chat` dengan payload JSON `{ chatId, content, model, systemPrompt, temperature, topP, maxTokens, webSearch }`.
2. **Setup di Server**: Di `app/api/chat/route.ts` fungsi `POST()`:
   - Autentikasi user dicek via `requireUser()` (`lib/session.ts`).
   - File chat diambil atau dibuat baru melalui `getChat()` / `createChatFile()` (`lib/chats.ts`).
   - Konfigurasi router & API key diambil dari SQLite.
   - Jika `webSearch` aktif, `performWebSearch(content)` (`lib/websearch.ts`) dijalankan untuk mencari ringkasan DuckDuckGo Lite dan Wikipedia.
   - System message dirakit: sandbox instructions (jika aktif) + web search grounding (jika aktif) + custom system prompt.
   - Pesan user dan placeholder pesan asisten disimpan ke file `chats/{email}/{chatId}.json`.
3. **Eksekusi Stream & Agent Loop**:
   - Server mengembalikan `ReadableStream` (`text/plain; charset=utf-8`).
   - Loop `while (turn < maxTurns)` (maksimal 12 iterasi) memanggil endpoint LLM secara streaming.
   - Token streaming di-pipe langsung ke response controller browser (`safeWrite(token)`).
   - Server memantau blok tool call (` ```tool_call ` atau `<tool_call>`).
   - Jika ditemukan, JSON tool diparse dan dijalankan di direktori sandbox via `executeSandboxTool()` (`lib/sandbox/executor.ts`).
   - Output hasil eksekusi langsung di-stream ke browser (`> ✅ Output:...`) dan diinjeksikan kembali ke array percakapan asisten sebagai pesan feedback `[System Tool Execution Feedback]`.
   - Jika ada tag `<file path="...">` yang merujuk pada file yang belum ada di disk sandbox, server menginjeksi pesan `[System File Verification Error]` dan memerintahkan LLM menulis file tersebut dengan `write_file`.
   - Loop berulang sampai tidak ada lagi tool yang dipanggil atau batas turn tercapai.
4. **Penyelesaian**:
   - Konten asisten dibersihkan dari artefak tool (`cleanAssistantContent()`).
   - Pesan final dan metadata eksekusi tool disimpan ke file JSON chat.
   - Estimasi pemakaian token dicatat ke SQLite `usage_logs`.
   - Stream ditutup (`controller.close()`). Frontend melakukan fetch sync ke `/api/chats/{chatId}` untuk memastikan state bersih.

---

## 2. AGENT LOOP

### [KODE ASLI] Fungsi/Class Inti Loop
Lokasi: `app/api/chat/route.ts` (lines 424–639) di dalam `POST()`:

```typescript
      // Run background execution loop asynchronously
      let turn = 0
      const maxTurns = sandboxActive ? 12 : 1
      let fullAssistantText = ''

      try {
        while (turn < maxTurns) {
          if (currentJob.cancel) break
          turn++

          const upstream = await fetch(endpointUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              stream: true,
              temperature,
              top_p: topP,
              max_tokens: maxTokens,
            }),
          })

          if (!upstream.ok || !upstream.body) {
            let rawDetail = ''
            try {
              const errJson = await upstream.json()
              rawDetail =
                errJson.error?.message || errJson.message || (typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson))
            } catch {
              try {
                rawDetail = await upstream.text()
              } catch {
                rawDetail = ''
              }
            }

            const cleanDetail = rawDetail ? `: ${rawDetail.trim().slice(0, 300)}` : ''
            const errorText = `[Router Error ${upstream.status}${cleanDetail}]`
            fullAssistantText += `\n\n${errorText}`
            safeWrite(`\n\n${errorText}`)
            break
          }

          let turnText = ''
          const reader = upstream.body.getReader()
          let buffer = ''

          while (true) {
            if (currentJob.cancel) break
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              const data = line.slice(5).trim()
              if (data === '[DONE]') continue
              try {
                const token = JSON.parse(data).choices?.[0]?.delta?.content || ''
                if (token) {
                  turnText += token
                  fullAssistantText += token
                  safeWrite(token)
                }
              } catch {
                /* ignore chunk parse errors */
              }
            }
          }

          // Persist progress to disk after turn tokens read
          const currentChat = getChat(user.email, chatId)
          if (currentChat) {
            const targetMsgIndex = currentChat.messages.findIndex((m) => m.id === assistantMsgId)
            if (targetMsgIndex !== -1) {
              currentChat.messages[targetMsgIndex].content = fullAssistantText
            } else {
              currentChat.messages.push({
                id: assistantMsgId,
                role: 'assistant',
                content: fullAssistantText,
                createdAt: new Date().toISOString(),
              })
            }
            currentChat.updatedAt = new Date().toISOString()
            saveChat(user.email, currentChat)
          }

          let executedTools = 0

          // Extract and execute tool calls
          const hasToolCallBlock = sandboxActive && (
            turnText.includes('```tool_call') ||
            turnText.includes('```tool') ||
            turnText.includes('<tool_call>')
          )

          if (hasToolCallBlock) {
            const toolCallRegex = /(?:```(?:tool_call|toolcall|tool)\s*([\s\S]*?)\s*```|<tool_call>\s*([\s\S]*?)\s*<\/tool_call>)/gi
            let match

            while ((match = toolCallRegex.exec(turnText)) !== null) {
              if (currentJob.cancel) break
              try {
                const jsonStr = (match[1] || match[2] || '').trim()
                const parsed = parseToolCallJson(jsonStr)

                if (parsed && parsed.tool) {
                  const toolName = parsed.tool
                  const params = parsed.params || {}

                  executedTools++
                  const execMsg = `\n\n> 🛠️ **Executing Tool:** \`${toolName}\`...\n`
                  fullAssistantText += execMsg
                  safeWrite(execMsg)

                  // Execute tool in sandbox
                  const toolResult = await executeSandboxTool(user.email, chatId, toolName, params)

                  const status = toolResult.success ? 'success' : 'failed'
                  const outputSnippet = (toolResult.output || toolResult.error || 'Command executed successfully.').trim()

                  let fileNotice = ''
                  if (toolResult.filePath) {
                    fileNotice = `\nFiles Created/Updated in Workspace: ${toolResult.filePath}`
                  }

                  // Live stream the completion status & output chunk to client immediately
                  const resultIcon = toolResult.success ? '✅' : '❌'
                  const resultHeader = toolResult.success ? 'Output' : 'Execution Error'
                  const resultMsg = `\n> ${resultIcon} **${resultHeader}:**\n\`\`\`\n${outputSnippet.slice(0, 4000)}\n\`\`\`\n\n`
                  fullAssistantText += resultMsg
                  safeWrite(resultMsg)

                  // Update chat on disk with structured tool result & clean content
                  const toolChat = getChat(user.email, chatId)
                  if (toolChat) {
                    const idx = toolChat.messages.findIndex((m) => m.id === assistantMsgId)
                    if (idx !== -1) {
                      if (!toolChat.messages[idx].toolCalls) {
                        toolChat.messages[idx].toolCalls = []
                      }
                      toolChat.messages[idx].toolCalls!.push({
                        toolName,
                        status,
                        output: outputSnippet.slice(0, 4000),
                      })

                      const cleanContent = cleanAssistantContent(fullAssistantText)
                      toolChat.messages[idx].content = cleanContent
                      toolChat.updatedAt = new Date().toISOString()
                      saveChat(user.email, toolChat)
                    }
                  }

                  // Append current assistant turn and tool output to apiMessages context
                  apiMessages.push({ role: 'assistant', content: turnText })
                  apiMessages.push({
                    role: 'user',
                    content: `[System Tool Execution Feedback]\nTool: ${toolName}\nStatus: ${toolResult.success ? 'SUCCESS' : 'FAILED'}\nOutput:\n${toolResult.output || '(none)'}\nError:\n${toolResult.error || 'none'}${fileNotice}\n\nReview the tool result above. If an error occurred or script failed, fix the code and call the next tool. If complete, summarize your work and display the file reference card <file path="filename.ext">Display Title</file>.`,
                  })
                }
              } catch {
                /* ignore unparseable block */
              }
            }
          }

          // Check for non-existent file references in <file path="..."> tags
          if (sandboxActive && !currentJob.cancel) {
            const missingFiles: string[] = []
            const validFileTagRegex = /<file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/file>/gi
            let fileMatch
            while ((fileMatch = validFileTagRegex.exec(turnText)) !== null) {
              const targetPath = fileMatch[1].trim()
              if (!targetPath) continue
              try {
                const fullPath = resolveSandboxPath(user.email, chatId, targetPath)
                if (!fs.existsSync(fullPath)) {
                  missingFiles.push(targetPath)
                }
              } catch {
                missingFiles.push(targetPath)
              }
            }

            if (missingFiles.length > 0) {
              for (const missingPath of missingFiles) {
                const stripRegex = new RegExp(`<file\\s+path=["']${missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>[\\s\\S]*?<\\/file>`, 'gi')
                fullAssistantText = fullAssistantText.replace(stripRegex, '')
              }

              apiMessages.push({ role: 'assistant', content: turnText })
              apiMessages.push({
                role: 'user',
                content: `[System File Verification Error]\nThe file(s) referenced in <file> tag(s) DO NOT exist in your workspace: ${missingFiles.map((f) => `"${f}"`).join(', ')}.\n` +
                  `You CANNOT output <file> reference cards for files that do not exist.\n` +
                  `You MUST execute the \`write_file\` tool FIRST to create the file before outputting <file path="...">Title</file>.\n\n` +
                  `Please call \`write_file\` now to create the missing file(s).`,
              })

              executedTools++
            }

            fullAssistantText = fullAssistantText.replace(/<file(?:\s+path=["']\s*["'])?\s*>[\s\S]*?<\/file>|<file\s*\/?>/gi, '')
          }

          if (!sandboxActive || executedTools === 0) {
            break
          }
        }
```

### Kondisi Berhenti, Batas Iterasi, Batas Token, dan Timeout
1. **Kondisi Berhenti**:
   - Batas iterasi tercapai (`turn >= maxTurns`).
   - Tidak ada tool yang dipanggil pada turn tersebut (`executedTools === 0`), atau sandbox tidak aktif.
   - Pembatalan oleh pengguna: `currentJob.cancel === true` (melalui `DELETE /api/chat?chatId=...` atau `POST` dengan `{ cancel: true }`).
   - Error koneksi atau HTTP status non-2xx dari router LLM (`!upstream.ok`).
2. **Batas Iterasi**:
   - Jika sandbox aktif: `maxTurns = 12` (`app/api/chat/route.ts#L426`).
   - Jika sandbox nonaktif: `maxTurns = 1`.
3. **Batas Token**:
   - Parameter `maxTokens` dibatasi antara 256 sampai 32.768 token:
     `Math.min(32768, Math.max(256, Math.floor(Number(body.maxTokens ?? 4096))))` (`app/api/chat/route.ts#L254`).
4. **Timeout**:
   - **Timeout Agent Loop Global**: **TIDAK ADA**. Loop berjalan selama koneksi HTTP client tetap terbuka dan iterasi belum habis.
   - **Timeout Perintah Tool**: Dibatasi di `lib/sandbox/executor.ts#L18-L19`:
     - `SCRIPT_TIMEOUT_MS = 120_000` (120 detik untuk `run_python` dan `run_node`).
     - `COMMAND_TIMEOUT_MS = 120_000` (120 detik untuk `execute_command`).

### Cara Tool Call Diparse dan Dieksekusi
- **Parsing**: Menggunakan fungsi `parseToolCallJson(rawStr)` (`app/api/chat/route.ts#L113-L199`) dengan 3 tahap:
  1. `JSON.parse` langsung terhadap teks di dalam tag.
  2. Sanitasi newline (`\n`), tab (`\t`), carriage return (`\r`) literal tanpa escape di dalam string JSON, lalu `JSON.parse`.
  3. Regex fallback jika model menghasilkan teks non-JSON (mencocokkan pola `"tool": "..."` dan `"code": "..."`).
- **Urutan Eksekusi**: **Berurutan (Sequential)**. Loop `while ((match = toolCallRegex.exec(turnText)) !== null)` menunggu `await executeSandboxTool(...)` selesai sebelum memproses tool call berikutnya.

### Cara Hasil Tool Dimasukkan Kembali ke Riwayat Pesan
Hasil eksekusi dimasukkan ke memori context array `apiMessages` (`app/api/chat/route.ts#L584-L589`):
1. Menambahkan output giliran asisten: `{ role: 'assistant', content: turnText }`.
2. Menambahkan hasil tool sebagai pesan user sistem:
   ```text
   [System Tool Execution Feedback]
   Tool: <toolName>
   Status: SUCCESS | FAILED
   Output:
   <toolResult.output>
   Error:
   <toolResult.error>
   [Files Created/Updated in Workspace: ...]

   Review the tool result above. If an error occurred or script failed, fix the code and call the next tool. If complete, summarize your work and display the file reference card <file path="filename.ext">Display Title</file>.
   ```

### Cara Error LLM dan Error Tool Ditangani
- **Error LLM**:
  - Jika router upstream mengembalikan non-200 atau body stream null, respon error diparse (JSON atau teks), diformat menjadi `[Router Error <status>: <detail>]`, di-stream ke browser, lalu loop **berhenti (`break`)**.
  - **TIDAK ADA mekanisme auto-retry atau fallback provider LLM**.
- **Error Tool**:
  - Error eksekusi tool (exit code non-zero, syntax error, missing package) tidak melempar HTTP exception, melainkan menghasilkan `{ success: false, output: ..., error: ... }`.
  - Pesan error dikirimkan kembali ke LLM di pesan `[System Tool Execution Feedback]` agar LLM dapat mengoreksi kode pada iterasi berikutnya.

---

## 3. SYSTEM PROMPT

### [KODE ASLI] Seluruh System Prompt dan Perakitan Dinamis
Lokasi perakitan: `app/api/chat/route.ts` (lines 315–373):

```typescript
  // Build system message capabilities
  const capabilityPrompts: string[] = []

  if (isUserSandboxEnabled(user.id)) {
    capabilityPrompts.push(
      `[System Workspace & Autonomous Sandbox Tool Capabilities]\n` +
        `You are SuperChat AI, an autonomous coding partner equipped with an active isolated sandbox workspace for this conversation.\n\n` +
        `CRITICAL FILE & TOOL RULES:\n` +
        `1. AUTONOMOUS TOOL CALLING: You can execute tools inside the sandbox directory. To execute a tool, output a JSON block wrapped in \`\`\`tool_call ... \`\`\` as follows:\n` +
        `\`\`\`tool_call\n` +
        `{\n` +
        `  "tool": "tool_name",\n` +
        `  "params": {\n` +
        `    "key": "value"\n` +
        `  }\n` +
        `}\n` +
        `\`\`\`\n` +
        `AVAILABLE TOOLS & FORMATS:\n` +
        `- run_python: {"tool": "run_python", "params": {"code": "python code..."}} (runs python script in sandbox)\n` +
        `- run_node: {"tool": "run_node", "params": {"code": "js code..."}} (runs nodejs script in sandbox)\n` +
        `- execute_command: {"tool": "execute_command", "params": {"command": "shell command..."}} (e.g. "pip install pkg" or "python script.py")\n` +
        `- write_file: {"tool": "write_file", "params": {"path": "filename.ext", "content": "..."}} (write or overwrite file in sandbox)\n` +
        `- read_file: {"tool": "read_file", "params": {"path": "filename.ext"}} (read file contents)\n` +
        `- edit_file: {"tool": "edit_file", "params": {"path": "filename.ext", "target": "old text", "replacement": "new text"}}\n` +
        `- list_dir: {"tool": "list_dir", "params": {"path": "."}} (list directory items)\n` +
        `- delete_file: {"tool": "delete_file", "params": {"path": "filename.ext"}}\n\n` +
        `2. RELATIVE PATHS ONLY:\n` +
        `- Always create and write files using simple relative filenames in the current directory (e.g. "proposal.pdf" or "app.py").\n` +
        `- NEVER use '/mnt/data/', '/tmp/', '/root/', or absolute paths! They will fail.\n\n` +
        `3. AGENTIC EXECUTION & RECOVERY:\n` +
        `- When creating files, scripts, documents, or running code: FIRST call write_file, run_python, run_node, or execute_command.\n` +
        `- If a tool execution fails or returns an error (e.g., SyntaxError, Missing Module), inspect the error output, fix your code, or run missing setup commands, and call the tool again.\n` +
        `- Continue iterating autonomously in a loop until the file or code runs cleanly.\n\n` +
        `4. FILE REFERENCING (<file path="...">Title</file>):\n` +
        `- Markdown code blocks: Use standard \`\`\`python ... \`\`\` for showing code directly in chat text.\n` +
        `- <file path="filename.ext">Display Title</file>: The <file> tag is STRICTLY a reference card to point to an ACTUAL existing file in the sandbox workspace.\n` +
        `- STRICT 5-WORD LIMIT: The title inside <file> tag MUST BE 5 WORDS OR FEWER (e.g. <file path="app.py">Main Script</file>). NEVER place code, script contents, or text longer than 5 words inside <file> tags. Titles exceeding 5 words will be automatically rejected and sanitized.\n` +
        `- ONLY output a <file> tag AFTER the file has actually been written/created in the sandbox workspace.`
    )
  }

  if (enableWebSearch) {
    capabilityPrompts.push(
      `[Web Search Status: ACTIVE]\n` +
        `Live Web Search Grounding is ENABLED. You have access to real-time internet search context.\n` +
        `CRITICAL CITATION MANDATE: You MUST cite your references using markdown links like [Source Title](URL) directly in your response text. Always include clickable markdown links [Title](URL) for every source you use.`
    )
    if (searchGroundingPrompt) {
      capabilityPrompts.push(searchGroundingPrompt)
    }
  }

  const effectiveSystemPrompt = chat.systemPrompt || settings?.globalSystemPrompt || ''
  if (effectiveSystemPrompt) {
    capabilityPrompts.push(effectiveSystemPrompt)
  }

  const systemMessage = capabilityPrompts.map((text) => ({ role: 'system', content: text }))
```

Format template Web Search Grounding yang dirakit dinamis di `lib/websearch.ts` (lines 152–161):
```typescript
    formattedContext = `[REAL-TIME WEB SEARCH GROUNDING CONTEXT FOR "${cleanQuery}"]\n\n`
    results.forEach((item, index) => {
      formattedContext += `[Source ${index + 1}] Title: ${item.title}\nURL: ${item.url}\nSnippet: ${item.snippet}\n\n`
    })
    formattedContext +=
      `STRICT CITATION MANDATE:\n` +
      `- You MUST incorporate information from the web search results above.\n` +
      `- You MUST cite your references using markdown links like [Source Title](URL) directly in your response.\n` +
      `- Always include clickable markdown links [Title](URL) for the sources you use so the user can verify them.`
```

### Penjelasan Bagian Statis vs Dinamis (Runtime)
- **Statis**:
  - Teks deskripsi format `tool_call` JSON dan panduan aturan sandbox (4 poin aturan file & tools).
  - Teks header mandat sitasi web search (`[Web Search Status: ACTIVE]...`).
- **Dinamis (Runtime)**:
  - Blok instruksi sandbox hanya dimasukkan jika `isUserSandboxEnabled(user.id)` bernilai `true`.
  - Blok grounding web search (`searchGroundingPrompt`) hanya dimasukkan jika tombol web search aktif pada request dan hasil scraping mengembalikan data.
  - `effectiveSystemPrompt`: Diambil dari `chat.systemPrompt` (spesifik per percakapan) atau fallback ke `settings.globalSystemPrompt` (dari database SQLite per user).

---

## 4. DEFINISI TOOL

### [KODE ASLI] Schema Semua Tool
SuperChat **TIDAK MENGGUNAKAN** skema JSON Schema OpenAI Tools API (`tools: [...]`), melainkan skema berbasis teks murni di dalam prompt asisten (`app/api/chat/route.ts#L332-L340`):

```text
AVAILABLE TOOLS & FORMATS:
- run_python: {"tool": "run_python", "params": {"code": "python code..."}} (runs python script in sandbox)
- run_node: {"tool": "run_node", "params": {"code": "js code..."}} (runs nodejs script in sandbox)
- execute_command: {"tool": "execute_command", "params": {"command": "shell command..."}} (e.g. "pip install pkg" or "python script.py")
- write_file: {"tool": "write_file", "params": {"path": "filename.ext", "content": "..."}} (write or overwrite file in sandbox)
- read_file: {"tool": "read_file", "params": {"path": "filename.ext"}} (read file contents)
- edit_file: {"tool": "edit_file", "params": {"path": "filename.ext", "target": "old text", "replacement": "new text"}}
- list_dir: {"tool": "list_dir", "params": {"path": "."}} (list directory items)
- delete_file: {"tool": "delete_file", "params": {"path": "filename.ext"}}
```

Set nama tool yang dikenal di sistem terdaftar di `app/api/chat/route.ts#L13-L23`:
```typescript
const KNOWN_TOOLS = new Set([
  'run_python',
  'run_node',
  'execute_command',
  'run_shell',
  'write_file',
  'read_file',
  'edit_file',
  'list_dir',
  'delete_file',
])
```

---

### Detail untuk Setiap Tool

Implementasi lengkap berada di `lib/sandbox/executor.ts` (lines 206–514) fungsi `executeSandboxTool`:

1. **`read_file`**
   - **Yang Dijalankan**: Membaca file dengan `fs.readFileSync(fullPath, 'utf-8')`. Jika path berupa folder atau `.` / `./`, menjalankan listing folder dengan `fs.readdirSync`.
   - **Format Output**: String isi file mentah atau listing direktori: `📁 Workspace Directory Listing (N items):\n[DIR/FILE] <name>`.
   - **Batas Output**: Tidak ada pemotongan di executor internal.

2. **`write_file`**
   - **Yang Dijalankan**: Memastikan direktori target ada (`fs.mkdirSync(parentDir, { recursive: true })`), lalu menulis/menimpa isi file (`fs.writeFileSync(fullPath, content, 'utf-8')`). Menolak jika target adalah direktori yang sudah ada.
   - **Format Output**: `Successfully written <bytes> bytes to <relPath>`.
   - **Batas Output**: Tidak ada pembatasan byte saat penulisan file ke disk.

3. **`edit_file`**
   - **Yang Dijalankan**: Mencari substring `target` dalam file dan menggantinya dengan `replacement`. Mendukung opsi `replaceAll`. Jika target tidak cocok secara exact, mencoba mencocokkan `target.trim()`. Jika target kosong, mengganti seluruh isi file. Jika tidak ketemu, mengembalikan pesan error dengan preview 10 baris pertama file.
   - **Format Output**: `Successfully edited <relPath> (Replaced X occurrence(s)...)`.
   - **Batas Output**: Target yang dicari pada pesan error dipotong maksimal 300 karakter: `target.slice(0, 300)`.

4. **`list_dir`**
   - **Yang Dijalankan**: Membaca isi folder dengan `fs.readdirSync(fullPath, { withFileTypes: true })`.
   - **Format Output**: Baris daftar file/direktori: `[DIR] <name>` atau `[FILE] <name>`, atau string `(empty directory)`.
   - **Batas Output**: Tidak ada pemotongan jumlah file.

5. **`delete_file`**
   - **Yang Dijalankan**: Menghapus file atau folder target via `fs.rmSync(fullPath, { recursive: true, force: true })`.
   - **Format Output**: `Deleted <filePath>` atau `File not found: <filePath>`.

6. **`run_python`**
   - **Yang Dijalankan**:
     - Memeriksa ketersediaan interpreter Python melalui `detectPython()` (`lib/sandbox/runtime.ts#L99`).
     - Mengubah prefix absolut LLM (`/tmp`, `/mnt/data`, `/workspace`) menjadi relative path `.`.
     - Menyimpan kode ke file sementara: `_temp_${Date.now()}_${random}.py`.
     - Menjalankan via `exec(command, { cwd: sandboxDir, timeout: 120_000, maxBuffer: 50MB, env })` dengan environment tersanitasi + `PYTHONUNBUFFERED=1`, `PYTHONIOENCODING=utf-8`, `MPLBACKEND=Agg`.
     - Menghapus file `_temp_...py` di callback eksekusi.
     - Mengambil snapshot file sebelum & sesudah eksekusi (`snapshotSandboxFiles`) untuk mendeteksi file yang baru dibuat atau diubah.
   - **Format Output**:
     - Output gabungan stdout & stderr.
     - Tambahan daftar file baru: `\n\n📁 **Workspace Files Created/Updated:**\n- ...`.
     - Jika ada `ModuleNotFoundError`, menyertakan saran perintah: `Missing Python package '<pkg>'. Use execute_command tool: {"command": "... -m pip install <pkg>"}`.
   - **Batas Ukuran Output**:
     - Buffer `child_process.exec`: `MAX_BUFFER_BYTES = 50 * 1024 * 1024` (50 MB).
     - Pemotongan string yang dikirim ke LLM (`lib/sandbox/executor.ts#L106-L111`): `MAX_OUTPUT_CHARS = 200_000` karakter melalui fungsi `clipOutput` (memotong bagian tengah teks dan menyisakan awal serta akhir).

7. **`run_node`**
   - **Yang Dijalankan**: Menulis kode ke `_temp_${Date.now()}_${random}.js`, lalu mengeksekusi `node "<tempFile>"` di `sandboxDir` dengan timeout 120 detik.
   - **Format Output & Batas**: Identik dengan `run_python` (dipotong via `clipOutput` jika > 200.000 karakter).

8. **`execute_command` / `run_shell`**
   - **Yang Dijalankan**:
     - Memeriksa safety via `assessToolSafety(toolName, params)` (`lib/sandbox/safety.ts#L50`). Jika diblokir (`blocked: true`), perintah ditolak langsung.
     - Menjalankan perintah shell via `child_process.exec(command, { cwd: sandboxDir, timeout: 120_000, maxBuffer: 50MB, env: getChildEnv() })`.
   - **Format Output**: Gabungan stdout dan stderr + daftar file baru yang terdeteksi di workspace.
   - **Batas Ukuran Output**: Dipotong dengan `clipOutput()` jika melebihi 200.000 karakter.

---

## 5. LAYER EKSEKUSI SANDBOX (ANTARMUKA EKSEKUSI)

### Bagaimana Perintah Bash Dikirim dan Hasilnya Dikembalikan
- **Eksekusi**: Menggunakan fungsi bawaan Node.js `child_process.exec` (`lib/sandbox/executor.ts#L477-L509`):
  ```typescript
  exec(command, { cwd: sandboxDir, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES, env: getChildEnv() }, (err, stdout, stderr) => { ... })
  ```
- **Nilai Kembalian**: Berupa promise bertipe `ToolExecutionResult` (`lib/sandbox/executor.ts#L7-L13`):
  ```typescript
  export type ToolExecutionResult = {
    success: boolean
    output: string
    error?: string
    filePath?: string
    fileTitle?: string
  }
  ```
  - `success`: `true` jika proses selesai dengan exit code 0 (`!err`). `false` jika exit code non-zero, timeout, atau melebihi buffer.
  - `output`: Gabungan `[stdout, stderr].filter(Boolean).join('\n')` yang dipotong melalui `clipOutput()`.
  - `filePath`: Path relatif dari file pertama yang baru dibuat/diubah (jika ada).

### Apakah State Persisten Antar Perintah?
- **Working Directory**: **TIDAK PERSISTEN**. Setiap pemanggilan `exec` selalu memulai proses baru dengan `cwd: sandboxDir`. Perintah `cd subfolder` tidak akan memengaruhi pemanggilan tool berikutnya.
- **Environment Variables**: **TIDAK PERSISTEN**. Perintah export variabel (misal `export MY_VAR=123`) hilang setelah proses selesai. Setiap pemanggilan menggunakan `getChildEnv()` baru.
- **Proses Background**: **TIDAK DIDUKUNG**. `exec` menunggu child process selesai. Menjalankan proses daemon di background (seperti `server &`) akan membuat Node menunggu sampai timeout 120s tercapai atau pipe stdio tertutup.
- **Filesystem**: **PERSISTEN**. Semua file yang ditulis ke dalam direktori sandbox (`sandbox/{safeEmail}/{chatId}/`) tetap berada di disk antar giliran eksekusi.

### Timeout Perintah dan Penanganan Perintah Menggantung
- Batas waktu per perintah: `120_000` ms (2 menit).
- Saat proses melewati 120 detik, Node.js mengirim sinyal kill (`SIGTERM` kemudian `SIGKILL`).
- Objek `err` terisi properti `killed: true`, dan fungsi `describeExecError()` (`lib/sandbox/executor.ts#L119-L130`) menghasilkan pesan:
  `⏱️ The process was killed after hitting the 120s time limit. Make the script faster or split the work into steps.`

### Struktur Direktori di Dalam Sandbox & Izin
- **Lokasi Path**: `{SANDBOX_ROOT}/{safeEmail}/{conversationId}/` (`lib/sandbox/index.ts#L20-L28`).
  - Default `SANDBOX_ROOT`: `<project_root>/sandbox` (bisa di-override lewat env `SANDBOX_ROOT`).
- **Writable vs Read-only**: Seluruh direktori sandbox percakapan adalah **writable** oleh user server (karena berjalan langsung di host OS dengan UID server Node.js).
- **Proteksi Boundary**: Fungsi `resolveSandboxPath()` (`lib/sandbox/index.ts#L43-L76`) memverifikasi bahwa target path tidak keluar dari folder sesi chat:
  ```typescript
  const rel = path.relative(sandboxDir, resolvedPath)
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`Security Violation: Access denied outside sandbox boundary (${targetPath})`)
  }
  ```

### Aturan Jaringan
- **TIDAK ADA ALLOWLIST / TIDAK ADA PEMBATASAN JARINGAN**.
- Karena eksekusi langsung di mesin host tanpa namespace jaringan atau container isolasi, proses shell / Python / Node memiliki akses internet penuh sesuai konektivitas mesin host (bisa melakukan `curl`, `pip install`, request HTTP eksternal).

### Lifecycle Sandbox
- **Dibuat**: Otomatis dibuat saat pertama kali folder diakses oleh tool via `fs.mkdirSync(dir, { recursive: true })` di `lib/sandbox/index.ts#L25`.
- **Dihancurkan**: **TIDAK PERNAH DIHANCURKAN SECARA OTOMATIS**. File tetap ada di disk. Menghapus chat dari UI hanya menghapus file JSON riwayat di `chats/`, **TIDAK menghapus folder sandbox** di `sandbox/`.
- **Isolasi**: Terisolasi per sesi chat per user (`sandbox/{userEmail}/{chatId}/`).

---

## 6. FILE HANDLING

### Bagaimana Upload User Masuk ke Sandbox
- **Alur Kode**: Di `components/superchat.tsx` (lines 647–660) fungsi `handleFileUpload()`:
  - File dibaca di browser dengan `reader.readAsText(file)` ke state `attachedFile`.
  - Di fungsi `sendMessage()` (`components/superchat.tsx#L688-L690`):
    ```typescript
    if (attachedFile) {
      text = `[Attached File: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\`\n\n${text}`
      setAttachedFile(null)
    }
    ```
- **Kondisi Nyata**: **Upload user TIDAK masuk langsung ke filesystem sandbox**. Konten file hanya ditempelkan sebagai teks di pesan prompt user. Jika file perlu ditulis ke disk sandbox, LLM harus secara sadar memanggil tool `write_file`. File biner (PDF, gambar, zip, excel) akan mengalami kerusakan data (corrupted) karena dibaca sebagai teks biasa (`readAsText`).

### Bagaimana File Hasil Keluar dari Sandbox ke User
1. Skrip menulis file ke direktori kerja menggunakan path relatif.
2. Di `lib/sandbox/executor.ts` (lines 70–80) fungsi `detectNewOrModifiedFiles()` mendeteksi file yang dibuat dan menyertakannya di output tool.
3. LLM merujuk file tersebut dengan tag: `<file path="namafile.ext">Judul File</file>`.
4. Server memverifikasi keberadaan file di disk sebelum mengizinkan tag tersebut keluar (`app/api/chat/route.ts#L601-L634`).
5. Frontend me-render komponen `<FileCard>` (`components/file-card.tsx#L49`) yang menyediakan link download:
   `/api/sandbox/file?chatId=${chatId}&path=${path}&download=1`.
6. Endpoint `GET /api/sandbox/file` (`app/api/sandbox/file/route.ts#L63-L167`) menyajikan file dengan MIME type yang sesuai dan header `Content-Disposition`.

### Apakah Ada Konsep "File Final" vs "File Kerja"?
- **TIDAK ADA pemisahan folder atau status eksplisit di backend**.
- Semua file diletakkan di root folder sandbox yang sama.
- Secara konvensi:
  - File dengan prefix `_temp_` dianggap file kerja internal runner dan otomatis dihapus.
  - File yang ditandai dengan tag `<file path="...">` oleh LLM dianggap sebagai artefak final yang dipersembahkan kepada pengguna.

### Bagaimana File Ditampilkan di Frontend
- Di dalam chat thread: Dirender sebagai card kecil `<FileCard>` (`components/file-card.tsx`) dengan icon berdasarkan ekstensi file.
- Saat tombol card diklik, membuka panel laci kanan `<SideCanvas>` (`components/side-canvas.tsx#L47`):
  - **PDF**: Dirender menggunakan component client viewer PDF (`PdfViewerClient.tsx` via `pdfjs-dist`).
  - **Excel / CSV (`.xlsx`, `.xls`, `.csv`)**: Server mem-parse sheet pertama menggunakan library `xlsx` (`app/api/sandbox/file/route.ts#L100-L119`) saat query `?parse=1`, dan canvas me-rendernya sebagai tabel HTML interaktif dengan filter pencarian baris.
  - **Gambar (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`)**: Dirender via tag `<img>`.
  - **HTML (`.html`, `.htm`)**: Dirender di dalam `<iframe>` dengan proteksi CSP sandbox `sandbox allow-scripts`.
  - **Markdown (`.md`)**: Dirender dengan `react-markdown` dan `remark-gfm`.
  - **Kode/Teks lainnya**: Dirender di dalam elemen `<pre>` dengan tombol copy to clipboard.

---

## 7. SKILL / INSTRUKSI TAMBAHAN

- **Apakah ada mekanisme untuk memuat instruksi tambahan per jenis tugas (mirip skill, plugin, atau prompt template)?**:
  - Terdapat mekanisme **Prompt Preset Persona** statis yang dapat dipilih user di UI atau diset secara global.
  - **TIDAK ADA sistem plugin dinamis atau skill loader otomatis berbasis deteksi jenis tugas** (seperti pemuatan otomatis folder skill atau function injection kondisional per intent).

### [KODE ASLI] Definisi dan Cara Dimuat
Daftar Preset Persona di `lib/presets.ts` (lines 9–52):

```typescript
export const POPULAR_PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'expert-developer',
    title: 'Senior Software Engineer',
    tag: 'Coding',
    description: 'Writes clean, production-ready, modular code with concise technical explanations.',
    prompt: 'You are an elite Senior Full-Stack Software Engineer and System Architect. Write clean, modular, production-ready code with concise explanations. Prioritize best practices, modern design patterns, and zero conversational fluff.'
  },
  {
    id: 'deep-thinker',
    title: 'Deep Reasoning & Logic',
    tag: 'Analysis',
    description: 'Breaks down complex topics step-by-step before delivering structured solutions.',
    prompt: 'Approach every query with thorough step-by-step reasoning. Break complex problems into smaller logical components, state assumptions explicitly, and present structured, well-analyzed solutions.'
  },
  {
    id: 'concise-direct',
    title: 'Concise & Direct',
    tag: 'Productivity',
    description: 'Delivers bulleted, to-the-point answers with zero pleasantries or filler.',
    prompt: 'Provide direct, to-the-point answers without conversational filler, intros, or redundant summaries. Use bullet points and clean code blocks wherever appropriate.'
  },
  {
    id: 'creative-writer',
    title: 'Creative Copywriter',
    tag: 'Writing',
    description: 'Crafts persuasive, engaging, and beautifully formatted content & marketing copy.',
    prompt: 'You are a master creative writer and marketing strategist. Craft engaging, persuasive, and beautifully styled content tailored for maximum reader engagement and impact.'
  },
  {
    id: 'academic-researcher',
    title: 'Academic Researcher',
    tag: 'Research',
    description: 'Analyzes topics with academic rigor, structured frameworks, and references.',
    prompt: 'Analyze topics with academic rigor, structural clarity, and logical precision. Reference empirical principles, sound methodologies, and use LaTeX math notation when explaining formulas.'
  },
  {
    id: 'default-assistant',
    title: 'SuperChat Assistant',
    tag: 'General',
    description: 'Balanced, helpful, friendly, and versatile AI assistant for general tasks.',
    prompt: 'You are SuperChat, a powerful, versatile, and friendly AI assistant. Help the user achieve their goal with clear, accurate, and structured responses.'
  }
]
```

Cara dimuat ke dalam percakapan di `app/api/chat/route.ts` (lines 367–373):
```typescript
  const effectiveSystemPrompt = chat.systemPrompt || settings?.globalSystemPrompt || ''
  if (effectiveSystemPrompt) {
    capabilityPrompts.push(effectiveSystemPrompt)
  }

  const systemMessage = capabilityPrompts.map((text) => ({ role: 'system', content: text }))
```
Dipicu ketika pengguna memilih preset di UI popover (`components/superchat.tsx#L677-L681`), yang kemudian meng-update properti `chat.systemPrompt` di file JSON riwayat chat.

---

## 8. MANAJEMEN KONTEKS

### Bagaimana Riwayat Pesan Disimpan dan Dipotong/Diringkas
- **Penyimpanan**: Disimpan di file JSON per percakapan di `chats/{userEmail}/{chatId}.json` dengan tipe `ChatData` (`lib/chats.ts#L12-L22`).
- **Pemotongan Otomatis / Summarization**: **TIDAK ADA**.
  - Di `app/api/chat/route.ts` (lines 374–376):
    ```typescript
    const history = chat.messages.map((m) => ({ role: m.role, content: m.content }))
    const apiMessages = [...systemMessage, ...history, { role: 'user', content }]
    ```
  - Seluruh riwayat percakapan dikirim secara penuh tanpa algoritma sliding window, truncating, ataupun peringkasan otomatis.
- **Pemotongan Manual (Branching)**: Satu-satunya mekanisme pemotongan riwayat adalah jika user mengedit pesan lama di UI (`components/superchat.tsx#L804-L826`), di mana semua pesan setelah indeks tersebut dipotong (`messages.slice(0, index)`).

### Bagaimana Output Tool yang Besar Ditangani
1. **Di Lapisan Sandbox Executor** (`lib/sandbox/executor.ts#L106-L111`):
   ```typescript
   function clipOutput(text: string): string {
     if (text.length <= MAX_OUTPUT_CHARS) return text
     const half = Math.floor(MAX_OUTPUT_CHARS / 2)
     const omitted = text.length - MAX_OUTPUT_CHARS
     return `${text.slice(0, half)}\n\n... [${omitted} characters omitted] ...\n\n${text.slice(-half)}`
   }
   ```
   Teks output maksimal dibatasi `MAX_OUTPUT_CHARS = 200_000` karakter. Jika lebih panjang, bagian tengah dipotong dan disisipi notifikasi jumlah karakter yang diabaikan.
2. **Di Tampilan Chat dan Objek `toolCalls` di Disk** (`app/api/chat/route.ts#L559, L574`):
   Output yang ditampilkan pada UI dan disimpan di array `toolCalls` chat dipotong maksimal 4.000 karakter: `outputSnippet.slice(0, 4000)`. Namun di context LLM (`apiMessages` line 588), output dimasukkan utuh (hingga batas 200k karakter dari `clipOutput`).
3. **Di Serving File Preview** (`app/api/sandbox/file/route.ts#L12`):
   File teks yang di-parse via endpoint `?parse=1` dibatasi maksimal `MAX_PARSE_BYTES = 5 * 1024 * 1024` (5 MB) melalui fungsi `readTextSlice()`.

### Ada Penghitungan Token atau Tidak
- **TIDAK ADA tokenizer nyata (seperti BPE / tiktoken)** sebelum pengiriman ke upstream LLM.
- **Estimasi Heuristik Pasca-Respons**: Di `app/api/chat/route.ts` (lines 689–693), setelah loop selesai, token diestimasi dengan rumus panjang karakter dibagi 4:
  ```typescript
  const estimatedTokens = Math.max(1, Math.ceil((content.length + fullAssistantText.length) / 4))
  db.prepare(
    `INSERT INTO usage_logs (id, user_id, usage_date, tokens_used, model, router_url) VALUES (?, ?, DATE('now'), ?, ?, ?)`
  ).run(crypto.randomUUID(), user.id, estimatedTokens, model, activeRouterUrl)
  ```

---

## 9. STREAMING DAN FRONTEND

### Protokol ke Frontend
1. **Raw Text ReadableStream (Chunked HTTP)**:
   - Endpoint `/api/chat` mengembalikan `new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })` (`app/api/chat/route.ts#L711-L717`).
   - **Bukan format SSE standar (`text/event-stream`)**, melainkan plain text stream di mana token teks dan teks notifikasi tool di-pipe langsung secara berkelanjutan.
2. **Polling Sinkronisasi**:
   - Di `components/superchat.tsx` (lines 555–594), frontend menjalankan `setInterval` setiap 1.800 ms (1,8 detik) memanggil `GET /api/chats/${activeId}` untuk menyinkronkan status `isAgentRunning` jika proses berjalan di background.

### Jenis Event yang Dikirim
Karena menggunakan raw text stream tanpa pembungkus JSON event, semua status dikirim dalam format markdown text:
- **Teks Biasa**: Token kata dari LLM langsung dikirimkan ke stream.
- **Indikator Tool Call**: Dikirim dalam format markdown quote: `\n\n> 🛠️ **Executing Tool:** \`${toolName}\`...\n`.
- **Hasil Tool**: Dikirim dalam format blockquote: `\n> ✅ **Output:**\n\`\`\`\n<output>\n\`\`\`\n\n`.
- **File Reference**: Dikirim sebagai tag khusus `<file path="...">Judul</file>`.
- Frontend mendeteksi tag `<file>` dan tool block via regex untuk dirender menjadi card interaktif terpisah (`components/superchat.tsx#L1272-L1327`).

---

## 10. KEAMANAN DAN BATASAN

### Validasi Input dan Path Traversal
- Fungsi `resolveSandboxPath()` di `lib/sandbox/index.ts` (lines 43–76):
  - Membersihkan prefix absolut umum (`/tmp/`, `/mnt/data/`, `/root/`, dll.).
  - Menghitung path relatif dari `sandboxDir` ke target path menggunakan `path.relative()`.
  - Jika path hasil kalkulasi berawal dari `..` atau bersifat absolut, sistem melempar `Security Violation: Access denied outside sandbox boundary`.

### Pembatasan Perintah Shell
Di `lib/sandbox/safety.ts` (lines 15–33), fungsi `assessToolSafety()` memblokir perintah tertentu menggunakan regex:
- Perintah eskalasi privilese: `sudo`, `su`, `su root`, `doas`, `pkexec`, `runas`.
- Perintah shutdown/reboot: `shutdown`, `reboot`, `poweroff`.
- Izin file: `chmod 777`.
- Penulisan ke perangkat disk mentah: `> /dev/sd*`, `> /dev/hd*`, `> /dev/nvme*`.

### Penanganan Secret
- Di `lib/sandbox/executor.ts` (lines 27–35), fungsi `getChildEnv()` memfilter variabel lingkungan sebelum dioperkan ke proses script:
  ```typescript
  const blocked = /(SECRET|PASSWORD|PASSWD|API_?KEY|TOKEN|ADMIN_|BETTER_AUTH|PRIVATE_KEY|CREDENTIAL)/i
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV }
  for (const [key, value] of Object.entries(process.env)) {
    if (!blocked.test(key)) env[key] = value
  }
  return applyVenvToEnv(env)
  ```
  Ini mencegah skrip buatan LLM membaca variabel seperti `BYNARA_API_KEY`, `ADMIN_PASSWORD`, atau `BETTER_AUTH_SECRET`.
- BYO API Key dienkripsi di SQLite menggunakan AES-256-GCM (`lib/crypto.ts`).

### Content Security Policy (CSP) untuk File Inline
- Di `app/api/sandbox/file/route.ts` (lines 153–155):
  Jika file berekstensi `.html`, `.htm`, atau `.svg` dibuka secara inline, server menyematkan header:
  `Content-Security-Policy: sandbox allow-scripts`
  Ini memberikan origin opaque pada iframe sehingga skrip di dalam file HTML buatan AI tidak dapat mengakses cookie session atau memanggil API SuperChat atas nama user.

### Perlindungan Terhadap Prompt Injection
- **TIDAK ADA**. Tidak terdapat layer sanitasi input, evaluasi guardrails, atau klasifikasi prompt injection. Prompt user dan teks hasil pencarian web langsung dimasukkan apa adanya ke dalam context LLM.

---

## 11. MASALAH YANG TERLIHAT (FINDINGS DARI KODE)

Berikut daftar kelemahan, bug nyata, dead code, dan kerapuhan yang ditemukan di dalam kode:

1. **Dead Code / Mekanisme Approval Aksi Destruktif Tidak Berfungsi di Agent Loop**:
   - **Path**: `lib/sandbox/safety.ts#L65-L84`, `lib/sandbox/executor.ts#L464-L472`, `app/api/chat/route.ts#L546`, `components/superchat.tsx#L412-L467`.
   - **Masalah**: `safety.ts` menetapkan `requiresApproval: true` untuk perintah `delete_file` atau `rm`. Endpoint terpisah `/api/sandbox` menghormati flag ini. Namun pada agent loop utama di `app/api/chat/route.ts`, eksekusi tool memanggil `executeSandboxTool` secara langsung, dan di dalam `executeSandboxTool` hanya `safety.blocked` yang dicek. Di frontend (`superchat.tsx`), state `pendingApproval` dan komponen `ApprovalCard` tersedia, tetapi `setPendingApproval` tidak pernah dipanggil saat streaming dari `/api/chat`. Akibatnya, perintah destruktif dieksekusi tanpa konfirmasi user.

2. **Sandbox Berjalan Langsung di Host OS Tanpa Isolasi Container/Virtualisasi**:
   - **Path**: `lib/sandbox/executor.ts#L148-L151, L477-L480`.
   - **Masalah**: Eksekusi menggunakan `child_process.exec` langsung pada mesin host dengan identitas proses server Next.js. Walaupun path tools divalidasi, tool `execute_command` dapat menjalankan perintah shell apa saja di host (misalnya membaca file project, melihat daftar proses host, atau mengonsumsi memori hingga OOM). Regex blokir `BLOCK_RULES` mudah di-bypass (misal via base64 decoding atau string concatenation).

3. **Upload File Pengguna Merusak File Biner dan Tidak Masuk ke Sandbox**:
   - **Path**: `components/superchat.tsx#L647-L660` & `components/superchat.tsx#L688-L690`.
   - **Masalah**: Event upload di browser membaca file menggunakan `FileReader.readAsText(file)`. Jika user mengupload file biner (PDF, XLSX, PNG, ZIP), data akan corrupt. Selain itu, file tidak diunggah ke folder sandbox, melainkan ditempel sebagai teks di prompt chat. Skrip Python/Node di sandbox tidak dapat mengakses file tersebut kecuali LLM menulisnya ulang dengan `write_file`.

4. **Tool Calling Berbasis Regex Parsing Menggantikan Native Tool Calling**:
   - **Path**: `app/api/chat/route.ts#L113-L199, L527-L534`.
   - **Masalah**: Implementasi tidak menggunakan parameter native `tools` dari OpenAI/router API spec, melainkan mengandalkan LLM mengetik blok markdown ` ```tool_call `. Ini menyebabkan parsing sangat rentan gagal jika model menghasilkan karakter unescaped newline atau formatting yang sedikit meleset.

5. **Pencampuran Output Tool Langsung ke Plain Text Stream**:
   - **Path**: `app/api/chat/route.ts#L541-L562` & `app/api/chat/route.ts#L25-L36`.
   - **Masalah**: Server meng-enqueue teks log eksekusi tool langsung ke dalam text stream chat. Setelah turn selesai, server harus menjalankan regex pembersih `cleanAssistantContent()` untuk membuang teks tool dari chat history di disk. Jika regex pembersih gagal mencocokkan variasi teks, chat history akan terkontaminasi artefak internal tool.

6. **Folder Sandbox Bocor / Menumpuk di Disk (Disk Leak)**:
   - **Path**: `lib/chats.ts#L125-L132` & `app/api/chats/route.ts#L77-L99`.
   - **Masalah**: Saat percakapan dihapus melalui API `DELETE /api/chats`, hanya file JSON di folder `chats/` yang dihapus (`deleteChatFile`). Direktori sandbox di `sandbox/{email}/{chatId}/` tidak pernah dihapus dan akan menumpuk di disk server selamanya.

7. **Ketiadaan Pemangkasan Konteks Riwayat Percakapan (Context Window Overflow)**:
   - **Path**: `app/api/chat/route.ts#L375-L376`.
   - **Masalah**: Seluruh riwayat pesan di file JSON di-map ke `apiMessages` tanpa batas jumlah token atau pemangkasan sliding window. Pada percakapan panjang dengan banyak eksekusi tool, request akan segera melampaui context limit LLM dan memicu HTTP error 400 dari router.

### Bagian Mana yang Paling Perlu Dirombak Total?
1. **Pemisahan Protokol Streaming & Event**: Ganti raw text stream dengan Server-Sent Events (SSE) berstruktur (memisahkan event `text-delta`, `tool-call`, `tool-result`, dan `file-created`).
2. **Adopsi Native Function Calling**: Ganti prompt teks ` ```tool_call ` dengan skema OpenAI-compatible `tools: [...]` dan `tool_calls` delta.
3. **Isolasi Lingkungan Sandbox**: Ganti `child_process.exec` di host dengan runner container terisolasi (misal Docker / microVM / WebAssembly container) dengan pembatasan network, CPU, dan memori yang ketat.
4. **Alur Upload File Biner**: Buat endpoint dedicated `POST /api/sandbox/upload` (multipart/form-data) yang menaruh file asli langsung ke dalam direktori sandbox.

---

## 12. BAGIAN YANG TIDAK KAMU YAKINI

Berdasarkan pemeriksaan kode statis di repository, hal-hal berikut tidak dapat dipastikan 100%:
1. **Dukungan Native Tool Calling pada Router Eksternal**: Apakah router Bynara (`https://router.bynara.id/v1`) yang menjadi upstream default mendukung parameter `tools` standar OpenAI secara handal atau memang memiliki keterbatasan sehingga pembuat SuperChat sengaja beralih ke prompt-based tool calling.
2. **Manajemen Pembersihan Disk di Luar Repository**: Apakah ada daemon/cron job eksternal di tingkat server deployment (seperti systemd timer atau bash script terpisah) yang menghapus isi folder `sandbox/` secara berkala, karena di dalam kode aplikasi sendiri mekanisme ini dipastikan tidak ada.
3. **Kapasitas Runtime Python Host**: File `scripts/setup-sandbox.js` memasang banyak package berat (`pandas`, `matplotlib`, `reportlab`, `openpyxl`). Pada perangkat dengan spesifikasi rendah (seperti Termux/Android sesuai shebang script), build package C-extension bisa gagal jika tidak ada toolchain compiler lokal yang memadai.

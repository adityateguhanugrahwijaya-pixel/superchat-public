# Catatan Desain & Arsitektur Agent v2

Dokumen ini mencatat keputusan arsitektural, antarmuka driver, pembatasan keamanan host, dan catatan fase implementasi.

---

## 1. Sandbox Driver & Isolasi Lingkungan

### Interface `SandboxDriver` (`lib/sandbox/driver.ts`)
Mendefinisikan kontrak terpadu untuk eksekusi perintah di sandbox:
- `exec(sessionId, cmd, opts)`: Menghasilkan `ExecResult` terstruktur (`exitCode`, `signal`, `stdout`, `stderr`, `timedOut`, `killed`, `durationMs`, `truncated`).
- `destroy(sessionId)`: Menghapus direktori sandbox sesi secara tuntas.

### Implementasi Aktif: `LocalDriver` (`lib/sandbox/local-driver.ts`)
- **Proses**: Menggunakan Node.js `spawn` dengan `detached: true`.
- **Penghentian Proses**: Mengirim `SIGTERM` ke process group (`-pid`), tenggat 2 detik, dilanjutkan `SIGKILL`. Memastikan cucu proses (misalnya background `sleep` atau subshell) ikut terbunuh saat timeout atau abort.
- **Output Streaming**: Menggunakan `StringDecoder` utf-8 untuk mencegah pemotongan karakter multibyte, dibatasi cap 2 MB per stream dengan penanda `truncated: true`.
- **Environment Allowlist**: Hanya mewariskan variabel aman (`PATH`, `HOME=sessionRoot`, `LANG`, venv vars, `MPLBACKEND=Agg`, `PYTHONUNBUFFERED`, `PYTHONIOENCODING`, `SKILLS_DIR`). Secret host tidak diwariskan.
- **Ulimit**: Best-effort melalui shell wrapper (`ulimit -t` untuk waktu CPU dan `ulimit -f` untuk ukuran file maksimum).

### Batasan Keamanan Host (Termux / Linux Non-Container)
> [!WARNING]
> `LocalDriver` mengeksekusi perintah langsung pada sistem host tanpa isolasi namespace kernel atau virtualization.
> Aturan `BLOCK_RULES` dan `ulimit` berfungsi sebagai defense-in-depth, **BUKAN** isolasi keamanan mutlak (hard sandbox).

### Driver Stubs (Perluasan Mendatang)
- `DockerDriver`: Stub interface untuk eksekusi dalam container Docker/OCI (membutuhkan Docker daemon).
- `BwrapDriver`: Stub interface untuk sandbox unprivileged Bubblewrap pada Linux.

### Kebijakan Jaringan (`SANDBOX_NETWORK`)
- `open`: Akses jaringan langsung host (default saat ini).
- `proxy`: Best-effort forward-proxy lokal dengan allowlist domain (direncanakan P6).
- `off`: Best-effort pemutusan akses jaringan (direncanakan P6).

---

## 2. Layout Direktori Sesi & Path Security

### Struktur Direktori Sesi (`lib/sandbox/paths.ts`)
Root sesi: `sandbox/{safeEmail}/{chatId}/`
- `uploads/`: Direktori file yang diunggah pengguna (read-only untuk tool penulisan agen).
- `outputs/`: Direktori konvensi untuk file hasil akhir yang dipresentasikan ke pengguna.
- `.agent/`: Direktori internal metadata agen dan tool spillover (akses dari `/api/sandbox/file` diblokir).
- File kerja langsung diletakkan di root sesi agar kompatibel penuh dengan rute lama dan `FileCard`.

### Proteksi Symlink & Traversal
- Validasi ketat terhadap `userEmail` dan `chatId` (`^[A-Za-z0-9._@-]+$` dan `^[A-Za-z0-9_-]+$`).
- Pengecekan `fs.realpathSync` pada ancestor terdalam yang ada untuk memastikan jalur symlink tidak dapat melompat ke luar root sesi sandbox.

---

## 3. Siklus Pembersihan & Janitor (`lib/sandbox/janitor.ts`)

- **Penghapusan Langsung**: Terhubung ke `deleteChatFile` dan `deleteAllUserChats` di `lib/chats.ts`. Menghapus percakapan dari antarmuka otomatis membersihkan direktori sandbox terkait di disk.
- **Pembersihan Berkala (Janitor)**:
  - Mode: `JANITOR_MODE=dry-run|enforce` (default: `dry-run`).
  - TTL Idle: Menghapus sesi yang tidak aktif lebih dari 30 hari (berdasarkan mtime terbaru).
  - Kuota Disk: Membatasi penggunaan disk maksimum 500 MB per pengguna (menghapus sesi tertua jika kuota terlampaui).
  - Pengecualian: Sesi yang sedang berjalan (`isAgentRunning === true`) tidak disentuh.
  - Penjadwalan: Otomatis dijalankan saat server start dan tiap 6 jam via `instrumentation.ts`.


---

## 4. Agent Engine v2 & LLM Client (Fase 2)

### Loop Eksekusi (`lib/agent/engine.ts`)
- **Async Generator**: Fungsi `runAgent` menghasilkan stream `AgentEvent` terstruktur (`turn-start`, `text-delta`, `tool-call`, `tool-result`, `file`, `usage`, `error`, `done`).
- **Perbaikan Bug F11 (Multiple Tool Duplicate Assistant)**: Pesan assistant dimasukkan ke riwayat konteks (`apiMessages`) tepat satu kali per turn sebelum feedback eksekusi tool, mencegah duplikasi histori saat satu turn memanggil beberapa tool sekaligus.
- **Batas Pengaman Loop**:
  - `maxTurns`: Dibatasi via `AGENT_MAX_TURNS` (default: 25 untuk sandbox aktif, 1 untuk chat biasa).
  - `maxToolCalls`: Dibatasi via `AGENT_MAX_TOOL_CALLS` (default: 60).
  - `wallClockMs`: Dibatasi via `AGENT_WALL_CLOCK_MS` (default: 10 menit).
- **Validasi File Dinamis**: Memverifikasi keberadaan file fisik di workspace ketika model menyertakan tag `<file path="...">`. Jika file belum dibuat, sistem mengirim pesan koreksi ke model dan menghapus tag palsu dari riwayat.

### Klien LLM Tangguh (`lib/agent/llm/client.ts`)
- **Retry dengan Exponential Backoff**: Menangani status 429 (rate limit) dan 5xx (server error) secara otomatis dengan jeda eksponensial (1s, 2s, 4s).
- **Pembatalan Cepat (AbortSignal)**: Mendengarkan sinyal pembatalan (`signal.aborted`) dan menghentikan koneksi HTTP upstream secara instan.
- **Isolasi Reasoning**: Token reasoning (`reasoning_content` atau `reasoning`) dipisahkan dari teks jawaban pengguna.
- **Pelacakan Token Penggunaan**: Menangkap metrik token riil dari upstream melalui `stream_options: { include_usage: true }`.

### Deteksi Kapabilitas Model & Cache SQLite (`lib/agent/llm/capabilities.ts`)
- **Urutan Resolusi Kapabilitas**:
  1. Override manual (`AGENT_FORCE_TOOL_MODE=native|text`).
  2. Cache SQLite lokal di tabel `model_capabilities` (dengan TTL 7 hari).
  3. Runtime Probe: Mengirim satu request minimal dengan tool dummy untuk mendeteksi apakah model mendukung native tool calling secara riil.
  4. Fallback aman: Mode text tool-call.
- **Context Window Budgeting**: Dibatasi oleh `min(context_window, AGENT_CONTEXT_CAP)` dengan batas atas default 100k token.

### Parser Toolcall Teks (`lib/agent/llm/toolcall-text.ts`)
- Mendukung format tunggal, format array `[{"tool":...}]`, trailing comma, tool name sebagai key objek, dan tag `<tool_call>`.
- Pembersihan string JSON untuk menangani baris baru (unescaped newline) pada blok kode Python atau argumen teks.

### Paritas Stream Warisan (`lib/agent/stream/legacy.ts`)
- Menjamin kecocokan format output byte-demi-byte dengan format legacy UI (`> 🛠️ **Executing Tool:**`, `> ✅ **Output:**`, tag `<file>`).
- Flag kompatibilitas: `AGENT_ENGINE=legacy|v2` (default: `legacy` sampai seluruh fase selesai dan lolos pengujian).

### Klarifikasi Sistem: Batasan Paket
- **Konfirmasi**: Tidak ada sistem batasan paket (tier limits, daily token limits per tier, allowed models per tier, atau rate limit per package) yang aktif atau diberlakukan di SuperChat.
- Semua user yang terautentikasi dan memiliki sandbox aktif memiliki akses penuh tanpa limitasi tier paket. Desain agent v2 tidak memberlakukan batasan paket.

---

## 5. Tool Registry, Schema & Present Files (Fase 3)

### Tool Registry Terpusat (`lib/agent/tools/registry.ts`)
- **Struktur Unified**: Setiap tool mendefinisikan `name`, `description`, `parameters` (JSON Schema), `isRisky`, `aliases`, dan fungsi `execute(context, args)`.
- **Ekspor Skema Ganda**:
  - `getOpenAISchema()`: Format OpenAI tools `[{ type: 'function', function: { name, description, parameters } }]`.
  - `getPromptDocumentation()`: Dokumentasi teks komprehensif untuk mode text-based agent loop.
- **Daftar Tool Terdaftar**:
  1. `execute_command` (alias: `run_shell`, `bash`): Eksekusi shell via `LocalDriver` dengan pemantauan perubahan file workspace dan perlindungan aturan keamanan `assessToolSafety`.
  2. `run_python`: Runner Python 3 dengan preflight deteksi venv/interpreter, penanganan virtual path, dan saran otomatis jika terjadi `ModuleNotFoundError`.
  3. `run_node`: Runner Node.js/JavaScript dengan pelacakan file baru.
  4. `read_file` (alias: `view`, `cat`): Mendukung paginasi baris (`offset` dan `limit`) untuk file berukuran besar guna mencegah ledakan token konteks.
  5. `write_file` (alias: `create_file`): Menulis file dengan pembuatan subdirektori rekursif, memblokir penulisan ke `.agent/` dan pencegahan penimpaan direktori.
  6. `edit_file` (alias: `str_replace`): Search-and-replace string presisi dengan fallback snippet preview jika tidak cocok.
  7. `list_dir` (alias: `ls`): Penelusuran hierarki direktori dengan kedalaman terkontrol (`depth`).
  8. `delete_file` (alias: `rm`): Penghapusan file/direktori yang ditandai `isRisky: true`, dengan proteksi terhadap root sesi dan folder internal.
  9. `present_files` (alias: `show_files`, `publish_files`): Menandai file hasil kerja sebagai file akhir yang siap diunduh/dipratinjau user, memverifikasi eksistensi file di disk, tidak memindahkan lokasi file, membatasi judul maksimum 5 kata, dan menghasilkan event `type: 'file'`.

### Validasi Argumen & Normalisasi Alias (`lib/agent/tools/validator.ts`)
- Memvalidasi argumen terhadap JSON Schema sebelum eksekusi.
- Menyelesaikan variasi nama parameter umum LLM secara otomatis (mis. `filepath`/`file` $\rightarrow$ `path`, `cmd` $\rightarrow$ `command`, `script` $\rightarrow$ `code`).
- Menolak argumen invalid/kosong dengan pesan error terstruktur agar model dapat memperbaiki panggilannya.

### Migrasi Executor Warisan (`lib/sandbox/executor.ts`)
- `executeSandboxTool` kini mendelegasikan eksekusinya langsung ke Tool Registry baru, memastikan bahwa baik loop lama maupun v2 engine mendapatkan fitur keamanan proses group kill, paginasi file, dan validasi skema yang sama.

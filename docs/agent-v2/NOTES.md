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

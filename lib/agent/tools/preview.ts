import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { ToolDefinition, ToolContext, ToolResult } from './types'
import { resolveSandboxPath } from '../../sandbox/paths'
import { getVenvPython, detectPython } from '../../sandbox/runtime'

interface PreviewArgs {
  path: string
  pages?: string
  mode?: 'auto' | 'image' | 'lint'
}

/**
 * Executes a process using spawn with an array of arguments (no shell interpolation),
 * an AbortSignal, and a strict timeout.
 */
function spawnProcess(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number = 30000,
  signal?: AbortSignal
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Operation aborted'))
    }

    let stdout = ''
    let stderr = ''
    let finished = false

    const proc = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        proc.kill('SIGKILL')
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(' ')}`))
      }
    }, timeoutMs)

    const onAbort = () => {
      if (!finished) {
        finished = true
        proc.kill('SIGKILL')
        clearTimeout(timer)
        reject(new Error('Operation aborted'))
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    proc.on('error', (err) => {
      if (!finished) {
        finished = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(err)
      }
    })

    proc.on('close', (code) => {
      if (!finished) {
        finished = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve({ code, stdout, stderr })
      }
    })
  })
}

function getPythonExecutable(): string {
  const venvPy = getVenvPython()
  if (venvPy && fs.existsSync(venvPy)) return venvPy
  const detected = detectPython()
  if (detected.found) {
    const clean = detected.commandLine.replace(/^"|"$/g, '')
    return clean.split(' ')[0]
  }
  return 'python3'
}

function isSofficeAvailable(): boolean {
  try {
    const res = spawnSync('soffice', ['--version'], { timeout: 3000, stdio: 'ignore' })
    return !res.error && res.status === 0
  } catch {
    return false
  }
}

/**
 * Formats lint issues into a clean text block of at most maxLines (default 15 lines).
 */
function formatLintOutput(lines: string[], maxLines: number = 15): string {
  const filtered = lines.map((l) => l.trim()).filter(Boolean)
  if (filtered.length <= maxLines) {
    return filtered.join('\n')
  }
  const keep = filtered.slice(0, maxLines - 1)
  const remainingCount = filtered.length - (maxLines - 1)
  keep.push(`... (sisa ${remainingCount} temuan lainnya)`)
  return keep.join('\n')
}

/**
 * Records that a file has been previewed in session's .agent/preview/.previewed.json
 */
function recordPreviewedFile(sessionDir: string, relPath: string): void {
  try {
    const previewDir = path.join(sessionDir, '.agent', 'preview')
    fs.mkdirSync(previewDir, { recursive: true })
    const metaPath = path.join(previewDir, '.previewed.json')
    let current: Record<string, any> = {}
    if (fs.existsSync(metaPath)) {
      try {
        current = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      } catch {}
    }
    current[relPath] = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
    }
    fs.writeFileSync(metaPath, JSON.stringify(current, null, 2), 'utf-8')
  } catch (err) {
    console.error('[preview_file] Failed to record previewed file:', err)
  }
}

export const previewFileTool: ToolDefinition = {
  name: 'preview_file',
  aliases: ['preview', 'inspect_file'],
  description:
    'Inspects and lints generated files (PDF, PPTX, DOCX, PNG, JPG) before presenting them. Returns a structured lint report (max 15 lines) and generates a visual preview for vision-capable models.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file in the workspace (e.g. "report.pdf", "slides.pptx", "figure.png")',
      },
      pages: {
        type: 'string',
        description: 'Page range to render (e.g. "1-3", "2", default all up to 8)',
      },
      mode: {
        type: 'string',
        enum: ['auto', 'image', 'lint'],
        description: 'Inspection mode: "auto" (default: lint + preview image), "image", or "lint"',
      },
    },
    required: ['path'],
  },
  execute: async (context: ToolContext, args: PreviewArgs): Promise<ToolResult> => {
    const { userEmail, chatId, sessionDir, signal } = context
    const rawPath = (args.path || '').trim()

    if (!rawPath) {
      return {
        success: false,
        output: 'Error: preview_file requires a valid "path" parameter.',
        error: 'Missing path',
      }
    }

    let fullPath: string
    try {
      fullPath = resolveSandboxPath(userEmail, chatId, rawPath, false)
    } catch (err: any) {
      return {
        success: false,
        output: `Security/Access Error: Cannot access path "${rawPath}": ${err?.message || 'Access denied'}`,
        error: 'Access denied',
      }
    }

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        output: `Error: File tidak ditemukan di workspace: "${rawPath}". Pastikan file telah dibuat sebelum memanggil preview_file.`,
        error: 'File not found',
      }
    }

    const stat = fs.statSync(fullPath)
    if (!stat.isFile()) {
      return {
        success: false,
        output: `Error: "${rawPath}" adalah direktori, bukan file.`,
        error: 'Not a file',
      }
    }

    const previewDir = path.join(sessionDir, '.agent', 'preview')
    fs.mkdirSync(previewDir, { recursive: true })

    const relPath = path.relative(sessionDir, fullPath)
    const ext = path.extname(fullPath).toLowerCase()
    const mode = args.mode || 'auto'
    const pyExe = getPythonExecutable()

    // Record previewed status
    recordPreviewedFile(sessionDir, relPath)

    // -------------------------------------------------------------------------
    // 1. PDF Handling
    // -------------------------------------------------------------------------
    if (ext === '.pdf') {
      const lintLines: string[] = []
      let totalPages = 0
      let wordCountPerPage: Record<number, number> = {}
      const missingGlyphs: Array<{ page: number; word: string }> = []
      const outOfBoundsWords: Array<{ page: number; word: string }> = []
      const overlappingWords: Array<{ page: number; word1: string; word2: string }> = []
      const blankPages: number[] = []

      // Lint using pdftotext -bbox
      try {
        const bboxRes = await spawnProcess('pdftotext', ['-bbox', fullPath, '-'], sessionDir, 30000, signal)
        if (bboxRes.code === 0 && bboxRes.stdout) {
          const xml = bboxRes.stdout
          const pageRegex = /<page\s+width="([^"]+)"\s+height="([^"]+)">([\s\S]*?)<\/page>/gi
          let pageMatch: RegExpExecArray | null
          let pNum = 0

          while ((pageMatch = pageRegex.exec(xml)) !== null) {
            pNum++
            totalPages = pNum
            const pageWidth = parseFloat(pageMatch[1])
            const pageHeight = parseFloat(pageMatch[2])
            const pageContent = pageMatch[3]

            const wordRegex = /<word\s+xMin="([^"]+)"\s+yMin="([^"]+)"\s+xMax="([^"]+)"\s+yMax="([^"]+)">([\s\S]*?)<\/word>/gi
            let wordMatch: RegExpExecArray | null
            const pageWords: Array<{ xMin: number; yMin: number; xMax: number; yMax: number; text: string }> = []

            while ((wordMatch = wordRegex.exec(pageContent)) !== null) {
              const xMin = parseFloat(wordMatch[1])
              const yMin = parseFloat(wordMatch[2])
              const xMax = parseFloat(wordMatch[3])
              const yMax = parseFloat(wordMatch[4])
              const text = wordMatch[5].trim()

              pageWords.push({ xMin, yMin, xMax, yMax, text })

              // Check missing/box glyphs (U+25A0 ■ or U+FFFD)
              if (text.includes('\u25A0') || text.includes('\uFFFD') || text.includes('■')) {
                missingGlyphs.push({ page: pNum, word: text })
              }

              // Check out of bounds
              if (xMin < 0 || yMin < 0 || xMax > pageWidth || yMax > pageHeight) {
                outOfBoundsWords.push({ page: pNum, word: text })
              }
            }

            wordCountPerPage[pNum] = pageWords.length
            if (pageWords.length === 0) {
              blankPages.push(pNum)
            }

            // Check word overlap on this page
            for (let i = 0; i < pageWords.length; i++) {
              for (let j = i + 1; j < pageWords.length; j++) {
                const w1 = pageWords[i]
                const w2 = pageWords[j]

                const ixMin = Math.max(w1.xMin, w2.xMin)
                const ixMax = Math.min(w1.xMax, w2.xMax)
                const iyMin = Math.max(w1.yMin, w2.yMin)
                const iyMax = Math.min(w1.yMax, w2.yMax)

                if (ixMax > ixMin && iyMax > iyMin) {
                  const overlapArea = (ixMax - ixMin) * (iyMax - iyMin)
                  const area1 = (w1.xMax - w1.xMin) * (w1.yMax - w1.yMin)
                  const area2 = (w2.xMax - w2.xMin) * (w2.yMax - w2.yMin)
                  const minArea = Math.min(area1, area2)

                  if (minArea > 0 && overlapArea / minArea > 0.25) {
                    overlappingWords.push({ page: pNum, word1: w1.text, word2: w2.text })
                  }
                }
              }
            }
          }
        }
      } catch (err: any) {
        lintLines.push(`Catatan lint: Gagal memproses bbox (${err?.message || 'error'})`)
      }

      // Build structured lint report (max 15 lines)
      lintLines.push(`[Laporan Lint PDF: ${relPath}]`)
      lintLines.push(`Total halaman: ${totalPages || 'tidak diketahui'}`)

      if (totalPages > 0) {
        const wordsSummary = Object.entries(wordCountPerPage)
          .slice(0, 6)
          .map(([pg, count]) => `Hal ${pg}: ${count} kata`)
          .join(', ')
        lintLines.push(`Kata per halaman: ${wordsSummary}${totalPages > 6 ? '...' : ''}`)
      }

      if (blankPages.length > 0) {
        lintLines.push(`Peringatan: Halaman kosong terdeteksi: Hal ${blankPages.join(', ')}`)
      }

      if (missingGlyphs.length > 0) {
        for (const mg of missingGlyphs.slice(0, 3)) {
          lintLines.push(`Karakter glyph hilang/kotak: Hal ${mg.page} ("${mg.word}")`)
        }
        if (missingGlyphs.length > 3) {
          lintLines.push(`... (+${missingGlyphs.length - 3} karakter hilang lainnya)`)
        }
      }

      if (outOfBoundsWords.length > 0) {
        for (const ob of outOfBoundsWords.slice(0, 3)) {
          lintLines.push(`Teks di luar batas halaman: Hal ${ob.page} ("${ob.word}")`)
        }
      }

      if (overlappingWords.length > 0) {
        for (const ov of overlappingWords.slice(0, 3)) {
          lintLines.push(`Teks bertumpuk (overlap): Hal ${ov.page} ("${ov.word1}" & "${ov.word2}")`)
        }
        if (overlappingWords.length > 3) {
          lintLines.push(`... (+${overlappingWords.length - 3} teks bertumpuk lainnya)`)
        }
      }

      if (missingGlyphs.length === 0 && outOfBoundsWords.length === 0 && overlappingWords.length === 0 && blankPages.length === 0) {
        lintLines.push('Status layout: Tidak ditemukan masalah tumpang tindih, glyph hilang, atau halaman kosong.')
      }

      let previewImagePath: string | undefined

      // Render visually if mode is not 'lint'
      if (mode !== 'lint') {
        const prefix = path.join(previewDir, `pdf_${Date.now()}`)
        let firstPage = 1
        let lastPage = 8

        if (args.pages) {
          const match = args.pages.match(/^(\d+)(?:-(\d+))?$/)
          if (match) {
            firstPage = parseInt(match[1], 10)
            lastPage = match[2] ? parseInt(match[2], 10) : firstPage
          }
        }

        try {
          const ppmRes = await spawnProcess(
            'pdftoppm',
            [
              '-jpeg',
              '-scale-to-x',
              '700',
              '-scale-to-y',
              '-1',
              '-f',
              String(firstPage),
              '-l',
              String(lastPage),
              fullPath,
              prefix,
            ],
            sessionDir,
            30000,
            signal
          )

          if (ppmRes.code === 0) {
            // Find rendered page JPEGs
            const genFiles = fs
              .readdirSync(previewDir)
              .filter((f) => f.startsWith(path.basename(prefix)) && (f.endsWith('.jpg') || f.endsWith('.jpeg')))
              .sort()
              .map((f) => path.join(previewDir, f))

            if (genFiles.length === 1 && genFiles[0]) {
              previewImagePath = genFiles[0]
            } else if (genFiles.length > 1) {
              // Combine pages into contact sheet using Pillow
              const sheetOut = path.join(previewDir, `sheet_${Date.now()}.jpg`)
              const pythonScript = `
import sys
from PIL import Image, ImageDraw

files = sys.argv[1:-1]
out_path = sys.argv[-1]
if not files:
    sys.exit(1)

images = [Image.open(f) for f in files]
cols = 2 if len(images) > 1 else 1
rows = (len(images) + cols - 1) // cols

max_w = max(img.width for img in images)
max_h = max(img.height for img in images)
header_h = 36
margin = 12

sheet_w = cols * max_w + (cols + 1) * margin
sheet_h = rows * (max_h + header_h) + (rows + 1) * margin

sheet = Image.new('RGB', (sheet_w, sheet_h), color=(240, 240, 240))
draw = ImageDraw.Draw(sheet)

for idx, img in enumerate(images):
    c = idx % cols
    r = idx // cols
    x = margin + c * (max_w + margin)
    y = margin + r * (max_h + header_h + margin)
    
    # Draw header badge
    draw.rectangle([x, y, x + max_w, y + header_h], fill=(45, 55, 72))
    draw.text((x + 12, y + 8), f"Halaman {idx + 1}", fill=(255, 255, 255))
    sheet.paste(img, (x, y + header_h))

# Ensure max width <= 1600px
if sheet.width > 1600:
    scale = 1600 / sheet.width
    sheet = sheet.resize((1600, int(sheet.height * scale)), Image.Resampling.LANCZOS)

sheet.save(out_path, 'JPEG', quality=85)
`
              const pyRes = await spawnProcess(
                pyExe,
                ['-c', pythonScript, ...genFiles, sheetOut],
                sessionDir,
                30000,
                signal
              )

              if (pyRes.code === 0 && fs.existsSync(sheetOut)) {
                previewImagePath = sheetOut
              } else if (genFiles[0]) {
                previewImagePath = genFiles[0]
              }
            }
          }
        } catch (err: any) {
          lintLines.push(`Peringatan visual: Gagal membuat render JPEG (${err?.message || 'error'})`)
        }
      }

      const formattedOutput = formatLintOutput(lintLines)
      return {
        success: true,
        output: formattedOutput,
        previewImagePath,
      }
    }

    // -------------------------------------------------------------------------
    // 2. Image Handling (PNG / JPG / JPEG / WEBP)
    // -------------------------------------------------------------------------
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const lintLines: string[] = []
      lintLines.push(`[Laporan Lint Gambar: ${relPath}]`)

      const previewOut = path.join(previewDir, `img_${Date.now()}.jpg`)
      const pyScript = `
import sys
from PIL import Image

in_path = sys.argv[1]
out_path = sys.argv[2]

img = Image.open(in_path)
orig_w, orig_h = img.size
fmt = img.format or 'IMAGE'

if img.mode in ('RGBA', 'LA', 'P'):
    rgb = Image.new('RGB', img.size, (255, 255, 255))
    rgb.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
    img = rgb

if img.width > 1600:
    scale = 1600 / img.width
    img = img.resize((1600, int(img.height * scale)), Image.Resampling.LANCZOS)

img.save(out_path, 'JPEG', quality=85)
print(f"{orig_w},{orig_h},{fmt}")
`
      let previewImagePath: string | undefined
      try {
        const pyRes = await spawnProcess(pyExe, ['-c', pyScript, fullPath, previewOut], sessionDir, 30000, signal)
        if (pyRes.code === 0 && fs.existsSync(previewOut)) {
          previewImagePath = previewOut
          const parts = pyRes.stdout.trim().split(',')
          if (parts.length >= 3) {
            lintLines.push(`Dimensi asli: ${parts[0]}x${parts[1]} px`)
            lintLines.push(`Format: ${parts[2]}`)
          }
          lintLines.push(`Ukuran file: ${(stat.size / 1024).toFixed(1)} KB`)
          lintLines.push('Status gambar: Berhasil diproses dan dioptimalkan untuk inspeksi.')
        } else {
          lintLines.push(`Peringatan: Gagal memproses gambar (${pyRes.stderr.trim() || 'error'})`)
        }
      } catch (err: any) {
        lintLines.push(`Peringatan: Gagal memproses gambar (${err?.message || 'error'})`)
      }

      return {
        success: true,
        output: formatLintOutput(lintLines),
        previewImagePath,
      }
    }

    // -------------------------------------------------------------------------
    // 3. PPTX / DOCX Handling
    // -------------------------------------------------------------------------
    if (ext === '.pptx' || ext === '.docx') {
      const sofficeOk = isSofficeAvailable()

      if (sofficeOk) {
        try {
          const convRes = await spawnProcess(
            'soffice',
            ['--headless', '--convert-to', 'pdf', '--outdir', previewDir, fullPath],
            sessionDir,
            30000,
            signal
          )
          const baseName = path.basename(fullPath, ext)
          const convertedPdf = path.join(previewDir, `${baseName}.pdf`)
          if (convRes.code === 0 && fs.existsSync(convertedPdf)) {
            // Recurse into PDF preview pipeline
            const subResult = await previewFileTool.execute(context, {
              path: path.relative(sessionDir, convertedPdf),
              pages: args.pages,
              mode: args.mode,
            })
            return {
              ...subResult,
              output: `[Konversi ${ext.toUpperCase()} ke PDF via LibreOffice Sukses]\n` + subResult.output,
            }
          }
        } catch (err) {
          // fall through to lint mode
        }
      }

      // Fallback: Python XML Linting without soffice
      const lintLines: string[] = []
      lintLines.push(`[Laporan Lint Dokumen: ${relPath}]`)
      lintLines.push('Preview visual tidak tersedia (soffice/LibreOffice tidak terpasang di sistem).')

      const lintScript = `
import sys, zipfile, xml.etree.ElementTree as ET

file_path = sys.argv[1]
ext = sys.argv[2]

try:
    with zipfile.ZipFile(file_path, 'r') as z:
        if ext == '.pptx':
            slide_files = [f for f in z.namelist() if f.startswith('ppt/slides/slide') and f.endswith('.xml')]
            print(f"Total slide: {len(slide_files)}")
            
            for s_idx, sf in enumerate(slide_files):
                content = z.read(sf).decode('utf-8', errors='ignore')
                root = ET.fromstring(content)
                
                # Check empty titles or leftover placeholders
                texts = [elem.text for elem in root.iter() if elem.text]
                all_text = ' '.join(texts)
                
                placeholders = ['[Title]', '[Subtitle]', 'Click to add text', 'Click to add title', 'Lorem ipsum']
                found_ph = [p for p in placeholders if p.lower() in all_text.lower()]
                if found_ph:
                    print(f"Slide {s_idx + 1}: Placeholder tersisa: {', '.join(found_ph)}")
                
                # Check small fonts (<10pt => sz < 1000 in pptx)
                for rPr in root.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}rPr'):
                    sz = rPr.get('sz')
                    if sz and sz.isdigit() and int(sz) < 1000:
                        print(f"Slide {s_idx + 1}: Ukuran font kecil terdeteksi ({int(sz)/100}pt < 10pt)")
                        break
        elif ext == '.docx':
            if 'word/document.xml' in z.namelist():
                content = z.read('word/document.xml').decode('utf-8', errors='ignore')
                root = ET.fromstring(content)
                texts = [elem.text for elem in root.iter() if elem.text]
                total_words = sum(len(t.split()) for t in texts)
                print(f"Total kata dalam dokumen: {total_words}")
                
                placeholders = ['[Title]', 'Lorem ipsum', '[Author]', '[Company]']
                found_ph = [p for p in placeholders if p.lower() in ' '.join(texts).lower()]
                if found_ph:
                    print(f"Placeholder tersisa: {', '.join(found_ph)}")
except Exception as e:
    print(f"Kesalahan inspeksi XML: {e}")
`
      try {
        const pyRes = await spawnProcess(pyExe, ['-c', lintScript, fullPath, ext], sessionDir, 30000, signal)
        if (pyRes.code === 0 && pyRes.stdout) {
          const outLines = pyRes.stdout.trim().split('\n')
          lintLines.push(...outLines)
        }
      } catch (err: any) {
        lintLines.push(`Kesalahan saat membaca struktur dokumen: ${err?.message || 'error'}`)
      }

      return {
        success: true,
        output: formatLintOutput(lintLines),
      }
    }

    return {
      success: false,
      output: `Format file "${ext}" tidak didukung untuk preview. Format yang didukung: .pdf, .png, .jpg, .jpeg, .pptx, .docx.`,
      error: 'Unsupported file format',
    }
  },
}

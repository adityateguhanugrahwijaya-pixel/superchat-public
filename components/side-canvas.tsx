'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  X,
  Download,
  Copy,
  Check,
  FileCode,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Play,
  RefreshCw,
  ExternalLink,
  Eye,
  Globe,
} from 'lucide-react'

const PdfViewerClient = dynamic(() => import('./PdfViewerClient'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
      <RefreshCw size={20} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
      Initializing PDF Viewer…
    </div>
  ),
})

export type CanvasFile = {
  path: string
  title?: string
}

export type SideCanvasProps = {
  chatId: string
  open: boolean
  files: CanvasFile[]
  activePath?: string
  onClose: () => void
  onSelectFile: (path: string) => void
}

export function SideCanvas({ chatId, open, files, activePath, onClose, onSelectFile }: SideCanvasProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean>(false)
  const [activeTabMode, setActiveTabMode] = useState<'code' | 'preview'>('preview')
  const [tableFilter, setTableFilter] = useState<string>('')
  const [isBinaryPdf, setIsBinaryPdf] = useState<boolean>(true)

  const activeFile = files.find((f) => f.path === activePath) || files[files.length - 1]
  const currentPath = activeFile?.path || ''
  const ext = (currentPath.split('.').pop() || '').toLowerCase()

  const isPdf = ext === 'pdf'
  const isExcel = ext === 'xlsx' || ext === 'xls' || ext === 'csv'
  const isImage = ['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)
  const isHtml = ext === 'html' || ext === 'htm'
  const isMarkdown = ext === 'md' || ext === 'markdown'

  const fileUrl = currentPath
    ? `/api/sandbox/file?chatId=${encodeURIComponent(chatId)}&path=${encodeURIComponent(currentPath)}`
    : ''

  // Set default view mode based on file type
  useEffect(() => {
    if (isHtml || isMarkdown || isPdf || isImage || isExcel) {
      setActiveTabMode('preview')
    } else {
      setActiveTabMode('code')
    }
  }, [currentPath])

  useEffect(() => {
    if (!open || !currentPath || isImage) return

    setLoading(true)
    setError(null)
    fetch(`${fileUrl}&parse=1`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`)
        const contentType = res.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          throw new Error('Server returned non-JSON file content')
        }
        return res.json()
      })
      .then((data) => {
        setContent(data.content || '')
        if (isPdf) {
          setIsBinaryPdf(data.isBinaryPdf !== false)
        }
      })
      .catch((err) => {
        setError(err.message || 'Error loading file content')
      })
      .finally(() => setLoading(false))
  }, [open, currentPath, chatId, fileUrl, isPdf, isImage])

  if (!open) return null

  const handleCopy = () => {
    if (!content) return
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Render CSV / Spreadsheet Table
  const renderTable = () => {
    if (!content) return <p style={{ padding: 20, color: 'var(--muted-foreground)' }}>Empty spreadsheet content.</p>
    const lines = content.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length === 0) return null

    const rows = lines.map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')))
    const header = rows[0]
    const dataRows = rows.slice(1)

    const filteredRows = tableFilter
      ? dataRows.filter((r) => r.some((c) => c.toLowerCase().includes(tableFilter.toLowerCase())))
      : dataRows

    return (
      <div style={{ padding: 16 }}>
        <input
          type="text"
          placeholder="Filter rows..."
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            marginBottom: 12,
            borderRadius: 8,
            border: '1px solid var(--border)',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
                {header.map((col, idx) => (
                  <th key={idx} style={{ padding: '10px 12px', fontWeight: 700 }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, rIdx) => (
                <tr key={rIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <aside
      style={{
        width: 'min(620px, 50vw)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--white)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 24px #00000012',
        zIndex: 30,
      }}
    >
      {/* Side Canvas Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--sidebar)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {isPdf ? (
            <FileText size={18} color="#dc2626" />
          ) : isExcel ? (
            <FileSpreadsheet size={18} color="#16a34a" />
          ) : isImage ? (
            <ImageIcon size={18} color="#2563eb" />
          ) : isHtml ? (
            <Globe size={18} color="var(--primary)" />
          ) : (
            <FileCode size={18} color="var(--primary)" />
          )}
          <strong style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeFile?.title || currentPath.split('/').pop()}
          </strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Mode Switcher for Text/HTML/MD/PDF/Code Files */}
          {!isImage && (
            <div style={{ display: 'flex', background: 'var(--background)', borderRadius: 6, padding: 2 }}>
              <button
                type="button"
                onClick={() => setActiveTabMode('preview')}
                style={{
                  border: 0,
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: activeTabMode === 'preview' ? 'var(--white)' : 'transparent',
                  color: activeTabMode === 'preview' ? 'var(--primary)' : 'var(--muted-foreground)',
                  cursor: 'pointer',
                }}
              >
                Live View
              </button>
              <button
                type="button"
                onClick={() => setActiveTabMode('code')}
                style={{
                  border: 0,
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: activeTabMode === 'code' ? 'var(--white)' : 'transparent',
                  color: activeTabMode === 'code' ? 'var(--primary)' : 'var(--muted-foreground)',
                  cursor: 'pointer',
                }}
              >
                Code
              </button>
            </div>
          )}

          {content && !isImage && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copy content"
              style={{ border: 0, background: 'transparent', padding: 6, cursor: 'pointer', color: 'var(--muted-foreground)' }}
            >
              {copied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
            </button>
          )}

          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open Live Web View in New Tab"
              style={{ border: 0, background: 'transparent', padding: 6, cursor: 'pointer', color: 'var(--muted-foreground)' }}
            >
              <ExternalLink size={16} />
            </a>
          )}

          {fileUrl && (
            <a
              href={`${fileUrl}&download=1`}
              download
              title="Download File"
              style={{ border: 0, background: 'transparent', padding: 6, cursor: 'pointer', color: 'var(--muted-foreground)' }}
            >
              <Download size={16} />
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Close Canvas"
            style={{ border: 0, background: 'transparent', padding: 6, cursor: 'pointer', color: 'var(--muted-foreground)' }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tabs List */}
      {files.length > 1 && (
        <div style={{ display: 'flex', gap: 4, padding: '8px 12px', background: 'var(--background)', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelectFile(file.path)}
              style={{
                border: 0,
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: file.path === currentPath ? 700 : 500,
                background: file.path === currentPath ? 'var(--white)' : 'transparent',
                color: file.path === currentPath ? 'var(--primary)' : 'var(--muted-foreground)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {file.title || file.path.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {/* Side Canvas Main Body */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--background)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
            <RefreshCw size={20} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
            Loading file...
          </div>
        ) : error ? (
          <div style={{ padding: 20, color: '#dc2626', fontSize: 13 }}>{error}</div>
        ) : isPdf && activeTabMode === 'preview' ? (
          /* PDF Live View via PdfViewerClient */
          <PdfViewerClient
            key={fileUrl}
            fileUrl={fileUrl}
            title={activeFile?.title}
            fallbackContent={content}
          />
        ) : isPdf && activeTabMode === 'code' ? (
          <div>
            <pre
              style={{
                margin: 0,
                padding: 16,
                fontSize: 13,
                fontFamily: 'monospace',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--foreground)',
              }}
            >
              {content}
            </pre>
          </div>
        ) : isImage ? (
          /* Image Viewer */
          <div style={{ padding: 20, display: 'grid', placeItems: 'center', height: '100%' }}>
            <img src={fileUrl} alt={activeFile?.title || 'Sandbox Image'} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, boxShadow: '0 4px 12px #00000015' }} />
          </div>
        ) : isExcel || ext === 'csv' ? (
          /* Excel / CSV Table Viewer */
          renderTable()
        ) : isHtml && activeTabMode === 'preview' ? (
          /* Live Web View inside iframe */
          <iframe
            src={fileUrl}
            key={fileUrl}
            style={{ width: '100%', height: '100%', border: 0, background: '#ffffff' }}
            title={activeFile?.title || 'Live Web View'}
          />
        ) : isMarkdown && activeTabMode === 'preview' ? (
          /* Markdown Rendered Web Preview */
          <div style={{ padding: '20px 24px', color: 'var(--foreground)', fontSize: 14, lineHeight: 1.7, background: 'var(--white)', minHeight: '100%' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          /* Code / Text Viewer */
          <pre
            style={{
              margin: 0,
              padding: 16,
              fontSize: 13,
              fontFamily: 'monospace',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: 'var(--foreground)',
            }}
          >
            {content}
          </pre>
        )}
      </div>
    </aside>
  )
}

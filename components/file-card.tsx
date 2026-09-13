'use client'

import React from 'react'
import {
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  Download,
  Eye,
  FileCheck,
} from 'lucide-react'

export type FileCardProps = {
  chatId: string
  path: string
  title?: string
  size?: number
  onView?: (path: string, title?: string) => void
}

export function getFileIcon(filePath: string) {
  const ext = (filePath.split('.').pop() || '').toLowerCase()
  switch (ext) {
    case 'pdf':
      return <FileText size={20} color="#dc2626" />
    case 'xlsx':
    case 'xls':
    case 'csv':
      return <FileSpreadsheet size={20} color="#16a34a" />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'webp':
      return <ImageIcon size={20} color="#2563eb" />
    case 'py':
    case 'js':
    case 'ts':
    case 'html':
    case 'css':
    case 'json':
      return <FileCode size={20} color="#9333ea" />
    default:
      return <FileCheck size={20} color="var(--primary)" />
  }
}

export function FileCard({ chatId, path, title, onView }: FileCardProps) {
  const fileName = title || path.split('/').pop() || path
  const downloadUrl = `/api/sandbox/file?chatId=${encodeURIComponent(chatId)}&path=${encodeURIComponent(path)}&download=1`
  const ext = (path.split('.').pop() || '').toLowerCase()
  const isWebFile = ['html', 'htm', 'svg', 'md', 'pdf', 'png', 'jpg', 'jpeg', 'csv'].includes(ext)

  return (
    <div
      onClick={() => onView && onView(path, fileName)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        margin: '10px 0',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--white)',
        boxShadow: '0 2px 6px #00000008',
        cursor: onView ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 8, background: 'var(--background)' }}>
          {getFileIcon(path)}
        </div>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
          </strong>
          <small style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{path}</small>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {onView && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onView(path, fileName)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--primary-soft)',
              color: 'var(--primary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Eye size={13} /> {isWebFile ? 'Live View' : 'View Code'}
          </button>
        )}
        <a
          href={downloadUrl}
          download
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--white)',
            color: 'var(--foreground)',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <Download size={13} /> Download
        </a>
      </div>
    </div>
  )
}

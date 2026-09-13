'use client'

import React, { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'

// Set up local worker source for PDF.js to prevent CORS / network errors
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

export type PdfViewerClientProps = {
  fileUrl: string
  title?: string
  fallbackContent?: string
}

export default function PdfViewerClient({ fileUrl, title, fallbackContent }: PdfViewerClientProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<boolean>(false)

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    setPageNumber(1)
    setLoading(false)
    setError(false)
  }

  function onDocumentLoadError(err: Error) {
    console.error('PDF render error:', err)
    setLoading(false)
    setError(true)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--background)',
        userSelect: 'none',
      }}
    >
      {/* PDF Controls Toolbar */}
      {!error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: 'var(--sidebar)',
            borderBottom: '1px solid var(--border)',
            fontSize: 12,
            gap: 12,
          }}
        >
          {/* Page Navigator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              style={{
                border: 0,
                background: 'var(--white)',
                padding: '4px 8px',
                borderRadius: 4,
                cursor: pageNumber <= 1 ? 'not-allowed' : 'pointer',
                opacity: pageNumber <= 1 ? 0.5 : 1,
                boxShadow: '0 1px 2px #00000010',
              }}
            >
              <ChevronLeft size={14} />
            </button>

            <span>
              Page {pageNumber} of {numPages || '…'}
            </span>

            <button
              type="button"
              disabled={numPages === null || pageNumber >= numPages}
              onClick={() => setPageNumber((p) => Math.min(numPages || 1, p + 1))}
              style={{
                border: 0,
                background: 'var(--white)',
                padding: '4px 8px',
                borderRadius: 4,
                cursor: numPages === null || pageNumber >= numPages ? 'not-allowed' : 'pointer',
                opacity: numPages === null || pageNumber >= numPages ? 0.5 : 1,
                boxShadow: '0 1px 2px #00000010',
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Zoom Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              disabled={scale <= 0.5}
              onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.2).toFixed(1))))}
              title="Zoom out"
              style={{
                border: 0,
                background: 'var(--white)',
                padding: '4px 8px',
                borderRadius: 4,
                cursor: scale <= 0.5 ? 'not-allowed' : 'pointer',
                opacity: scale <= 0.5 ? 0.5 : 1,
                boxShadow: '0 1px 2px #00000010',
              }}
            >
              <ZoomOut size={14} />
            </button>

            <span style={{ fontWeight: 600, minWidth: 42, textAlign: 'center' }}>
              {Math.round(scale * 100)}%
            </span>

            <button
              type="button"
              disabled={scale >= 2.5}
              onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.2).toFixed(1))))}
              title="Zoom in"
              style={{
                border: 0,
                background: 'var(--white)',
                padding: '4px 8px',
                borderRadius: 4,
                cursor: scale >= 2.5 ? 'not-allowed' : 'pointer',
                opacity: scale >= 2.5 ? 0.5 : 1,
                boxShadow: '0 1px 2px #00000010',
              }}
            >
              <ZoomIn size={14} />
            </button>
          </div>
        </div>
      )}

      {/* PDF Document Container */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: error ? 'flex-start' : 'center',
          padding: 16,
          background: 'var(--background)',
        }}
      >
        {error ? (
          <div style={{ width: '100%', maxWidth: 600, padding: 16 }}>
            <div
              style={{
                padding: '12px 16px',
                background: '#fef2f2',
                color: '#991b1b',
                borderRadius: 8,
                border: '1px solid #fecaca',
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              ⚠️ PDF could not be rendered as a binary document. Showing file raw text / code below.
            </div>
            {fallbackContent && (
              <pre
                style={{
                  margin: 0,
                  padding: 16,
                  background: 'var(--white)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {fallbackContent}
              </pre>
            )}
          </div>
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div style={{ padding: 40, color: 'var(--muted-foreground)', fontSize: 13, textAlign: 'center' }}>
                <RotateCw size={18} className="spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                Loading PDF Document…
              </div>
            }
            error={null}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="pdf-page-shadow"
              style={{
                boxShadow: '0 4px 20px #00000018',
                borderRadius: 4,
              }}
            />
          </Document>
        )}
      </div>
    </div>
  )
}

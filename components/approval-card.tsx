'use client'

import React, { useEffect, useState } from 'react'
import { AlertTriangle, Check, X, ShieldAlert, Clock } from 'lucide-react'

export type ApprovalCardProps = {
  toolName: string
  reason?: string
  params?: Record<string, any>
  timeoutSeconds?: number
  onApprove: () => void
  onReject: () => void
}

export function ApprovalCard({
  toolName,
  reason,
  params,
  timeoutSeconds = 60,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const [timeLeft, setTimeLeft] = useState<number>(timeoutSeconds)
  const cmdString = params?.command || params?.cmd || params?.path || JSON.stringify(params || {})

  useEffect(() => {
    if (timeLeft <= 0) {
      onReject()
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, onReject])

  const progressPercent = Math.max(0, (timeLeft / timeoutSeconds) * 100)

  return (
    <div
      style={{
        margin: '14px 0',
        padding: 16,
        borderRadius: 12,
        background: '#fff1f2',
        border: '1.5px solid #fecdd3',
        boxShadow: '0 4px 12px #9f123912',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 1-Minute Timer Progress Bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: 3,
          width: `${progressPercent}%`,
          background: timeLeft < 15 ? '#ef4444' : '#f43f5e',
          transition: 'width 1s linear',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#be123c', fontWeight: 700, fontSize: 13 }}>
          <ShieldAlert size={18} /> Destructive Action Confirmation Required
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: timeLeft < 15 ? '#dc2626' : '#9f1239', background: '#ffe4e6', padding: '3px 9px', borderRadius: 12, whiteSpace: 'nowrap' }}>
          <Clock size={13} className={timeLeft < 15 ? 'spin' : ''} />
          <span>Timer: {timeLeft}s</span>
        </div>
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#881337', lineHeight: 1.5 }}>
        {reason || `The AI assistant requested to perform a file removal / destructive action (${toolName}). Please confirm or reject within 1 minute.`}
      </p>

      {cmdString && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#ffe4e6', fontFamily: 'monospace', fontSize: 12, color: '#9f1239', marginBottom: 12, wordBreak: 'break-all' }}>
          {cmdString}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onApprove}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 8,
            background: '#e11d48',
            color: '#ffffff',
            border: 0,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Check size={14} /> Confirm & Execute
        </button>
        <button
          type="button"
          onClick={onReject}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 8,
            background: 'transparent',
            color: '#be123c',
            border: '1px solid #fda4af',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <X size={14} /> Reject / Cancel ({timeLeft}s)
        </button>
      </div>
    </div>
  )
}

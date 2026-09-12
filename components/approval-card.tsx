'use client'

import React from 'react'
import { AlertTriangle, Check, X, ShieldAlert } from 'lucide-react'

export type ApprovalCardProps = {
  toolName: string
  reason?: string
  params?: Record<string, any>
  onApprove: () => void
  onReject: () => void
}

export function ApprovalCard({ toolName, reason, params, onApprove, onReject }: ApprovalCardProps) {
  const cmdString = params?.command || params?.cmd || params?.path || JSON.stringify(params || {})

  return (
    <div
      style={{
        margin: '14px 0',
        padding: 16,
        borderRadius: 12,
        background: '#fff1f2',
        border: '1.5px solid #fecdd3',
        boxShadow: '0 4px 12px #9f123912',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#be123c', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        <ShieldAlert size={18} /> High-Risk Action Requires Approval
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#881337', lineHeight: 1.5 }}>
        {reason || `The AI assistant requested to execute a potentially dangerous action (${toolName}).`}
      </p>

      {cmdString && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#ffe4e6', fontFamily: 'monospace', fontSize: 12, color: '#9f1239', marginBottom: 12, wordBreak: 'break-all' }}>
          {cmdString}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          <Check size={14} /> Approve & Execute
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
          <X size={14} /> Reject Action
        </button>
      </div>
    </div>
  )
}

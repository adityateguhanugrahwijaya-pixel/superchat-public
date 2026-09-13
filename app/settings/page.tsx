'use client'

import { FormEvent, useEffect, useState } from 'react'
import { POPULAR_PROMPT_PRESETS } from '@/lib/presets'
import { authClient } from '@/lib/auth-client'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart2,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  Globe,
  Key,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'

type SettingsTab = 'api' | 'account' | 'instructions' | 'usage' | 'data' | 'updates'

type UsageHistoryItem = { date: string; tokens: number; requests: number }
type ModelUsageItem = { model: string; tokens: number; requests: number }
type UsageData = {
  used: number
  totalUsed: number
  dailyLimit: number
  plan: string
  routerUrl: string
  isCustom: boolean
  history: UsageHistoryItem[]
  models: ModelUsageItem[]
}

type Preset = {
  name: string
  url: string
  description: string
}

const ROUTER_PRESETS: Preset[] = [
  { name: 'Default Bynara', url: 'https://router.bynara.id/v1', description: 'Shared zero-config router' },
  { name: 'Local Ollama', url: 'http://localhost:11434/v1', description: 'Local offline LLM server' },
  { name: 'OpenAI Direct', url: 'https://api.openai.com/v1', description: 'Official OpenAI API' },
  { name: 'DeepSeek Direct', url: 'https://api.deepseek.com/v1', description: 'Official DeepSeek API' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', description: 'OpenRouter multi-model gateway' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api')
  const [mode, setMode] = useState('superchat')
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [globalPrompt, setGlobalPrompt] = useState('')
  const [hasSavedKey, setHasSavedKey] = useState(false)
  const [globalSandboxEnabled, setGlobalSandboxEnabled] = useState(true)
  const [userSandboxEnabled, setUserSandboxEnabled] = useState(true)

  // Account Profile States
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [tokensUsedToday, setTokensUsedToday] = useState(0)

  // Username Update State
  const [newUsername, setNewUsername] = useState('')
  const [updatingUsername, setUpdatingUsername] = useState(false)
  const [usernameMsg, setUsernameMsg] = useState<{ ok: boolean; message: string } | null>(null)

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; message: string } | null>(null)

  // Settings Save Status & Testing Feedback
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Data Management States
  const [exporting, setExporting] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; message: string } | null>(null)

  // App Auto-Updater States
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [updateMsg, setUpdateMsg] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    // Check update on mount
    fetch('/api/update')
      .then((r) => r.json())
      .then((data) => setUpdateInfo(data))
      .catch(() => {})
  }, [])

  async function checkAppUpdate() {
    setCheckingUpdate(true)
    setUpdateMsg(null)
    try {
      const res = await fetch('/api/update')
      const data = await res.json()
      setUpdateInfo(data)
      if (!data.hasUpdate) {
        setUpdateMsg({ ok: true, message: `SuperChat is up to date (v${data.currentVersion})!` })
      }
    } catch {
      setUpdateMsg({ ok: false, message: 'Failed to connect to GitHub Release API.' })
    } finally {
      setCheckingUpdate(false)
    }
  }

  async function triggerAppUpdate() {
    if (installingUpdate) return
    setInstallingUpdate(true)
    setUpdateMsg(null)
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl: updateInfo?.downloadUrl,
          checksumSha256: updateInfo?.checksumSha256,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setUpdateMsg({ ok: true, message: '🚀 Update launched! Application is updating and restarting in the background...' })
      } else {
        setUpdateMsg({ ok: false, message: data.error || 'Failed to trigger update process.' })
      }
    } catch {
      setUpdateMsg({ ok: true, message: '🚀 Update launched! Application is restarting...' })
    } finally {
      setInstallingUpdate(false)
    }
  }

  async function handleSignOut() {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = '/sign-in'
          },
        },
      })
    } catch {
      window.location.href = '/sign-in'
    }
  }

  async function exportChatData() {
    setExporting(true)
    setDataMsg(null)
    try {
      const res = await fetch('/api/chats?export=true')
      if (!res.ok) throw new Error('Failed to export chat data.')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dateStr = new Date().toISOString().split('T')[0]
      a.href = url
      a.download = `superchat_export_${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setDataMsg({ ok: true, message: 'Chat data exported successfully!' })
    } catch (err: any) {
      setDataMsg({ ok: false, message: err.message || 'Error exporting chat data.' })
    } finally {
      setExporting(false)
    }
  }

  async function deleteAllChats() {
    setDeletingAll(true)
    setDataMsg(null)
    try {
      const res = await fetch('/api/chats?all=true', { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setConfirmDeleteAll(false)
        setDataMsg({ ok: true, message: `Successfully deleted all chat history (${data.deletedCount || 0} conversations removed).` })
      } else {
        setDataMsg({ ok: false, message: data.error || 'Failed to delete chat history.' })
      }
    } catch {
      setDataMsg({ ok: false, message: 'Network error deleting chat history.' })
    } finally {
      setDeletingAll(false)
    }
  }

  // Usage & Stats Detailed States
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loadingUsage, setLoadingUsage] = useState<boolean>(true)
  const [usageError, setUsageError] = useState<string | null>(null)

  const fetchUsageData = async () => {
    setLoadingUsage(true)
    setUsageError(null)
    try {
      const res = await fetch('/api/usage')
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized. Please sign in.')
        }
        throw new Error(`Failed to fetch usage data (${res.status})`)
      }
      const data: UsageData = await res.json()
      setUsageData(data)
      setTokensUsedToday(data.used || 0)
    } catch (err: any) {
      setUsageError(err.message || 'Error loading usage statistics')
    } finally {
      setLoadingUsage(false)
    }
  }

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return
        setMode(s.apiMode || 'superchat')
        setUrl(s.customRouterUrl || '')
        setHasSavedKey(Boolean(s.hasCustomApiKey))
        setGlobalPrompt(s.globalSystemPrompt || '')
        setGlobalSandboxEnabled(s.globalSandboxEnabled !== false)
        setUserSandboxEnabled(s.userSandboxEnabled !== false)
        setUserName(s.userName || '')
        setNewUsername(s.userName || '')
        setUserEmail(s.userEmail || '')
        setUserId(s.userId || '')
      })
      .catch(() => {})

    fetchUsageData()
  }, [])

  async function submitSettings(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiMode: mode,
          customRouterUrl: url,
          customApiKey: key || undefined,
          globalSystemPrompt: globalPrompt,
          userSandboxEnabled,
        }),
      })
      if (res.ok) {
        if (key.trim()) setHasSavedKey(true)
        setKey('')
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function updateUsername(e: FormEvent) {
    e.preventDefault()
    if (!newUsername.trim() || updatingUsername) return
    setUpdatingUsername(true)
    setUsernameMsg(null)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newUsername.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setUserName(newUsername.trim())
        setUsernameMsg({ ok: true, message: 'Username updated successfully!' })
      } else {
        setUsernameMsg({ ok: false, message: data.error || 'Failed to update username.' })
      }
    } catch {
      setUsernameMsg({ ok: false, message: 'Network error updating username.' })
    } finally {
      setUpdatingUsername(false)
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordMsg(null)

    if (!currentPassword) {
      setPasswordMsg({ ok: false, message: 'Please enter your current password.' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ ok: false, message: 'New password must be at least 8 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, message: 'New passwords do not match.' })
      return
    }

    setUpdatingPassword(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setPasswordMsg({ ok: true, message: 'Password updated successfully!' })
      } else {
        setPasswordMsg({ ok: false, message: data.error || 'Failed to change password.' })
      }
    } catch {
      setPasswordMsg({ ok: false, message: 'Network error changing password.' })
    } finally {
      setUpdatingPassword(false)
    }
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_connection',
          customRouterUrl: mode === 'byo' ? url : 'https://router.bynara.id/v1',
          customApiKey: mode === 'byo' ? key : undefined,
        }),
      })
      const data = await res.json()
      setTestResult({ ok: data.ok, message: data.message })
    } catch {
      setTestResult({ ok: false, message: 'Failed to test connection due to network failure.' })
    } finally {
      setTesting(false)
    }
  }

  function getInitials(name?: string, email?: string): string {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/)
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      return parts[0].slice(0, 2).toUpperCase()
    }
    if (email && email.trim()) return email.split('@')[0].slice(0, 2).toUpperCase()
    return 'SC'
  }

  return (
    <main className="admin-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <header>
        <div>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, textDecoration: 'none' }}>
            <ArrowLeft size={16} /> Return to Chat
          </a>
          <h1>Account & API Settings</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
            Manage your account profile, change password, and configure LLM router connections.
          </p>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 24, paddingBottom: 2, overflowX: 'auto', flexWrap: 'nowrap', maxWidth: '100%' }}>
        <button
          onClick={() => setActiveTab('api')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            border: 0,
            background: activeTab === 'api' ? 'var(--white)' : 'transparent',
            color: activeTab === 'api' ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: activeTab === 'api' ? 600 : 500,
            borderRadius: '8px 8px 0 0',
            borderBottom: activeTab === 'api' ? '2px solid var(--primary)' : '2px solid transparent',
            fontSize: 13,
          }}
        >
          <Key size={16} /> API & Router
        </button>

        <button
          onClick={() => setActiveTab('account')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            border: 0,
            background: activeTab === 'account' ? 'var(--white)' : 'transparent',
            color: activeTab === 'account' ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: activeTab === 'account' ? 600 : 500,
            borderRadius: '8px 8px 0 0',
            borderBottom: activeTab === 'account' ? '2px solid var(--primary)' : '2px solid transparent',
            fontSize: 13,
          }}
        >
          <User size={16} /> Profile & Password
        </button>

        <button
          onClick={() => setActiveTab('instructions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            border: 0,
            background: activeTab === 'instructions' ? 'var(--white)' : 'transparent',
            color: activeTab === 'instructions' ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: activeTab === 'instructions' ? 600 : 500,
            borderRadius: '8px 8px 0 0',
            borderBottom: activeTab === 'instructions' ? '2px solid var(--primary)' : '2px solid transparent',
            fontSize: 13,
          }}
        >
          <Sparkles size={16} /> Custom Instructions
        </button>

        <button
          onClick={() => setActiveTab('usage')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            border: 0,
            background: activeTab === 'usage' ? 'var(--white)' : 'transparent',
            color: activeTab === 'usage' ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: activeTab === 'usage' ? 600 : 500,
            borderRadius: '8px 8px 0 0',
            borderBottom: activeTab === 'usage' ? '2px solid var(--primary)' : '2px solid transparent',
            fontSize: 13,
          }}
        >
          <Activity size={16} /> Usage & Stats
        </button>

        <button
          onClick={() => setActiveTab('data')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            border: 0,
            background: activeTab === 'data' ? 'var(--white)' : 'transparent',
            color: activeTab === 'data' ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: activeTab === 'data' ? 600 : 500,
            borderRadius: '8px 8px 0 0',
            borderBottom: activeTab === 'data' ? '2px solid var(--primary)' : '2px solid transparent',
            fontSize: 13,
          }}
        >
          <Database size={16} /> Data & Privacy
        </button>

        <button
          onClick={() => setActiveTab('updates')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            border: 0,
            background: activeTab === 'updates' ? 'var(--white)' : 'transparent',
            color: activeTab === 'updates' ? 'var(--primary)' : 'var(--muted-foreground)',
            fontWeight: activeTab === 'updates' ? 600 : 500,
            borderRadius: '8px 8px 0 0',
            borderBottom: activeTab === 'updates' ? '2px solid var(--primary)' : '2px solid transparent',
            fontSize: 13,
            position: 'relative',
          }}
        >
          <RefreshCw size={16} /> Updates
          {updateInfo?.hasUpdate && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#16a34a',
                display: 'inline-block',
                marginLeft: 2,
              }}
            />
          )}
        </button>
      </div>

      {/* Tab 1: API & Router */}
      {activeTab === 'api' && (
        <form onSubmit={submitSettings}>
          <div className="admin-grid">
            <article className="admin-wide" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  <Cpu size={18} color="var(--primary)" /> API Connection Mode
                </h2>
                <p style={{ margin: '4px 0 14px', fontSize: 13, color: 'var(--muted-foreground)' }}>
                  Choose how SuperChat routes requests to AI completion endpoints.
                </p>
              </div>

              <label className="settings-choice" style={{ cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="apiMode"
                  checked={mode === 'superchat'}
                  onChange={() => setMode('superchat')}
                />
                <span style={{ fontWeight: 600 }}>Default Bynara Router</span>
                <small>Uses the shared Bynara router endpoint (https://router.bynara.id/v1) with zero configuration.</small>
              </label>

              <label className="settings-choice" style={{ cursor: 'pointer' }}>
                <input type="radio" name="apiMode" checked={mode === 'byo'} onChange={() => setMode('byo')} />
                <span style={{ fontWeight: 600 }}>Bring Your Own (BYO) Router</span>
                <small>Connect to any custom OpenAI-compatible endpoint with your own API Key.</small>
              </label>

              {mode === 'byo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8, padding: 16, background: '#fafafc', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                      Quick Router Presets
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {ROUTER_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => setUrl(preset.url)}
                          style={{
                            padding: '6px 12px',
                            border: url === preset.url ? '1px solid var(--primary)' : '1px solid var(--border)',
                            borderRadius: 20,
                            background: url === preset.url ? 'var(--primary-soft)' : 'var(--white)',
                            color: url === preset.url ? 'var(--primary)' : 'var(--foreground)',
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
                    Router Endpoint URL
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://router.example.com/v1"
                      required={mode === 'byo'}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 13,
                        outline: 'none',
                        background: 'var(--white)',
                      }}
                    />
                    <small style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}>
                      Must be an OpenAI-compatible /v1 endpoint supporting /chat/completions.
                    </small>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
                    Custom API Key
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder={hasSavedKey ? '•••••••••••••••• (Leave blank to keep saved key)' : 'sk-...'}
                        style={{
                          width: '100%',
                          padding: '10px 40px 10px 12px',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          fontSize: 13,
                          outline: 'none',
                          background: 'var(--white)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        style={{
                          position: 'absolute',
                          right: 8,
                          border: 0,
                          background: 'transparent',
                          color: 'var(--muted-foreground)',
                          padding: 4,
                        }}
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {hasSavedKey && !key && (
                      <small style={{ fontWeight: 500, color: '#059669' }}>✓ Encrypted API Key is saved in SQLite.</small>
                    )}
                  </label>
                </div>
              )}

              {/* Test Connection Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '8px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--white)',
                    color: 'var(--foreground)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <RefreshCw size={14} className={testing ? 'loading-dots' : ''} />
                  {testing ? 'Testing connection...' : 'Test Connection'}
                </button>

                {testResult && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      color: testResult.ok ? '#059669' : '#dc2626',
                    }}
                  >
                    {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {testResult.message}
                  </div>
                )}
              </div>
            </article>

            {/* Sandbox & Autonomous Tools Settings Card */}
            <article className="admin-wide" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  <Shield size={18} color="var(--primary)" /> Autonomous Sandbox Workspace
                </h2>
                <p style={{ margin: '4px 0 14px', fontSize: 13, color: 'var(--muted-foreground)' }}>
                  Control whether SuperChat can execute autonomous sandbox tools (file operations, python/node scripts, shell commands) for your account.
                </p>
              </div>

              {!globalSandboxEnabled ? (
                <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Sandbox System Unavailable:</strong> The isolated sandbox workspace system is disabled globally by the server administrator in <code>appconfig.json</code>.
                  </div>
                </div>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: '#fafafc', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: 14, color: 'var(--foreground)' }}>Enable Personal Sandbox Workspace</strong>
                    <small style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                      Allows SuperChat AI to create, edit, run code, and manage files in your conversation sandbox directory.
                    </small>
                  </div>
                  <input
                    type="checkbox"
                    checked={userSandboxEnabled}
                    onChange={(e) => setUserSandboxEnabled(e.target.checked)}
                    style={{ width: 20, height: 20, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                </label>
              )}
            </article>
          </div>

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="submit" disabled={saving} className="primary-button" style={{ width: 'auto', padding: '10px 24px' }}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {saved && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Settings saved successfully!</span>}
          </div>
        </form>
      )}

      {/* Tab 2: Profile & Password Management */}
      {activeTab === 'account' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* User Profile Card */}
          <div className="admin-grid">
            <article className="admin-wide">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <User size={18} color="var(--primary)" /> Profile Information
              </h2>
              <p style={{ margin: '4px 0 20px', fontSize: 13, color: 'var(--muted-foreground)' }}>
                Update your display name / username. Email address is locked to maintain chat history links.
              </p>

              <form onSubmit={updateUsername} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: '#fafafc', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div className="profile-dot" style={{ width: 50, height: 50, fontSize: 18 }}>
                    {getInitials(userName, userEmail)}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{userName || userEmail || 'Account User'}</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>{userEmail}</p>
                  </div>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
                  Display Name / Username
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Enter your name"
                    required
                    style={{
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 14,
                      outline: 'none',
                      background: 'var(--white)',
                    }}
                  />
                </label>

                {/* Email Address (Locked & Read-Only) */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Email Address <Lock size={13} color="var(--muted-foreground)" />
                  </span>
                  <input
                    type="email"
                    value={userEmail}
                    readOnly
                    disabled
                    style={{
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 14,
                      outline: 'none',
                      background: '#f1f1f5',
                      color: 'var(--muted-foreground)',
                      cursor: 'not-allowed',
                    }}
                  />
                  <small style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}>
                    🔒 Email address cannot be changed because your chat history files are permanently linked under <code>chats/{userEmail}/</code>.
                  </small>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <button type="submit" disabled={updatingUsername} className="primary-button" style={{ width: 'auto', padding: '9px 20px' }}>
                    {updatingUsername ? 'Saving...' : 'Update Username'}
                  </button>

                  {usernameMsg && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: usernameMsg.ok ? '#059669' : '#dc2626' }}>
                      {usernameMsg.ok ? '✓ ' : '❌ '}{usernameMsg.message}
                    </span>
                  )}
                </div>
              </form>
            </article>
          </div>

          {/* Change Password Card */}
          <div className="admin-grid">
            <article className="admin-wide">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <Shield size={18} color="var(--primary)" /> Change Password
              </h2>
              <p style={{ margin: '4px 0 20px', fontSize: 13, color: 'var(--muted-foreground)' }}>
                Update your account password securely.
              </p>

              <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 500 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
                  Current Password
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      required
                      style={{
                        width: '100%',
                        padding: '10px 40px 10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 14,
                        outline: 'none',
                        background: 'var(--white)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      style={{ position: 'absolute', right: 8, border: 0, background: 'transparent', color: 'var(--muted-foreground)', padding: 4 }}
                    >
                      {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
                  New Password
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                      minLength={8}
                      style={{
                        width: '100%',
                        padding: '10px 40px 10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 14,
                        outline: 'none',
                        background: 'var(--white)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      style={{ position: 'absolute', right: 8, border: 0, background: 'transparent', color: 'var(--muted-foreground)', padding: 4 }}
                    >
                      {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
                  Confirm New Password
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    style={{
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 14,
                      outline: 'none',
                      background: 'var(--white)',
                    }}
                  />
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <button type="submit" disabled={updatingPassword} className="primary-button" style={{ width: 'auto', padding: '9px 20px' }}>
                    {updatingPassword ? 'Updating...' : 'Change Password'}
                  </button>

                  {passwordMsg && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: passwordMsg.ok ? '#059669' : '#dc2626' }}>
                      {passwordMsg.ok ? '✓ ' : '❌ '}{passwordMsg.message}
                    </span>
                  )}
                </div>
              </form>
            </article>
          </div>

          {/* Session & Log Out Card */}
          <div className="admin-grid" style={{ marginTop: 24 }}>
            <article className="admin-wide">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: '#dc2626' }}>
                <LogOut size={18} color="#dc2626" /> Session & Log Out
              </h2>
              <p style={{ margin: '4px 0 20px', fontSize: 13, color: 'var(--muted-foreground)' }}>
                Sign out of your active session on this device.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, border: '1px solid #fee2e2', background: '#fef2f2', borderRadius: 12 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, color: '#991b1b' }}>Log out of SuperChat</h4>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#b91c1c' }}>
                    Revokes your session cookies and redirects to the sign-in screen.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="primary-button"
                  style={{
                    width: 'auto',
                    padding: '9px 20px',
                    background: '#dc2626',
                    borderColor: '#b91c1c',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <LogOut size={16} /> Log Out
                </button>
              </div>
            </article>
          </div>
        </div>
      )}

      {/* Tab 3: Custom Instructions */}
      {activeTab === 'instructions' && (
        <form onSubmit={submitSettings}>
          <div className="admin-grid">
            <article className="admin-wide">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <Sparkles size={18} color="var(--primary)" /> Global Custom Instructions
              </h2>
              <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--muted-foreground)' }}>
                Define default system prompts sent at the start of every new conversation.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Popular System Prompt Presets
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {POPULAR_PROMPT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setGlobalPrompt(preset.prompt)}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: globalPrompt === preset.prompt ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                        background: globalPrompt === preset.prompt ? 'var(--primary-soft)' : 'var(--white)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 6 }}>
                        <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>{preset.title}</strong>
                        <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--primary)', color: '#fff', padding: '2px 7px', borderRadius: 99 }}>
                          {preset.tag}
                        </span>
                      </div>
                      <small style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                        {preset.description}
                      </small>
                    </button>
                  ))}
                </div>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, fontWeight: 600 }}>
                Global Default System Prompt
                <textarea
                  rows={6}
                  value={globalPrompt}
                  onChange={(e) => setGlobalPrompt(e.target.value)}
                  placeholder="e.g. You are SuperChat, a helpful coding & thinking partner. Keep responses concise and format code nicely."
                  style={{
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                  }}
                />
                <small style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}>
                  This prompt will automatically pre-fill new chat conversations unless overridden in chat settings.
                </small>
              </label>
            </article>
          </div>

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="submit" disabled={saving} className="primary-button" style={{ width: 'auto', padding: '10px 24px' }}>
              {saving ? 'Saving...' : 'Save Instructions'}
            </button>
            {saved && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Instructions saved successfully!</span>}
          </div>
        </form>
      )}

      {/* Tab 4: Usage & Stats */}
      {activeTab === 'usage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Usage & Activity Statistics</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
                Track daily token consumption, active router endpoints, and request history.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchUsageData}
              disabled={loadingUsage}
              className="ghost-button"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}
            >
              <RefreshCw size={14} className={loadingUsage ? 'spin' : ''} />
              {loadingUsage ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {usageError && (
            <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={18} color="#dc2626" />
              <div style={{ flex: 1 }}>{usageError}</div>
              <button onClick={fetchUsageData} style={{ background: '#dc2626', color: '#fff', border: 0, padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          )}

          {loadingUsage && !usageData ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 14 }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', display: 'block', color: 'var(--primary)' }} />
              Loading usage statistics...
            </div>
          ) : (
            <>
              {/* Cards grid */}
              <div className="admin-grid">
                <article>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 14, fontWeight: 600 }}>
                    <Activity size={18} color="var(--primary)" /> Tokens Used Today
                  </h3>
                  <p style={{ margin: '14px 0 4px', fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--primary)' }}>
                    {(usageData?.used || tokensUsedToday).toLocaleString()}
                  </p>
                  <div className="usage-track" style={{ height: 6, borderRadius: 99, background: 'var(--muted)', margin: '10px 0 6px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        background: 'var(--primary)',
                        width: usageData?.dailyLimit
                          ? `${Math.min(100, (((usageData?.used || tokensUsedToday) / usageData.dailyLimit) * 100))}%`
                          : `${Math.min(100, Math.max(10, (((usageData?.used || tokensUsedToday) / 100000) * 100)))}%`,
                        borderRadius: 'inherit',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <small style={{ color: 'var(--muted-foreground)', fontSize: 12, display: 'block' }}>
                    {usageData?.dailyLimit
                      ? `Limit: ${usageData.dailyLimit.toLocaleString()} tokens/day (resets 00:00 UTC)`
                      : 'Limits: Dynamic & varied per active AI model & router'}
                  </small>
                </article>

                <article>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 14, fontWeight: 600 }}>
                    <BarChart2 size={18} color="var(--primary)" /> Total Tokens (All Time)
                  </h3>
                  <p style={{ margin: '14px 0 4px', fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--foreground)' }}>
                    {(usageData?.totalUsed || 0).toLocaleString()}
                  </p>
                  <small style={{ color: 'var(--muted-foreground)', fontSize: 12, display: 'block', marginTop: 16 }}>
                    Lifetime cumulative token count processed across all conversations
                  </small>
                </article>

                <article>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 14, fontWeight: 600 }}>
                    <Globe size={18} color="var(--primary)" /> Active Router
                  </h3>
                  <p style={{ margin: '14px 0 4px', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {usageData?.routerUrl || (mode === 'byo' ? url || 'Custom Router' : 'https://router.bynara.id/v1')}
                  </p>
                  <small style={{ color: 'var(--muted-foreground)', fontSize: 12, display: 'block', marginTop: 16 }}>
                    Endpoint Mode: {usageData?.isCustom ? 'Custom Router (BYO)' : 'Standard Bynara Router'}
                  </small>
                </article>
              </div>

              {/* Usage History Breakdown */}
              <article style={{ padding: 20, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--white)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={16} color="var(--primary)" /> Daily Usage History (Last 14 Days)
                </h3>
                {usageData?.history && usageData.history.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {usageData.history.map((item) => (
                      <div key={item.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'var(--background)', fontSize: 13 }}>
                        <strong style={{ fontWeight: 600 }}>{item.date}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{item.requests} requests</span>
                          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{Number(item.tokens).toLocaleString()} tokens</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>
                    No usage history logged yet. Send a message to start tracking your tokens!
                  </p>
                )}
              </article>

              {/* Model Usage Breakdown */}
              {usageData?.models && usageData.models.length > 0 && (
                <article style={{ padding: 20, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--white)' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Cpu size={16} color="var(--primary)" /> Token Consumption by AI Model
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {usageData.models.map((m) => (
                      <div key={m.model} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'var(--background)', fontSize: 13 }}>
                        <strong style={{ fontWeight: 600, textTransform: 'capitalize' }}>{m.model}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{m.requests} requests</span>
                          <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>{Number(m.tokens).toLocaleString()} tokens</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 5: Data & Privacy */}
      {activeTab === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {dataMsg && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                background: dataMsg.ok ? '#ecfdf5' : '#fef2f2',
                color: dataMsg.ok ? '#047857' : '#b91c1c',
                border: dataMsg.ok ? '1px solid #a7f3d0' : '1px solid #fecaca',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {dataMsg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {dataMsg.message}
            </div>
          )}

          {/* Export Chat Data */}
          <article className="admin-wide" style={{ padding: 22, borderRadius: 14, background: 'var(--white)', border: '1px solid var(--border)' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Download size={18} color="var(--primary)" /> Export User Chat Data
            </h2>
            <p style={{ margin: '6px 0 18px', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Download a complete JSON archive of your conversation history, messages, system prompts, and AI model configurations.
            </p>

            <button
              type="button"
              onClick={exportChatData}
              disabled={exporting}
              className="primary-button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 'auto', padding: '10px 20px' }}
            >
              <Download size={15} />
              {exporting ? 'Preparing export...' : 'Export Chat Data (JSON)'}
            </button>
          </article>

          {/* Danger Zone: Delete All Chats */}
          <article className="admin-wide" style={{ padding: 22, borderRadius: 14, background: '#fff5f5', border: '1px solid #fca5a5' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: '#dc2626' }}>
              <Trash2 size={18} color="#dc2626" /> Delete All Chat History
            </h2>
            <p style={{ margin: '6px 0 18px', fontSize: 13, color: '#7f1d1d' }}>
              Permanently purge all conversation files saved under your account (<code>chats/{userEmail}/</code>). This action is irreversible.
            </p>

            {!confirmDeleteAll ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  borderRadius: 9,
                  border: 0,
                  background: '#dc2626',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={15} /> Delete All Conversations
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: 'white', borderRadius: 10, border: '1px solid #fca5a5', maxWidth: 460 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#b91c1c' }}>
                  <AlertTriangle size={16} /> Are you sure you want to delete ALL chats?
                </div>
                <small style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                  This will permanently delete all conversation history files. You cannot undo this action.
                </small>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={deleteAllChats}
                    disabled={deletingAll}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 7,
                      border: 0,
                      background: '#dc2626',
                      color: 'white',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {deletingAll ? 'Deleting...' : 'Yes, Delete Everything'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAll(false)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'var(--white)',
                      color: 'var(--foreground)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </article>
        </div>
      )}

      {/* Tab 6: Updates */}
      {activeTab === 'updates' && (
        <div className="admin-grid">
          <article className="admin-wide" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <RefreshCw size={18} color="var(--primary)" /> SuperChat Auto-Updater
              </h2>
              <p style={{ margin: '4px 0 14px', fontSize: 13, color: 'var(--muted-foreground)' }}>
                Check for official GitHub releases, inspect patch metadata, and perform 1-click application updates.
              </p>
            </div>

            {updateMsg && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  background: updateMsg.ok ? '#f0fdf4' : '#fef2f2',
                  color: updateMsg.ok ? '#166534' : '#991b1b',
                  border: `1px solid ${updateMsg.ok ? '#bbf7d0' : '#fecaca'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {updateMsg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{updateMsg.message}</span>
              </div>
            )}

            <div style={{ padding: 18, background: 'var(--background)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <strong style={{ fontSize: 14 }}>Current App Version</strong>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>
                    v{updateInfo?.currentVersion || '1.0.7'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={checkAppUpdate}
                  disabled={checkingUpdate}
                  style={{
                    padding: '8px 16px',
                    height: 'auto',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--white)',
                    color: 'var(--foreground)',
                    cursor: checkingUpdate ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <RefreshCw size={14} className={checkingUpdate ? 'spin' : ''} />
                  {checkingUpdate ? 'Checking...' : 'Check for Updates'}
                </button>
              </div>

              {updateInfo?.hasUpdate ? (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={16} color="#16a34a" /> Update Available: {updateInfo.latestVersion} ({updateInfo.isDifferential ? 'Differential Patch ~' + Math.round(updateInfo.downloadSize / 1024) + ' KB' : 'Full Release ~' + Math.round(updateInfo.downloadSize / 1024) + ' KB'})
                    </div>
                    {updateInfo.releaseNotes && (
                      <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {updateInfo.releaseNotes}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={triggerAppUpdate}
                      disabled={installingUpdate}
                      style={{
                        padding: '10px 18px',
                        borderRadius: 8,
                        border: 0,
                        background: 'var(--primary)',
                        color: 'var(--white)',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: installingUpdate ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        boxShadow: '0 2px 8px #00000015',
                      }}
                    >
                      <Download size={16} />
                      {installingUpdate ? 'Updating & Restarting…' : 'Install Update Now'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                  ✓ You are running the latest version of SuperChat.
                </div>
              )}
            </div>
          </article>
        </div>
      )}
    </main>
  )
}

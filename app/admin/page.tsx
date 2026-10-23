'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Search,
  Eye,
  Brain,
  Globe,
  CheckCircle2,
  XCircle,
  Shield,
  Layers,
  Sparkles,
  Users,
  Activity,
  ArrowLeft,
  Filter
} from 'lucide-react'

type UserItem = {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
}

type UsageItem = {
  date: string
  tokens: string
  users: number
}

type ModelItem = {
  id: string
  name: string
  owned_by: string
  context_window: number
  vision: boolean
  reasoning: boolean
  web_search: boolean
  disabled: boolean
}

type Data = {
  users: UserItem[]
  usage: UsageItem[]
  models: ModelItem[]
}

export default function AdminPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [searchModel, setSearchModel] = useState('')
  const [modelFilter, setModelFilter] = useState<'all' | 'active' | 'disabled' | 'vision' | 'reasoning'>('all')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin')
      .then(async (r) => {
        if (!r.ok) throw new Error('forbidden')
        return r.json()
      })
      .then((res) => {
        setData({
          users: res.users || [],
          usage: res.usage || [],
          models: res.models || [],
        })
      })
      .catch(() => setError('Akses ditolak. Halaman ini khusus untuk administrator.'))
  }, [])

  const handleToggleModel = async (modelId: string, currentDisabled: boolean) => {
    if (!data) return
    const nextDisabled = !currentDisabled

    // Optimistic UI update
    setData({
      ...data,
      models: data.models.map((m) => (m.id === modelId ? { ...m, disabled: nextDisabled } : m)),
    })
    setTogglingId(modelId)

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle-model',
          modelId,
          disabled: nextDisabled,
        }),
      })

      if (!res.ok) {
        throw new Error('Gagal memperbarui status model')
      }
    } catch (err) {
      // Revert optimistic update on failure
      setData({
        ...data,
        models: data.models.map((m) => (m.id === modelId ? { ...m, disabled: currentDisabled } : m)),
      })
      alert('Gagal mengubah status model. Silakan coba lagi.')
    } finally {
      setTogglingId(null)
    }
  }

  const formatContext = (ctx: number) => {
    if (!ctx) return '32K'
    if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`
    if (ctx >= 1_000) return `${Math.round(ctx / 1000)}K`
    return `${ctx}`
  }

  const filteredModels = useMemo(() => {
    if (!data?.models) return []
    return data.models.filter((m) => {
      // Text search
      const q = searchModel.trim().toLowerCase()
      const matchQuery = !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.owned_by.toLowerCase().includes(q)
      if (!matchQuery) return false

      // Category filter
      if (modelFilter === 'active') return !m.disabled
      if (modelFilter === 'disabled') return m.disabled
      if (modelFilter === 'vision') return m.vision
      if (modelFilter === 'reasoning') return m.reasoning
      return true
    })
  }, [data?.models, searchModel, modelFilter])

  const stats = useMemo(() => {
    const list = data?.models || []
    return {
      total: list.length,
      active: list.filter((m) => !m.disabled).length,
      disabled: list.filter((m) => m.disabled).length,
      vision: list.filter((m) => m.vision).length,
      reasoning: list.filter((m) => m.reasoning).length,
    }
  }, [data?.models])

  if (error) {
    return (
      <main className="auth-page">
        <section className="auth-card" style={{ textAlign: 'center' }}>
          <p className="eyebrow" style={{ color: '#ef4444' }}>ADMIN RESTRICTED</p>
          <h1>Akses Dibatasi</h1>
          <p className="auth-subtitle">{error}</p>
          <a href="/" className="primary-button" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 12 }}>
            Kembali ke Chat
          </a>
        </section>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="auth-page">
        <p style={{ color: 'var(--muted-foreground)' }}>Memuat workspace administrator…</p>
      </main>
    )
  }

  return (
    <main className="admin-page" style={{ paddingBottom: 60 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <p className="eyebrow" style={{ letterSpacing: '0.08em', fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>
            SUPERCHAT CONTROL ROOM
          </p>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', margin: 0, fontWeight: 700, letterSpacing: '-0.03em' }}>
            Admin Dashboard
          </h1>
        </div>
        <a
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 10,
            background: 'var(--white)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={15} /> Kembali ke Chat
        </a>
      </header>

      {/* Stats Summary Bar */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginTop: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ background: 'var(--white)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 600 }}>
            <Layers size={15} /> Total Model
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{stats.total}</div>
        </div>

        <div style={{ background: 'var(--white)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontSize: 12, fontWeight: 600 }}>
            <CheckCircle2 size={15} /> Model Aktif
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#16a34a' }}>{stats.active}</div>
        </div>

        <div style={{ background: 'var(--white)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: stats.disabled > 0 ? '#ef4444' : 'var(--muted-foreground)', fontSize: 12, fontWeight: 600 }}>
            <XCircle size={15} /> Dinonaktifkan
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: stats.disabled > 0 ? '#ef4444' : 'var(--foreground)' }}>
            {stats.disabled}
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2563eb', fontSize: 12, fontWeight: 600 }}>
            <Eye size={15} /> Vision Ready
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{stats.vision}</div>
        </div>
      </section>

      {/* SECTION 1: MODEL MANAGEMENT (FEATURE IN FOCUS) */}
      <section style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={18} style={{ color: 'var(--primary)' }} /> Manajemen & Hak Akses Model AI
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Nonaktifkan model yang tidak diinginkan dengan toggle. Model yang dinonaktifkan tidak akan muncul pada pemilih model pengguna.
            </p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 20 }}>
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              placeholder="Cari model berdasarkan nama, id, atau provider..."
              value={searchModel}
              onChange={(e) => setSearchModel(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                borderRadius: 9,
                border: '1px solid var(--border)',
                background: 'var(--background)',
                fontSize: 13,
                outline: 'none',
                color: 'var(--foreground)',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `Semua (${stats.total})` },
              { id: 'active', label: `Aktif (${stats.active})` },
              { id: 'disabled', label: `Nonaktif (${stats.disabled})` },
              { id: 'vision', label: `Vision (${stats.vision})` },
              { id: 'reasoning', label: `Reasoning (${stats.reasoning})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setModelFilter(f.id as any)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: modelFilter === f.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: modelFilter === f.id ? 'var(--primary)' : 'var(--background)',
                  color: modelFilter === f.id ? '#ffffff' : 'var(--muted-foreground)',
                  transition: 'all 0.15s ease',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model Items Grid / List */}
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredModels.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>
              Tidak ada model yang sesuai dengan pencarian atau filter "{modelFilter}".
            </div>
          ) : (
            filteredModels.map((m) => {
              const isBusy = togglingId === m.id
              const isOff = m.disabled

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: isOff ? 'rgba(0, 0, 0, 0.02)' : 'var(--white)',
                    opacity: isOff ? 0.72 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Left: Model Info & Badges */}
                  <div style={{ flex: '1 1 320px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                        {m.name}
                      </strong>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 7px',
                          borderRadius: 5,
                          background: 'rgba(0, 0, 0, 0.05)',
                          color: 'var(--muted-foreground)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {m.id}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 20,
                          background: 'var(--primary-soft, #f0f4ff)',
                          color: 'var(--primary, #2563eb)',
                          fontWeight: 600,
                        }}
                      >
                        {m.owned_by}
                      </span>
                    </div>

                    {/* Capabilities & Type Tags */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {m.vision && (
                        <span
                          title="Mendukung input visual/gambar dan preview dokumen"
                          style={{
                            fontSize: 11,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                          }}
                        >
                          <Eye size={12} /> Vision
                        </span>
                      )}

                      {m.reasoning && (
                        <span
                          title="Mendukung penalaran mendalam / reasoning stream"
                          style={{
                            fontSize: 11,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: '#faf5ff',
                            color: '#7e22ce',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                          }}
                        >
                          <Brain size={12} /> Reasoning
                        </span>
                      )}

                      {m.web_search && (
                        <span
                          title="Mendukung live web search grounding"
                          style={{
                            fontSize: 11,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: '#f0fdf4',
                            color: '#15803d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                          }}
                        >
                          <Globe size={12} /> Web Search
                        </span>
                      )}

                      <span
                        title={`Batas konteks token: ${m.context_window?.toLocaleString()} tokens`}
                        style={{
                          fontSize: 11,
                          padding: '2px 7px',
                          borderRadius: 6,
                          background: 'var(--background)',
                          border: '1px solid var(--border)',
                          color: 'var(--muted-foreground)',
                          fontWeight: 500,
                        }}
                      >
                        {formatContext(m.context_window)} context
                      </span>
                    </div>
                  </div>

                  {/* Right: Status Pill & Toggle Switch */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: isOff ? '#ef4444' : '#16a34a',
                      }}
                    >
                      {isOff ? 'Nonaktif' : 'Aktif'}
                    </span>

                    {/* Interactive Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!isOff}
                      disabled={isBusy}
                      onClick={() => handleToggleModel(m.id, isOff)}
                      title={isOff ? `Klik untuk mengaktifkan ${m.name}` : `Klik untuk menonaktifkan ${m.name}`}
                      style={{
                        position: 'relative',
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        border: 'none',
                        background: isOff ? '#cbd5e1' : '#16a34a',
                        cursor: isBusy ? 'wait' : 'pointer',
                        padding: 2,
                        transition: 'background-color 0.2s ease',
                        outline: 'none',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#ffffff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                          transform: isOff ? 'translateX(0px)' : 'translateX(20px)',
                          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* SECTION 2: USAGE & USERS GRID */}
      <section className="admin-grid">
        <article className="admin-wide">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={17} style={{ color: 'var(--primary)' }} /> Penggunaan Sistem (30 Hari Terakhir)
          </h2>
          {data.usage.length === 0 ? (
            <p style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>Belum ada riwayat token tercatat.</p>
          ) : (
            data.usage.map((u) => (
              <div className="admin-row" key={u.date}>
                <strong>{u.date}</strong>
                <span>{Number(u.tokens).toLocaleString()} tokens</span>
                <small>{u.users} user aktif</small>
              </div>
            ))
          )}
        </article>

        <article className="admin-wide">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={17} style={{ color: 'var(--primary)' }} /> Akun Pengguna ({data.users.length})
          </h2>
          {data.users.map((u) => (
            <div className="admin-row" key={u.id}>
              <strong>{u.name || u.email}</strong>
              <span>{u.email}</span>
              <small>
                Role: {u.role}
                <span style={{ color: u.banned ? '#ef4444' : '#16a34a', marginLeft: 6 }}>
                  {u.banned ? '· disuspend' : '· aktif'}
                </span>
              </small>
            </div>
          ))}
        </article>
      </section>
    </main>
  )
}

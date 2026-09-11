'use client'

import { useEffect, useState } from 'react'

type Data = {
  users: { id: string; name: string; email: string; role: string; banned: boolean }[]
  usage: { date: string; tokens: string; users: number }[]
}

export default function AdminPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin')
      .then(async (r) => {
        if (!r.ok) throw new Error('forbidden')
        return r.json()
      })
      .then(setData)
      .catch(() => setError('This area is restricted to administrators.'))
  }, [])

  if (error)
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="eyebrow">ADMIN</p>
          <h1>Access restricted</h1>
          <p className="auth-subtitle">{error}</p>
        </section>
      </main>
    )

  if (!data)
    return (
      <main className="auth-page">
        <p>Loading admin workspace…</p>
      </main>
    )

  return (
    <main className="admin-page">
      <header>
        <div>
          <p className="eyebrow">SUPERCHAT CONTROL ROOM</p>
          <h1>Admin workspace</h1>
        </div>
        <a href="/">Back to chat</a>
      </header>
      <section className="admin-grid">
        <article className="admin-wide">
          <h2>System Usage (Last 30 Days)</h2>
          {data.usage.map((u) => (
            <div className="admin-row" key={u.date}>
              <strong>{u.date}</strong>
              <span>{Number(u.tokens).toLocaleString()} tokens</span>
              <small>{u.users} active users</small>
            </div>
          ))}
        </article>
        <article className="admin-wide">
          <h2>User Accounts ({data.users.length})</h2>
          {data.users.map((u) => (
            <div className="admin-row" key={u.id}>
              <strong>{u.name || u.email}</strong>
              <span>{u.email}</span>
              <small>Role: {u.role}{u.banned ? ' · suspended' : ' · active'}</small>
            </div>
          ))}
        </article>
      </section>
    </main>
  )
}

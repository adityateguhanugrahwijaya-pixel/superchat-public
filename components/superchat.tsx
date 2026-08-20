'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Check, ChevronDown, Copy, Menu, MessageSquarePlus, MoreHorizontal, PanelLeft, Pencil, Send, Settings2, Sparkles, Trash2, X } from 'lucide-react'

type Chat = { id: string; title: string; systemPrompt: string; model: string; updatedAt?: string }
type Message = { id?: string; role: 'user' | 'assistant'; content: string }
type Usage = { used: string | number; dailyLimit: string | number; plan: string }

const fallbackModels = [{ id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' }]

export function SuperChat() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [models, setModels] = useState(fallbackModels)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [usage, setUsage] = useState<Usage>({ used: 0, dailyLimit: 2000000, plan: 'Free' })

  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeId), [chats, activeId])

  useEffect(() => {
    fetch('/api/usage').then((r) => r.ok ? r.json() : null).then((data) => data && setUsage(data)).catch(() => {})
    Promise.all([fetch('/api/chats').then((r) => r.json()), fetch('/api/models').then((r) => r.ok ? r.json() : fallbackModels)])
      .then(([loadedChats, loadedModels]) => { setChats(loadedChats); setModels(loadedModels.length ? loadedModels : fallbackModels); if (loadedChats[0]) setActiveId(loadedChats[0].id) })
      .catch(() => {})
  }, [])

  useEffect(() => { if (activeId) fetch(`/api/chats/${activeId}`).then((r) => r.json()).then(setMessages).catch(() => setMessages([])) }, [activeId])

  async function createChat() {
    const model = models[0]?.id || fallbackModels[0].id
    const response = await fetch('/api/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) })
    const chat = await response.json()
    setChats((current) => [chat, ...current]); setActiveId(chat.id); setMessages([]); setSidebarOpen(false)
  }

  async function sendMessage(event?: React.FormEvent) {
    event?.preventDefault()
    const text = input.trim()
    if (!text || streaming) return
    let chat = activeChat
    if (!chat) { await createChat(); return }
    setInput(''); setStreaming(true)
    const userMessage = { role: 'user' as const, content: text }
    const assistantMessage = { role: 'assistant' as const, content: '' }
    setMessages((current) => [...current, userMessage, assistantMessage])
    if (messages.length === 0) {
      const title = text.length > 42 ? `${text.slice(0, 42)}…` : text
      setChats((current) => current.map((item) => item.id === chat!.id ? { ...item, title } : item))
      fetch('/api/chats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chat.id, title }) })
    }
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: chat.id, content: text, model: chat.model }) })
      if (!response.ok || !response.body) throw new Error('Request failed')
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let answer = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; answer += decoder.decode(value, { stream: true }); setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, content: answer } : item)) }
    } catch { setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, content: 'I could not reach the model router. Please check the server configuration and try again.' } : item)) }
    finally { setStreaming(false) }
  }

  async function deleteChat(id: string) { if (!window.confirm('Delete this conversation permanently?')) return; await fetch(`/api/chats?id=${id}`, { method: 'DELETE' }); const remaining = chats.filter((chat) => chat.id !== id); setChats(remaining); setActiveId(remaining[0]?.id || ''); setMessages([]) }
  async function renameChat(chat: Chat) { const title = window.prompt('Rename conversation', chat.title); if (!title?.trim()) return; await fetch('/api/chats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chat.id, title }) }); setChats((current) => current.map((item) => item.id === chat.id ? { ...item, title: title.trim() } : item)) }
  async function updateChat(patch: Partial<Chat>) { if (!activeChat) return; await fetch('/api/chats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: activeChat.id, ...patch }) }); setChats((current) => current.map((item) => item.id === activeChat.id ? { ...item, ...patch } : item)) }
  async function copyMessage(id: string, content: string) { await navigator.clipboard.writeText(content); setCopied(id); setTimeout(() => setCopied(null), 1400) }

  return <main className="superchat-shell">
    <aside className={`chat-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="sidebar-brand"><div className="brand-mark"><Sparkles size={17} /></div><span>SuperChat</span><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={18} /></button></div>
      <button className="new-chat-button" onClick={createChat}><MessageSquarePlus size={18} /> New conversation <span>⌘ K</span></button>
      <div className="history-label">Your conversations <span>{chats.length}</span></div>
      <nav className="chat-history" aria-label="Chat history">{chats.map((chat) => <div key={chat.id} className={`history-item ${chat.id === activeId ? 'active' : ''}`}><button onClick={() => { setActiveId(chat.id); setSidebarOpen(false) }}><MessageSquarePlus size={15} /><span>{chat.title}</span></button><div className="history-actions"><button onClick={() => renameChat(chat)} aria-label="Rename chat"><Pencil size={14} /></button><button onClick={() => deleteChat(chat.id)} aria-label="Delete chat"><Trash2 size={14} /></button></div></div>)}</nav>
      <div className="sidebar-footer"><div className="profile-dot">S</div><div className="sidebar-account"><strong>SuperChat · {usage.plan}</strong><small>{Number(usage.used).toLocaleString()} / {Number(usage.dailyLimit).toLocaleString()} tokens today</small><div className="usage-track"><span style={{ width: `${Math.min(100, (Number(usage.used) / Math.max(1, Number(usage.dailyLimit))) * 100)}%` }} /></div></div><a href="/settings" className="footer-more" aria-label="Account settings"><Settings2 size={17} /></a></div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
    <section className="chat-main">
      <header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><PanelLeft size={19} /></button><div className="mobile-title"><div className="brand-mark"><Sparkles size={15} /></div><strong>SuperChat</strong></div><div className="topbar-spacer" /><div className="model-control"><span className="status-dot" /><select aria-label="Select model" value={activeChat?.model || models[0]?.id} onChange={(event) => updateChat({ model: event.target.value })}>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select><ChevronDown size={15} /></div><button className={`icon-button ${settingsOpen ? 'selected' : ''}`} onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Chat settings"><Settings2 size={18} /></button></header>
      {settingsOpen && activeChat && <div className="settings-popover"><label>System prompt <textarea value={activeChat.systemPrompt} onChange={(event) => updateChat({ systemPrompt: event.target.value })} placeholder="How should SuperChat respond in this conversation?" /></label><small>Applied as the first instruction on every request.</small></div>}
      <div className="conversation"><div className="conversation-inner">{!activeChat || messages.length === 0 ? <div className="empty-state"><div className="empty-icon"><Bot size={25} /></div><p className="eyebrow">Your thinking partner</p><h1>What will we explore<br /><em>today?</em></h1><p className="empty-copy">Ask anything, sketch an idea, or bring a tricky problem. SuperChat is ready when you are.</p><div className="suggestions"><button onClick={() => setInput('Help me think through a new project idea')}><span>01</span>Help me think through a new project idea</button><button onClick={() => setInput('Explain a complex topic simply')}><span>02</span>Explain a complex topic simply</button><button onClick={() => setInput('Review and improve my writing')}><span>03</span>Review and improve my writing</button></div></div> : messages.map((message, index) => <article className={`message-row ${message.role}`} key={message.id || `${message.role}-${index}`}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={14} /> : 'S'}</div><div className="message-body"><div className="message-meta">{message.role === 'assistant' ? 'SuperChat' : 'You'} {message.role === 'assistant' && <span>· just now</span>}</div><div className="message-content">{message.role === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || 'Thinking…'}</ReactMarkdown> : message.content}</div>{message.role === 'assistant' && message.content && <button className="copy-button" onClick={() => copyMessage(message.id || String(index), message.content)}>{copied === (message.id || String(index)) ? <Check size={14} /> : <Copy size={14} />} {copied === (message.id || String(index)) ? 'Copied' : 'Copy'}</button>}</div></article>)}</div></div>
      <div className="composer-wrap"><form className="composer" onSubmit={sendMessage}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); sendMessage() } }} placeholder="Message SuperChat…" rows={1} disabled={streaming} /><div className="composer-footer"><span>Shift + Enter for new line</span><button className="send-button" type="submit" disabled={!input.trim() || streaming} aria-label="Send message">{streaming ? <span className="loading-dots">•••</span> : <Send size={17} />}</button></div></form><p className="disclaimer">SuperChat can make mistakes. Check important information.</p></div>
    </section>
  </main>
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { POPULAR_PROMPT_PRESETS } from '@/lib/presets'
import { FileCard } from './file-card'
import { ApprovalCard } from './approval-card'
import { SideCanvas, CanvasFile } from './side-canvas'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { authClient } from '@/lib/auth-client'
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  LogOut,
  Mic,
  MessageSquarePlus,
  PanelLeft,
  Paperclip,
  Pencil,
  Search,
  Send,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  X,
  BookOpen
} from 'lucide-react'

type Chat = { id: string; title: string; systemPrompt: string; model: string; updatedAt?: string; isAgentRunning?: boolean }
type Message = { id?: string; role: 'user' | 'assistant'; content: string }
type Usage = {
  used: string | number
  dailyLimit: string | number | null
  plan: string
  routerUrl?: string
  isCustom?: boolean
  userName?: string
  userEmail?: string
}
type AttachedFile = { name: string; content: string; size: number }

function getUserInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email && email.trim()) {
    const main = email.split('@')[0]
    return main.slice(0, 2).toUpperCase()
  }
  return 'SC'
}

function SuperChatLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.5 7C16.2 5.2 14.2 4 12 4C8.7 4 6 6.3 6 9.3C6 14.5 18 12.5 18 17.7C18 20.7 15.3 23 12 23C9.8 23 7.8 21.8 6.5 20"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.5" cy="4.5" r="1.5" fill="currentColor" />
    </svg>
  )
}



const fallbackModels = [
  { id: 'agnes-2.5-flash', name: 'Agnes 2.5 Flash' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek v4 Flash' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek v4 Pro' },
]


const PRESET_PROMPTS = [
  { id: 'code-review', name: 'Code Reviewer', description: 'Deep review for correctness, security & performance', prompt: 'Perform a comprehensive code review focusing on correctness, performance, security, and edge cases.' },
  { id: 'architect', name: 'System Architect', description: 'Scalable system architecture and design patterns', prompt: 'Act as a Lead Systems Architect. Design a scalable, high-performance architecture with diagram recommendations.' },
  { id: 'debugger', name: 'Bug Hunter', description: 'Debug code step by step & explain root cause', prompt: 'Help debug this issue line by line, explain the root cause, and provide fixed code.' },
  { id: 'tech-writer', name: 'Technical Writer', description: 'Polished, crystal-clear documentation', prompt: 'Refine and polish this technical documentation to make it crystal clear, concise, and well-structured.' },
  { id: 'brainstorm', name: 'Brainstorming Partner', description: 'Creative ideas, pros/cons & trade-offs', prompt: 'Help brainstorm 5 creative, non-obvious ideas for this project with pros, cons, and trade-offs.' },
  { id: 'explain-5', name: 'EL5 Explainer', description: 'Simple explanations using analogies', prompt: 'Explain this complex topic in simple terms with analogies suitable for a non-technical audience.' },
]

function parseThinkingAndContent(rawText: string) {
  const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/i
  const match = rawText.match(thinkRegex)
  if (match) {
    const thinking = match[1].trim()
    const content = rawText.replace(thinkRegex, '').trim()
    return { thinking, content }
  }
  return { thinking: null, content: rawText }
}

function parseToolCallJson(rawStr: string): { tool?: string; params?: Record<string, any> } | null {
  const trimmed = rawStr.trim()
  if (!trimmed) return null

  try {
    const data = JSON.parse(trimmed)
    if (data && typeof data === 'object') {
      const tool = String(data.tool || data.name || data.action || '').trim()
      const params = data.params || data.arguments || data.parameters || data.input || {}
      return { tool, params }
    }
  } catch {}

  try {
    let sanitized = ''
    let inString = false
    let isEscaped = false

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i]
      if (char === '"' && !isEscaped) {
        inString = !inString
        sanitized += char
        isEscaped = false
        continue
      }
      if (inString) {
        if (char === '\n') sanitized += '\\n'
        else if (char === '\r') sanitized += '\\r'
        else if (char === '\t') sanitized += '\\t'
        else sanitized += char
      } else {
        sanitized += char
      }
      if (char === '\\' && !isEscaped) isEscaped = true
      else isEscaped = false
    }

    const data = JSON.parse(sanitized)
    if (data && typeof data === 'object') {
      const tool = String(data.tool || data.name || data.action || '').trim()
      const params = data.params || data.arguments || data.parameters || data.input || {}
      return { tool, params }
    }
  } catch {}

  return null
}

function parseToolCallsAndCleanContent(rawText: string) {
  const toolCalls: Array<{
    toolName: string
    status: 'running' | 'success' | 'failed'
    output?: string
  }> = []

  if (!rawText) return { cleanText: '', toolCalls: [] }

  // 1. Match closed OR unclosed tool call blocks (e.g. ```tool_call ... ``` or unclosed ```tool_call ... at EOF)
  const toolCallBlockRegex = /(?:```(?:tool_call|toolcall|tool|json)?\s*([\s\S]*?)(?:```|$)|<tool_call>\s*([\s\S]*?)(?:<\/tool_call>|$))/gi
  let match
  while ((match = toolCallBlockRegex.exec(rawText)) !== null) {
    const jsonStr = (match[1] || match[2] || '').trim()
    if (!jsonStr) continue

    let name = ''
    try {
      const data = parseToolCallJson(jsonStr)
      if (data && data.tool) {
        name = data.tool
      }
    } catch {}

    if (!name) {
      const nameMatch = jsonStr.match(/"(?:tool|name|action)"\s*:\s*"([^"]+)"/i)
      if (nameMatch) name = nameMatch[1].trim()
    }

    if (name && !toolCalls.some((t) => t.toolName === name)) {
      toolCalls.push({ toolName: name, status: 'running' })
    }
  }

  // 2. Match > 🛠️ **Executing Tool:** `tool_name`...
  const execRegex = />?\s*🛠️\s*\*\*Executing Tool:\*\*\s*`([^`\r\n]+)`(?:\.\.\.)?/gi
  while ((match = execRegex.exec(rawText)) !== null) {
    const name = match[1].trim()
    const existing = toolCalls.find((t) => t.toolName === name)
    if (!existing) {
      toolCalls.push({ toolName: name, status: 'running' })
    }
  }

  // 3. Match tool outputs (closed or unclosed, code block or plain text or notices)
  const outputHeaderRegex = />?\s*(?:✅|❌)\s*\*\*(?:Output|Command executed successfully\.|Execution Error|Error):\*\*\s*[\r\n]*(?:```([\s\S]*?)```|([^\r\n]+(?:[\r\n]+(?![#\w]|>|\n\n)[^\r\n]+)*))?/gi
  let outIdx = 0
  let outMatch
  while ((outMatch = outputHeaderRegex.exec(rawText)) !== null) {
    const isError = outMatch[0].includes('Error') || outMatch[0].includes('❌')
    const text = (outMatch[1] || outMatch[2] || '').trim()
    if (toolCalls[outIdx]) {
      toolCalls[outIdx].status = isError ? 'failed' : 'success'
      if (text) toolCalls[outIdx].output = text
      outIdx++
    }
  }

  // 4. Thoroughly clean raw tool_call JSON, headers, output blocks, and notices from cleanText
  let cleanText = rawText
    .replace(/(?:```(?:tool_call|toolcall|tool)\s*[\s\S]*?(?:```|$)|<tool_call>\s*[\s\S]*?(?:<\/tool_call>|$))/gi, '')
    .replace(/>?\s*🛠️\s*\*\*Executing Tool:\*\*\s*`?[^`\r\n]+`?\s*(?:\.\.\.)?[\r\n]*/gi, '')
    .replace(/>?\s*(?:✅|❌)\s*\*\*(?:Output|Command executed successfully\.|Execution Error|Error):\*\*\s*[\r\n]*(?:```[\s\S]*?```|[^\r\n]+(?:[\r\n]+(?![#\w]|>|\n\n)[^\r\n]+)*)?[\r\n]*/gi, '')
    .replace(/>?\s*⚠️\s*\*\*Notice:\*\*\s*[^\r\n]*(?:[\r\n]+[^\r\n]+)*/gi, '')
    .replace(/>?\s*(?:✅|❌)?\s*(?:Output|Execution Error|Command executed successfully):\s*[\r\n]*(?:```[\s\S]*?```|[^\r\n]+)?[\r\n]*/gi, '')
    .replace(/\[System Tool Execution Feedback\][\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { cleanText, toolCalls }
}

function CodeBlock({ inline, className, children, node, ...props }: any) {
  const [copied, setCopied] = useState(false)
  const codeString = String(children).replace(/\n$/, '')
  const isInline = inline || (!className && !codeString.includes('\n'))

  if (isInline) {
    return <code className="inline-code" {...props}>{children}</code>
  }

  const match = /language-(\w+)/.exec(className || '')
  const lang = match ? match[1] : 'code'

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span>{lang}</span>
        <button className="code-copy-btn" onClick={handleCopy} aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre>
        <code>{codeString}</code>
      </pre>
    </div>
  )
}

function ToolBadgeCard({
  tool,
  defaultExpanded = false,
}: {
  tool: { toolName: string; status: 'running' | 'success' | 'failed'; output?: string }
  defaultExpanded?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded)
  const [copied, setCopied] = useState<boolean>(false)

  useEffect(() => {
    setIsExpanded(defaultExpanded)
  }, [defaultExpanded])

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!tool.output) return
    navigator.clipboard.writeText(tool.output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="tool-badge-card">
      <div className="tool-badge-header">
        <div className="tool-badge-info">
          <Terminal size={14} className="tool-badge-icon" />
          <span className="tool-badge-label">Call Tool</span>
          <span className="tool-badge-separator">---</span>
          <strong className="tool-badge-name">{tool.toolName}</strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={`tool-status-tag ${tool.status}`}>
            {tool.status === 'running' && <span className="tool-pulse-dot" />}
            {tool.status === 'success' && <CheckCircle2 size={12} />}
            {tool.status === 'failed' && <AlertCircle size={12} />}
            <span>{tool.status === 'running' ? 'Running' : tool.status === 'success' ? 'Completed' : 'Failed'}</span>
          </div>

          {tool.output && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="tool-dropdown-btn"
              title={isExpanded ? 'Hide execution output' : 'View execution output'}
            >
              <span>{isExpanded ? 'Hide Output' : 'View Output'}</span>
              <ChevronDown size={13} className={`tool-dropdown-arrow ${isExpanded ? 'expanded' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {tool.output && isExpanded && (
        <div className="tool-output-terminal">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <span className="terminal-title">{tool.toolName} console output</span>
            <button
              type="button"
              onClick={handleCopy}
              className="terminal-copy-btn"
              title="Copy output content"
            >
              {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="terminal-body">{tool.output}</pre>
        </div>
      )}
    </div>
  )
}

export function SuperChat({ initialChatId }: { initialChatId?: string }) {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState(initialChatId || '')
  const [messages, setMessages] = useState<Message[]>([])
  const [models, setModels] = useState(fallbackModels)
  const [selectedModel, setSelectedModel] = useState(fallbackModels[0].id)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const streamingRef = useRef(false)
  useEffect(() => {
    streamingRef.current = streaming
  }, [streaming])
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [presetOpen, setPresetOpen] = useState(false)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [systemPromptDraft, setSystemPromptDraft] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [topP, setTopP] = useState(1)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [copied, setCopied] = useState<string | null>(null)
  const [showToolOutputs, setShowToolOutputs] = useState<boolean>(false)
  const [usage, setUsage] = useState<Usage>({ used: 0, dailyLimit: null, plan: 'Standard Router' })

  // Branching / Editing User Message State
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')

  // File Attachment State
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scale textarea height based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`
    }
  }, [input])

  // Side Canvas & Sandbox State
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasFiles, setCanvasFiles] = useState<CanvasFile[]>([])
  const [activeCanvasPath, setActiveCanvasPath] = useState<string | undefined>()

  // High-Risk Tool Approval State
  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string
    reason?: string
    params?: Record<string, any>
  } | null>(null)

  // Voice Dictation State
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  // Prevent background fetch race condition when creating a new chat locally
  const skipFetchChatIdRef = useRef<string | null>(null)

  const openFileInCanvas = (filePath: string, title?: string) => {
    setCanvasFiles((prev) => {
      if (prev.some((f) => f.path === filePath)) return prev
      return [...prev, { path: filePath, title: title || filePath.split('/').pop() }]
    })
    setActiveCanvasPath(filePath)
    setCanvasOpen(true)
  }

  const handleApproveTool = async () => {
    if (!pendingApproval || !activeId) return
    const { toolName, params } = pendingApproval
    setPendingApproval(null)

    try {
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeId, toolName, params, approved: true }),
      })
      const data = await res.json()
      if (data.filePath) {
        openFileInCanvas(data.filePath, data.fileTitle)
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `✅ Tool Executed (${toolName}):\n\`\`\`\n${data.output || data.error || 'Done'}\n\`\`\`` },
      ])
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ Execution Failed: ${err.message}` },
      ])
    }
  }

  const handleRejectTool = () => {
    setPendingApproval(null)
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: `🛑 Action Rejected by User.` },
    ])
  }

  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeId), [chats, activeId])

  useEffect(() => {
    fetch('/api/usage').then((r) => (r.ok ? r.json() : null)).then((data) => data && setUsage(data)).catch(() => {})
    Promise.all([
      fetch('/api/chats').then((r) => r.json()),
      fetch('/api/models').then((r) => (r.ok ? r.json() : fallbackModels)),
    ])
      .then(([loadedChats, loadedModels]) => {
        setChats(loadedChats)
        const modelsList = loadedModels.length ? loadedModels : fallbackModels
        setModels(modelsList)
        if (!selectedModel) setSelectedModel(modelsList[0]?.id || fallbackModels[0].id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (initialChatId) setActiveId(initialChatId)
  }, [initialChatId])

  const handleSignOut = async () => {
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

  const handleStopAgent = async () => {
    if (!activeId) return
    await fetch(`/api/chat?chatId=${activeId}`, { method: 'DELETE' }).catch(() => {})
    setIsAgentRunning(false)
    setStreaming(false)
  }

  useEffect(() => {
    if (skipFetchChatIdRef.current === activeId) {
      skipFetchChatIdRef.current = null
      return
    }
    if (activeId) {
      fetch(`/api/chats/${activeId}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setMessages(data)
            setIsAgentRunning(false)
          } else if (data && Array.isArray(data.messages)) {
            setMessages(data.messages)
            setIsAgentRunning(Boolean(data.isAgentRunning))
          } else {
            setMessages([])
            setIsAgentRunning(false)
          }
        })
        .catch(() => {
          setMessages([])
          setIsAgentRunning(false)
        })
    } else {
      setMessages([])
      setIsAgentRunning(false)
    }
  }, [activeId])

  // Background agent polling effect
  useEffect(() => {
    if (!activeId) return

    const interval = setInterval(() => {
      // Do not overwrite client messages if user is actively streaming a live response
      if (streamingRef.current) return

      fetch(`/api/chats/${activeId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data && Array.isArray(data.messages)) {
            const running = Boolean(data.isAgentRunning)
            setIsAgentRunning(running)
            setMessages(data.messages)
          }
        })
        .catch(() => {})

      fetch('/api/chats')
        .then((r) => r.json())
        .then(setChats)
        .catch(() => {})
    }, 1800)

    return () => clearInterval(interval)
  }, [activeId])

  useEffect(() => {
    setSystemPromptDraft(activeChat?.systemPrompt || '')
  }, [activeChat?.id, activeChat?.systemPrompt])

  // Voice Input SpeechRecognition Setup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onresult = (event: any) => {
          let transcript = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript
          }
          if (transcript) {
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
          }
        }

        recognition.onerror = () => {
          setIsListening(false)
        }

        recognition.onend = () => {
          setIsListening(false)
        }

        recognitionRef.current = recognition
      }
    }
  }, [])

  function toggleVoiceInput() {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser.')
      return
    }
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = String(e.target?.result || '')
      setAttachedFile({
        name: file.name,
        content,
        size: file.size,
      })
    }
    reader.readAsText(file)
  }

  function handleNewConversation() {
    setActiveId('')
    setMessages([])
    setSidebarOpen(false)
    setAttachedFile(null)
    window.history.pushState(null, '', '/')
  }

  function selectChat(id: string) {
    setActiveId(id)
    setSidebarOpen(false)
    setAttachedFile(null)
    window.history.pushState(null, '', `/${id}`)
  }

  function applyPresetPrompt(presetPromptText: string) {
    setSystemPromptDraft(presetPromptText)
    updateChat({ systemPrompt: presetPromptText })
    setPresetOpen(false)
  }

  async function sendMessage(event?: React.FormEvent, customUserText?: string, targetChatId?: string) {
    event?.preventDefault()
    let text = (customUserText || input).trim()
    if (!text || streaming) return

    if (attachedFile) {
      text = `[Attached File: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\`\n\n${text}`
      setAttachedFile(null)
    }

    let currentChatId = targetChatId || activeId
    const isNew = !currentChatId
    if (isNew) {
      currentChatId = crypto.randomUUID()
      skipFetchChatIdRef.current = currentChatId
      setActiveId(currentChatId)
      window.history.pushState(null, '', `/${currentChatId}`)
    }

    const currentModel = activeChat?.model || selectedModel || models[0]?.id || fallbackModels[0].id

    if (isNew) {
      const titleText = text.length > 42 ? `${text.slice(0, 42)}…` : text
      const newChatObj: Chat = {
        id: currentChatId,
        title: titleText,
        model: currentModel,
        systemPrompt: systemPromptDraft,
        updatedAt: new Date().toISOString(),
      }
      setChats((prev) => [newChatObj, ...prev.filter((c) => c.id !== currentChatId)])
    }

    setInput('')
    setStreaming(true)


    const userMessage = { role: 'user' as const, content: text }
    const assistantMessage = { role: 'assistant' as const, content: '' }
    setMessages((current) => [...current, userMessage, assistantMessage])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: currentChatId,
          content: text,
          model: currentModel,
          systemPrompt: systemPromptDraft,
          temperature,
          topP,
          maxTokens,
          webSearch: webSearchEnabled,
        }),
      })

      if (!response.ok || !response.body) {
        let errorMsg = `Router error (${response.status})`
        try {
          const errData = await response.json()
          if (errData?.error) errorMsg = errData.error
        } catch {
          /* fallback */
        }
        throw new Error(errorMsg)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let answer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        answer += decoder.decode(value, { stream: true })
        setMessages((current) =>
          current.map((item, index) => (index === current.length - 1 ? { ...item, content: answer } : item))
        )
      }

      fetch('/api/chats')
        .then((r) => r.json())
        .then(setChats)
        .catch(() => {})

      fetch('/api/usage')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setUsage(data))
        .catch(() => {})
    } catch (error: any) {
      const displayErr = error?.message || 'An error occurred while communicating with the router.'
      setMessages((current) =>
        current.map((item, index) =>
          index === current.length - 1
            ? { ...item, content: displayErr.startsWith('⚠️') ? displayErr : `⚠️ ${displayErr}` }
            : item
        )
      )
    } finally {
      setStreaming(false)
    }

  }

  // Branching: Drop all messages after edited user message & resubmit from that point
  async function saveEditedMessage(index: number) {
    const textToResend = editingText.trim()
    if (!textToResend || streaming) return

    setEditingIndex(null)
    setEditingText('')

    // Truncate messages list up to the edited user message
    const truncatedMessages = messages.slice(0, index)
    setMessages(truncatedMessages)

    // Persist truncated chat history to backend so all subsequent messages are dropped
    if (activeId) {
      await fetch('/api/chats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeId, messages: truncatedMessages }),
      }).catch(() => {})
    }

    // Resubmit edited message to generate a fresh response from that point
    await sendMessage(undefined, textToResend, activeId)
  }

  function exportChat(format: 'md' | 'json' | 'html') {
    if (messages.length === 0) return
    const title = activeChat?.title || 'SuperChat-Conversation'
    let fileContent = ''
    let mimeType = 'text/plain'
    let extension = 'txt'

    if (format === 'md') {
      mimeType = 'text/markdown'
      extension = 'md'
      fileContent = `# ${title}\n\n` + messages.map((m) => `### **${m.role === 'user' ? 'User' : 'SuperChat'}**\n\n${m.content}\n`).join('\n---\n\n')
    } else if (format === 'json') {
      mimeType = 'application/json'
      extension = 'json'
      fileContent = JSON.stringify({ title, messages }, null, 2)
    } else if (format === 'html') {
      mimeType = 'text/html'
      extension = 'html'
      fileContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:sans-serif;max-width:800px;margin:30px auto;padding:0 20px;background:#f8f8fa;color:#27252f}.msg{margin-bottom:20px;padding:15px;border-radius:10px;background:#fff;border:1px solid #e3e3e9}.user{background:#eeebff}</style></head><body><h1>${title}</h1>` +
        messages.map((m) => `<div class="msg ${m.role}"><strong>${m.role === 'user' ? 'User' : 'SuperChat'}:</strong><p>${m.content.replace(/\n/g, '<br>')}</p></div>`).join('') + `</body></html>`
    }

    const blob = new Blob([fileContent], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${extension}`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  async function deleteChat(id: string) {
    if (!window.confirm('Delete this conversation permanently?')) return
    await fetch(`/api/chats?id=${id}`, { method: 'DELETE' })
    const remaining = chats.filter((chat) => chat.id !== id)
    setChats(remaining)
    if (activeId === id) handleNewConversation()
  }

  async function renameChat(chat: Chat) {
    const title = window.prompt('Rename conversation', chat.title)
    if (!title?.trim()) return
    await fetch('/api/chats', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chat.id, title }),
    })
    setChats((current) => current.map((item) => (item.id === chat.id ? { ...item, title: title.trim() } : item)))
  }

  async function updateChat(patch: Partial<Chat>) {
    if (patch.model) setSelectedModel(patch.model)
    if (!activeChat) return
    await fetch('/api/chats', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeChat.id, ...patch }),
    })
    setChats((current) => current.map((item) => (item.id === activeChat.id ? { ...item, ...patch } : item)))
  }

  async function copyMessage(id: string, content: string) {
    await navigator.clipboard.writeText(content)
    setCopied(id)
    setTimeout(() => setCopied(null), 1400)
  }

  const userDisplayName = usage.userName || (usage.userEmail ? usage.userEmail.split('@')[0] : 'Account')
  const initials = getUserInitials(usage.userName, usage.userEmail)


  return (
    <main className="superchat-shell">
      <aside className={`chat-sidebar ${sidebarOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <SuperChatLogo size={18} />
          </div>
          <strong style={{ fontWeight: 700, fontSize: '17px', letterSpacing: '-0.03em' }}>SuperChat</strong>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>
        <button className="new-chat-button" onClick={handleNewConversation}>
          <MessageSquarePlus size={18} /> New conversation <span>⌘ K</span>
        </button>
        {chats.length > 3 && (
          <div className="history-search-input">
            <Search size={13} style={{ color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            {historySearch && (
              <button
                type="button"
                onClick={() => setHistorySearch('')}
                style={{ border: 0, background: 'transparent', color: 'var(--muted-foreground)', padding: 0, cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
        <div className="history-label">Your conversations <span>{chats.length}</span></div>
        <nav className="chat-history" aria-label="Chat history">
          {chats
            .filter((c) => c.title.toLowerCase().includes(historySearch.toLowerCase()))
            .map((chat) => (
              <div key={chat.id} className={`history-item ${chat.id === activeId ? 'active' : ''}`}>
                <button onClick={() => selectChat(chat.id)}>
                  <MessageSquarePlus size={15} />
                  <span>{chat.title}</span>
                  {chat.isAgentRunning && <span className="sidebar-agent-pulse" title="Agent executing in background" />}
                </button>
                <div className="history-actions">
                  <button onClick={() => renameChat(chat)} aria-label="Rename chat"><Pencil size={14} /></button>
                  <button onClick={() => deleteChat(chat.id)} aria-label="Delete chat"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
        </nav>
        <div className="sidebar-footer">
          <div className="profile-dot" title={usage.userEmail || userDisplayName}>
            {initials}
          </div>
          <div className="sidebar-account">
            <strong>{userDisplayName}</strong>
            <small title={`Active Router: ${usage.routerUrl || 'https://router.bynara.id/v1'}`}>
              {Number(usage.used).toLocaleString()} tokens used today
            </small>
            <div className="usage-track" title={`Active Router: ${usage.routerUrl || 'https://router.bynara.id/v1'}`}>
              <span style={{ width: `${Math.min(100, (Number(usage.used) / 100000) * 100)}%` }} />
            </div>
          </div>

          <a href="/settings" className="footer-more" aria-label="Account settings" title="Settings"><Settings2 size={17} /></a>
          <button
            type="button"
            onClick={handleSignOut}
            className="footer-more"
            aria-label="Log Out"
            title="Log Out of Account"
            style={{ color: '#ef4444' }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}

      <section className="chat-main">
        <header className="topbar">
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth <= 720) {
                setSidebarOpen(!sidebarOpen)
              } else {
                setSidebarCollapsed(!sidebarCollapsed)
              }
            }}
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <PanelLeft size={18} />
          </button>
          <div className="mobile-title">
            <div className="brand-mark" style={{ width: 25, height: 25 }}>
              <SuperChatLogo size={14} />
            </div>
            <strong style={{ fontWeight: 700, fontSize: '15px' }}>SuperChat</strong>
          </div>
          <div className="topbar-spacer" />
          <div className="model-control">
            <span className="status-dot" />
            <select
              aria-label="Select model"
              value={activeChat?.model || selectedModel}
              onChange={(event) => updateChat({ model: event.target.value })}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
            <ChevronDown size={15} />
          </div>

          {messages.length > 0 && (
            <button className="icon-button" onClick={() => setExportOpen(!exportOpen)} title="Export conversation">
              <Download size={18} />
            </button>
          )}

          {exportOpen && (
            <div className="export-dropdown">
              <button onClick={() => exportChat('md')}><FileText size={14} /> Export Markdown (.md)</button>
              <button onClick={() => exportChat('json')}><FileText size={14} /> Export JSON (.json)</button>
              <button onClick={() => exportChat('html')}><FileText size={14} /> Export HTML (.html)</button>
            </div>
          )}

          <button
            className={`icon-button ${settingsOpen ? 'selected' : ''}`}
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-label="Chat settings"
          >
            <Settings2 size={18} />
          </button>
        </header>

        {settingsOpen && (
          <div className="settings-popover">
            <div className="settings-heading">
              <div>
                <strong>Chat settings</strong>
                <small>Applied to this conversation</small>
              </div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close chat settings">
                <X size={16} />
              </button>
            </div>
            <label>
              System prompt
              <textarea
                value={systemPromptDraft}
                onChange={(event) => setSystemPromptDraft(event.target.value)}
                onBlur={() => updateChat({ systemPrompt: systemPromptDraft })}
                placeholder="How should SuperChat respond in this conversation?"
              />
            </label>
            <div style={{ marginTop: 8, marginBottom: 10 }}>
              <small style={{ fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6 }}>
                Quick Presets:
              </small>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {POPULAR_PROMPT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSystemPromptDraft(p.prompt)
                      updateChat({ systemPrompt: p.prompt })
                    }}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: systemPromptDraft === p.prompt ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: systemPromptDraft === p.prompt ? 'var(--primary-soft)' : 'var(--background)',
                      color: systemPromptDraft === p.prompt ? 'var(--primary)' : 'var(--foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
            <small>Sent as the first <strong>system</strong> message on every request.</small>
            <div className="generation-grid">
              <label>
                Temperature <output>{temperature.toFixed(1)}</output>
                <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
              </label>
              <label>
                Top P <output>{topP.toFixed(1)}</output>
                <input type="range" min="0" max="1" step="0.05" value={topP} onChange={(event) => setTopP(Number(event.target.value))} />
              </label>
              <label>
                Max tokens <output>{maxTokens}</output>
                <input type="number" min="256" max="32768" step="256" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value) || 256)} />
              </label>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>Expand tool outputs by default</span>
              <input
                type="checkbox"
                checked={showToolOutputs}
                onChange={(e) => setShowToolOutputs(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
            </label>
          </div>
        )}

        <div className="conversation">
          <div className="conversation-inner">
            {isAgentRunning && (
              <div className="bg-agent-banner">
                <div className="bg-agent-info">
                  <span className="bg-agent-pulse-dot" />
                  <Bot size={16} />
                  <span>Agent is running background tools... (will continue even if tab is closed)</span>
                </div>
                <button className="bg-agent-stop-btn" onClick={handleStopAgent}>
                  <X size={13} /> Stop Agent
                </button>
              </div>
            )}
            {!activeId || messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><Bot size={25} /></div>
                <p className="eyebrow">Your thinking partner</p>
                <h1>What will we explore<br /><em>today?</em></h1>
                <p className="empty-copy">Ask anything, sketch an idea, or bring a tricky problem. SuperChat is ready when you are.</p>
                <div className="suggestions">
                  <button onClick={() => setInput('Help me think through a new project idea')}>
                    <span>01</span>Help me think through a new project idea
                  </button>
                  <button onClick={() => setInput('Explain a complex topic simply')}>
                    <span>02</span>Explain a complex topic simply
                  </button>
                  <button onClick={() => setInput('Review and improve my writing')}>
                    <span>03</span>Review and improve my writing
                  </button>
                </div>
              </div>
            ) : (
              messages.map((message, index) => {
                const { thinking, content: parsedContent } = message.role === 'assistant'
                  ? parseThinkingAndContent(message.content)
                  : { thinking: null, content: message.content }

                return (
                  <article className={`message-row ${message.role}`} key={message.id || `${message.role}-${index}`}>
                    <div className="message-avatar" title={message.role === 'assistant' ? 'SuperChat AI' : userDisplayName}>
                      {message.role === 'assistant' ? <Sparkles size={16} /> : initials}
                    </div>
                    <div className="message-body">
                      <div className="message-meta">
                        <strong>{message.role === 'assistant' ? 'SuperChat AI' : userDisplayName}</strong>
                        {message.role === 'user' && (
                          <button
                            className="icon-button"
                            style={{ width: 22, height: 22 }}
                            onClick={() => { setEditingIndex(index); setEditingText(message.content) }}
                            title="Edit message & branch"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>


                      {editingIndex === index ? (
                        <div className="edit-message-box">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                          />
                          <div className="edit-actions">
                            <button className="edit-btn-cancel" onClick={() => setEditingIndex(null)}>Cancel</button>
                            <button className="edit-btn-save" onClick={() => saveEditedMessage(index)}>Save & Resend</button>
                          </div>
                        </div>
                      ) : (
                        <div className="message-content">
                          {thinking && (
                            <details className="thinking-block" open>
                              <summary className="thinking-summary">
                                <Sparkles size={13} /> Thinking Process
                              </summary>
                              <div className="thinking-body">{thinking}</div>
                            </details>
                          )}
                          {message.role === 'assistant' ? (
                            <>
                              {(() => {
                                const sources: Array<{ title: string; url: string; domain: string }> = []
                                const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/gi
                                let match
                                while ((match = linkRegex.exec(parsedContent)) !== null) {
                                  const title = match[1].trim()
                                  const url = match[2].trim()
                                  if (!sources.some((s) => s.url === url)) {
                                    let domain = url
                                    try {
                                      domain = new URL(url).hostname.replace(/^www\./, '')
                                    } catch {}
                                    sources.push({ title, url, domain })
                                  }
                                }

                                if (sources.length === 0) return null

                                return (
                                  <div className="search-grounding-card">
                                    <div className="search-grounding-header">
                                      <div className="search-grounding-icon">
                                        <Globe size={13} />
                                      </div>
                                      <span>Live Web Search Grounded ({sources.length} {sources.length === 1 ? 'Source' : 'Sources'})</span>
                                    </div>
                                    <div className="search-sources-grid">
                                      {sources.map((s, sIdx) => (
                                        <a
                                          key={`${s.url}-${sIdx}`}
                                          href={s.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="search-source-chip"
                                          title={`${s.title} (${s.url})`}
                                        >
                                          <Globe size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                          <span>{s.title || s.domain}</span>
                                          <span className="search-source-badge">{s.domain}</span>
                                          <ExternalLink size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })()}
                              {(() => {
                                const { cleanText: textAfterToolCleanup, toolCalls: parsedCalls } = parseToolCallsAndCleanContent(parsedContent || '')
                                const existingCalls = (message as any).toolCalls || []
                                const combinedToolCalls = [...existingCalls]
                                for (const pc of parsedCalls) {
                                  if (!combinedToolCalls.some((t: any) => t.toolName === pc.toolName)) {
                                    combinedToolCalls.push(pc)
                                  }
                                }

                                const fileTags: Array<{ path: string; title: string }> = []
                                const fileRegex = /<file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/file>/gi

                                const isLastMessage = index === messages.length - 1
                                const isBusy = isLastMessage && isAgentRunning
                                let cleanContent = textAfterToolCleanup
                                if (!cleanContent && !thinking && combinedToolCalls.length === 0) {
                                  cleanContent = isBusy ? 'Executing sandbox tasks…' : ''
                                }
                                // Strip bare or malformed <file> tags without path
                                cleanContent = cleanContent.replace(/<file(?:\s+path=["']\s*["'])?\s*>[\s\S]*?<\/file>|<file\s*\/?>/gi, '')
                                let match
                                while ((match = fileRegex.exec(textAfterToolCleanup)) !== null) {
                                  const filePath = match[1] ? match[1].trim() : ''
                                  if (!filePath) continue
                                  let rawTitle = match[2] ? match[2].trim() : filePath
                                  const wordCount = rawTitle.split(/\s+/).filter(Boolean).length
                                  if (rawTitle.includes('\n') || wordCount > 5 || rawTitle.length > 60) {
                                    rawTitle = filePath.split('/').pop() || filePath
                                  }
                                  fileTags.push({ path: filePath, title: rawTitle })
                                }
                                cleanContent = cleanContent.replace(fileRegex, '').trim()

                                return (
                                  <>
                                    {combinedToolCalls.length > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0 12px' }}>
                                        {combinedToolCalls.map((tool: any, tIdx: number) => (
                                          <ToolBadgeCard
                                            key={`${tool.toolName}-${tIdx}`}
                                            tool={tool}
                                            defaultExpanded={showToolOutputs}
                                          />
                                        ))}
                                      </div>
                                    )}

                                    {cleanContent && (
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{ code: CodeBlock }}
                                      >
                                        {cleanContent}
                                      </ReactMarkdown>
                                    )}

                                    {fileTags.map((file, fIdx) => (
                                      <FileCard
                                        key={`${file.path}-${fIdx}`}
                                        chatId={activeId || 'default'}
                                        path={file.path}
                                        title={file.title}
                                        onView={(p, t) => openFileInCanvas(p, t)}
                                      />
                                    ))}
                                  </>
                                )
                              })()}
                            </>
                          ) : (
                            message.content
                          )}
                        </div>
                      )}

                      {message.role === 'assistant' && message.content && (
                        <button className="copy-button" onClick={() => copyMessage(message.id || String(index), message.content)}>
                          {copied === (message.id || String(index)) ? <Check size={14} /> : <Copy size={14} />} {copied === (message.id || String(index)) ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })
            )}

            {pendingApproval && (
              <ApprovalCard
                toolName={pendingApproval.toolName}
                reason={pendingApproval.reason}
                params={pendingApproval.params}
                onApprove={handleApproveTool}
                onReject={handleRejectTool}
              />
            )}
          </div>
        </div>

        <div className="composer-wrap">
          {presetOpen && (
            <div className="preset-popover">
              {PRESET_PROMPTS.map((item) => (
                <button key={item.id} className="preset-item" onClick={() => applyPresetPrompt(item.prompt)}>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          )}

          {attachedFile && (
            <div className="attached-file-chip">
              <FileText size={14} />
              <span>{attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)</span>
              <button onClick={() => setAttachedFile(null)} aria-label="Remove attachment"><X size={14} /></button>
            </div>
          )}

          <form className="composer" onSubmit={sendMessage}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Message SuperChat…"
              rows={1}
              disabled={streaming}
            />
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              accept=".txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.css,.html,.csv,.sql"
            />
            <div className="composer-footer">
              <div className="composer-toolbar">
                <button
                  type="button"
                  className={`preset-badge-btn ${webSearchEnabled ? 'active-search' : ''}`}
                  onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                  title="Toggle real-time Web Search grounding"
                >
                  <Globe size={13} /> Web Search
                </button>
                <button
                  type="button"
                  className="preset-badge-btn"
                  onClick={() => setPresetOpen(!presetOpen)}
                  title="Preset prompt library"
                >
                  <BookOpen size={13} /> Presets
                </button>
                <button
                  type="button"
                  className="tool-icon-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                >
                  <Paperclip size={15} />
                </button>
                <button
                  type="button"
                  className={`tool-icon-btn ${isListening ? 'recording' : ''}`}
                  onClick={toggleVoiceInput}
                  title={isListening ? 'Stop recording' : 'Voice dictation'}
                >
                  <Mic size={15} />
                </button>
              </div>
              <button className="send-button" type="submit" disabled={(!input.trim() && !attachedFile) || streaming} aria-label="Send message">
                {streaming ? <span className="loading-dots">•••</span> : <Send size={17} />}
              </button>
            </div>
          </form>
          <p className="disclaimer">SuperChat can make mistakes. Check important information.</p>
        </div>
      </section>

      <SideCanvas
        chatId={activeId || 'default'}
        open={canvasOpen}
        files={canvasFiles}
        activePath={activeCanvasPath}
        onClose={() => setCanvasOpen(false)}
        onSelectFile={(path) => setActiveCanvasPath(path)}
      />
    </main>
  )
}

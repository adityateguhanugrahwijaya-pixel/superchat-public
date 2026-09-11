import fs from 'node:fs'
import path from 'node:path'

export type MessageItem = {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt?: string
}

export type ChatData = {
  id: string
  userEmail: string
  title: string
  systemPrompt: string
  model: string
  createdAt: string
  updatedAt: string
  messages: MessageItem[]
}

export function getUserChatDir(userEmail: string): string {
  const safeEmail = userEmail.trim().toLowerCase()
  const dir = path.join(process.cwd(), 'chats', safeEmail)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getChatFilePath(userEmail: string, chatId: string): string {
  const dir = getUserChatDir(userEmail)
  return path.join(dir, `${chatId}.json`)
}

export function listUserChats(userEmail: string) {
  const dir = getUserChatDir(userEmail)
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const chats: Array<{
    id: string
    title: string
    systemPrompt: string
    model: string
    createdAt: string
    updatedAt: string
  }> = []

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8')
      const data = JSON.parse(content) as ChatData
      if (data && data.id) {
        chats.push({
          id: data.id,
          title: data.title || 'New conversation',
          systemPrompt: data.systemPrompt || '',
          model: data.model || 'deepseek/deepseek-chat',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        })
      }
    } catch {
      // Ignore corrupted files
    }
  }

  return chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function getChat(userEmail: string, chatId: string): ChatData | null {
  const filePath = getChatFilePath(userEmail, chatId)
  if (!fs.existsSync(filePath)) return null
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as ChatData
  } catch {
    return null
  }
}

export function saveChat(userEmail: string, chat: ChatData): void {
  const filePath = getChatFilePath(userEmail, chat.id)
  fs.writeFileSync(filePath, JSON.stringify(chat, null, 2), 'utf-8')
}

export function createChatFile(
  userEmail: string,
  options: { id?: string; title?: string; model?: string; systemPrompt?: string; initialMessage?: MessageItem }
): ChatData {
  const id = options.id || crypto.randomUUID()
  const now = new Date().toISOString()
  const messages = options.initialMessage ? [options.initialMessage] : []
  const chat: ChatData = {
    id,
    userEmail: userEmail.trim().toLowerCase(),
    title: options.title || 'New conversation',
    systemPrompt: options.systemPrompt || '',
    model: options.model || 'deepseek/deepseek-chat',
    createdAt: now,
    updatedAt: now,
    messages,
  }
  saveChat(userEmail, chat)
  return chat
}

export function updateChatFile(userEmail: string, chatId: string, patch: Partial<ChatData>): ChatData | null {
  const existing = getChat(userEmail, chatId)
  if (!existing) return null
  const updated: ChatData = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  saveChat(userEmail, updated)
  return updated
}

export function deleteChatFile(userEmail: string, chatId: string): boolean {
  const filePath = getChatFilePath(userEmail, chatId)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    return true
  }
  return false
}

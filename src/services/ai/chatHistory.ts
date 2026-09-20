import { db } from '@/services/storage/db'

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export interface ChatConversation {
  id: string
  pageContext: string
  createdAt: string
  updatedAt: string
}

function uid(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function getActiveConversation(pageContext: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const existing = await db.chatConversations.where('pageContext').equals(pageContext)
    .reverse().sortBy('updatedAt').catch(() => [] as ChatConversation[])
  if (existing.length > 0) {
    const last = existing[0]
    const lastDate = last.updatedAt.slice(0, 10)
    if (lastDate === today) {return last.id}
  }
  const id = uid()
  await db.chatConversations.put({
    id, pageContext, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  })
  return id
}

export async function saveMessage(msg: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
  const full: ChatMessage = { ...msg, id: uid() }
  await db.chatMessages.put(full)
  await db.chatConversations.update(msg.conversationId, { updatedAt: new Date().toISOString() }).catch(() => {})
  return full
}

export async function getMessages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
  const all = await db.chatMessages
    .where('conversationId').equals(conversationId)
    .sortBy('createdAt').catch(() => [] as ChatMessage[])
  return all.slice(-limit)
}

export async function getRecentConversations(limit = 10): Promise<ChatConversation[]> {
  return db.chatConversations.orderBy('updatedAt').reverse().limit(limit).toArray().catch(() => [])
}

export async function clearConversation(conversationId: string): Promise<void> {
  await db.chatMessages.where('conversationId').equals(conversationId).delete()
  await db.chatConversations.delete(conversationId)
}

export async function clearAllChats(): Promise<void> {
  await db.chatMessages.clear()
  await db.chatConversations.clear()
}

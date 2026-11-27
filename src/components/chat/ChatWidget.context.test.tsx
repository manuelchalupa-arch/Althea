import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatWidget from './ChatWidget'

const mocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  isChatAvailable: vi.fn(() => true),
  getActiveConversation: vi.fn(async () => 'coach-conversation'),
  getMessages: vi.fn(async () => []),
  saveMessage: vi.fn(async (message: {
    conversationId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: string
    source?: 'groq' | 'local'
    sources?: string[]
  }) => ({ ...message, id: `message-${Math.random()}` })),
  prepareUnifiedContext: vi.fn(async () => ({ evidence: [{ source: { id: 'guide-1' } }] })),
  buildUnifiedSystemPrompt: vi.fn(() => 'CONTEXTO PRIVADO AUTORIZADO'),
  validateUnifiedAnswer: vi.fn((text: string) => ({
    text: `Validado: ${text}`,
    sourcesUsed: [{ id: 'guide-1' }],
  })),
  composeUnifiedLocalReply: vi.fn(async () => ({
    text: 'Respuesta local con contexto',
    sourcesUsed: [{ id: 'guide-1' }],
    source: 'local' as const,
    confidence: 0.6,
  })),
}))

vi.mock('@/services/ai/chatService', () => ({
  streamChat: mocks.streamChat,
  isChatAvailable: mocks.isChatAvailable,
}))
vi.mock('@/services/ai/aiAuth', () => ({
  isLimitError: (message: string) => message.startsWith('LIMITE_IA:'),
  stripLimitPrefix: (message: string) => message.replace(/^LIMITE_IA:/, ''),
}))
vi.mock('@/services/ai/unifiedPipeline', () => ({
  prepareUnifiedContext: mocks.prepareUnifiedContext,
  buildUnifiedSystemPrompt: mocks.buildUnifiedSystemPrompt,
  validateUnifiedAnswer: mocks.validateUnifiedAnswer,
  composeUnifiedLocalReply: mocks.composeUnifiedLocalReply,
}))
vi.mock('@/services/ai/chatHistory', () => ({
  getActiveConversation: mocks.getActiveConversation,
  getMessages: mocks.getMessages,
  saveMessage: mocks.saveMessage,
}))
vi.mock('@/components/brand/BrandIcon', () => ({ default: () => null }))
vi.mock('@/components/brand/FitnessIcons', () => ({ IconChatBubble: () => null }))

describe('ChatWidget — contexto unificado del Coach', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getActiveConversation.mockResolvedValue('coach-conversation')
    mocks.getMessages.mockResolvedValue([])
    mocks.prepareUnifiedContext.mockResolvedValue({ evidence: [{ source: { id: 'guide-1' } }] })
    mocks.buildUnifiedSystemPrompt.mockReturnValue('CONTEXTO PRIVADO AUTORIZADO')
    mocks.validateUnifiedAnswer.mockImplementation((text: string) => ({
      text: `Validado: ${text}`,
      sourcesUsed: [{ id: 'guide-1' }],
    }))
    mocks.composeUnifiedLocalReply.mockResolvedValue({
      text: 'Respuesta local con contexto',
      sourcesUsed: [{ id: 'guide-1' }],
      source: 'local',
      confidence: 0.6,
    })
  })

  async function openAndType(question: string) {
    render(<ChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat' }))
    const input = await screen.findByRole('textbox', { name: 'Mensaje para el Coach' })
    fireEvent.change(input, { target: { value: question } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
  }

  it('envía el contexto autorizado, valida la evidencia y muestra el mensaje del usuario', async () => {
    mocks.streamChat.mockImplementation(async (_messages, callbacks, options) => {
      expect(options.systemPrompt).toBe('CONTEXTO PRIVADO AUTORIZADO')
      callbacks.onToken('respuesta cruda')
      await callbacks.onDone('respuesta cruda')
    })

    await openAndType('¿Cómo vengo de recuperación?')

    expect(await screen.findByText('¿Cómo vengo de recuperación?')).toBeInTheDocument()
    expect(await screen.findByText('Validado: respuesta cruda')).toBeInTheDocument()
    expect(mocks.prepareUnifiedContext).toHaveBeenCalledWith('¿Cómo vengo de recuperación?')
    expect(mocks.validateUnifiedAnswer).toHaveBeenCalledWith(
      'respuesta cruda',
      [{ source: { id: 'guide-1' } }],
    )
    await waitFor(() => expect(mocks.saveMessage).toHaveBeenCalledTimes(2))
    expect(mocks.saveMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      role: 'assistant',
      source: 'groq',
      sources: ['guide-1'],
      content: 'Validado: respuesta cruda',
    }))
  })

  it('usa una respuesta local contextual cuando falla la conexión', async () => {
    mocks.streamChat.mockImplementation(async (_messages, callbacks) => {
      await callbacks.onError('Error de conexión')
    })

    await openAndType('¿Qué debería ajustar hoy?')

    expect(await screen.findByText('Respuesta local con contexto')).toBeInTheDocument()
    expect(mocks.composeUnifiedLocalReply).toHaveBeenCalledWith(
      '¿Qué debería ajustar hoy?',
      expect.objectContaining({ evidence: [{ source: { id: 'guide-1' } }] }),
    )
    expect(mocks.saveMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      role: 'assistant',
      source: 'local',
      content: 'Respuesta local con contexto',
    }))
  })

  it('no convierte los límites de sesión o cuota en respuestas locales inventadas', async () => {
    mocks.streamChat.mockImplementation(async (_messages, callbacks) => {
      await callbacks.onError('LIMITE_IA:La sesión no está disponible.')
    })

    await openAndType('¿Cuántas calorías necesito?')

    expect(await screen.findByRole('alert')).toHaveTextContent('La sesión no está disponible.')
    expect(mocks.composeUnifiedLocalReply).not.toHaveBeenCalled()
  })
})

// KNOWLEDGE BASE — RAG simplificado para PWA
// Documentos JSON → chunks → índice por tags → retrieval → contexto para IA
import { db } from '@/services/storage/db'

export interface KnowledgeDocument {
  id: string
  title: string
  source: string
  author?: string
  date?: string
  type: 'evidence_review' | 'guideline' | 'textbook' | 'practical'
  topic: string
  evidenceLevel: 'strong' | 'moderate' | 'limited' | 'expert_opinion'
  chunks: KnowledgeChunk[]
  updatedAt: string
}

export interface KnowledgeChunk {
  chunkId: string
  documentId: string
  content: string
  tags: string[]
  relevance: 'training' | 'nutrition' | 'recovery' | 'biomechanics' | 'safety'
}

// Índice en memoria: tag → chunkIds
const tagIndex = new Map<string, Set<string>>()
let allChunks: KnowledgeChunk[] = []
let loaded = false

async function loadDocuments() {
  if (loaded) return
  try {
    const docs: KnowledgeDocument[] = await db.table('knowledgeDocuments').toArray().catch(() => [])
    // Si la tabla está vacía, importar documentos estáticos
    if (docs.length === 0) {
      try {
        const staticDocs = await import('@/data/knowledge/index')
        for (const doc of staticDocs.default) {
          await db.table('knowledgeDocuments').put(doc as never)
          docs.push(doc)
        }
      } catch { /* noop: documentos no disponibles aún */ }
    }
    // Construir índice
    for (const doc of docs) {
      for (const chunk of doc.chunks) {
        allChunks.push(chunk)
        for (const tag of chunk.tags) {
          if (!tagIndex.has(tag)) tagIndex.set(tag, new Set())
          tagIndex.get(tag)!.add(chunk.chunkId)
        }
      }
    }
    loaded = true
  } catch { /* noop */ }
}

/** Buscar chunks relevantes dado un conjunto de tags y un límite */
export async function retrieveRelevant(tags: string[], limit = 5): Promise<KnowledgeChunk[]> {
  await loadDocuments()
  // Contar coincidencias por chunk
  const scores = new Map<string, number>()
  for (const tag of tags) {
    const chunkIds = tagIndex.get(tag.toLowerCase()) || new Set()
    for (const id of chunkIds) {
      scores.set(id, (scores.get(id) || 0) + 1)
    }
  }
  // Ordenar por score descendente
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  return sorted.map(([id]) => allChunks.find(c => c.chunkId === id)).filter(Boolean) as KnowledgeChunk[]
}

/** Obtener chunks por relevancia (training/nutrition/etc) */
export async function retrieveByRelevance(relevance: KnowledgeChunk['relevance'], limit = 3): Promise<KnowledgeChunk[]> {
  await loadDocuments()
  return allChunks.filter(c => c.relevance === relevance).slice(0, limit)
}

/** Guardar un documento nuevo */
export async function saveDocument(doc: KnowledgeDocument): Promise<void> {
  await db.table('knowledgeDocuments').put(doc as never)
  loaded = false // forzar recarga del índice
}

/** Listar documentos por tema */
export async function listDocuments(topic?: string): Promise<KnowledgeDocument[]> {
  const docs: KnowledgeDocument[] = await db.table('knowledgeDocuments').toArray().catch(() => [])
  if (!topic) return docs
  return docs.filter(d => d.topic === topic)
}

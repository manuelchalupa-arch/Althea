import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FeedbackActor } from './feedbackAuthz'
import {
  isAdminActor,
  isThreadOwner,
  canReadThread,
  canListThreadsAs,
  canCreateThread,
  canChangeThreadStatus,
  canOwnerUpdateThread,
  canCreateMessage,
  canMarkMessageRead,
  canAccessInternalNotes,
  canWriteInternalNote,
  canAccessAdminInbox,
  messageAuthorRoleFor,
} from './feedbackAuthz'

// Spec 003 SC-002: modelo de permisos dueño/admin/no-autorizado.
// La seguridad REAL vive en firestore.rules; al final hay aserciones de que el
// modelo esté replicado allí (lectura estática del archivo versionado).

const admin: FeedbackActor = { uid: 'a-1', isAdmin: true }
const user: FeedbackActor = { uid: 'u-1', isAdmin: false }
const ownThread = { ownerId: 'u-1' }
const foreignThread = { ownerId: 'u-2' }

describe('feedbackAuthz — modelo de permisos', () => {
  it('sin actor no hay permiso alguno', () => {
    expect(isAdminActor(null)).toBe(false)
    expect(canReadThread(null, ownThread)).toBe(false)
    expect(canListThreadsAs(null, 'own')).toBe(false)
    expect(canCreateThread(null, { ownerId: 'u-1', status: 'pendiente' })).toBe(false)
    expect(canChangeThreadStatus(null, 'resuelta')).toBe(false)
    expect(canAccessAdminInbox(null)).toBe(false)
  })

  it('lectura de hilo: dueño lo propio, admin todos, ajeno jamás', () => {
    expect(canReadThread(user, ownThread)).toBe(true)
    expect(canReadThread(user, foreignThread)).toBe(false)
    expect(canReadThread(admin, foreignThread)).toBe(true)
    expect(isThreadOwner(user, ownThread)).toBe(true)
    expect(isThreadOwner(admin, ownThread)).toBe(false)
  })

  it('listado: admin lista todo, el usuario solo los propios', () => {
    expect(canListThreadsAs(admin, 'all')).toBe(true)
    expect(canListThreadsAs(user, 'all')).toBe(false)
    expect(canListThreadsAs(user, 'own')).toBe(true)
  })

  it('crear hilo: propio y en estado pendiente', () => {
    expect(canCreateThread(user, { ownerId: 'u-1', status: 'pendiente' })).toBe(true)
    expect(canCreateThread(user, { ownerId: 'u-2', status: 'pendiente' })).toBe(false)
    expect(canCreateThread(user, { ownerId: 'u-1', status: 'resuelta' })).toBe(false)
  })

  it('cambiar estado: solo admin y con status válido', () => {
    expect(canChangeThreadStatus(admin, 'resuelta')).toBe(true)
    expect(canChangeThreadStatus(user, 'resuelta')).toBe(false)
    expect(canChangeThreadStatus(admin, 'cualquiera' as never)).toBe(false)
  })

  it('actualización del dueño: solo metadatos de actividad', () => {
    expect(canOwnerUpdateThread(user, ownThread, ['updatedAt', 'unreadForAdmin'])).toBe(true)
    expect(canOwnerUpdateThread(user, ownThread, ['status'])).toBe(false)
    expect(canOwnerUpdateThread(user, foreignThread, ['updatedAt'])).toBe(false)
    expect(canOwnerUpdateThread(admin, foreignThread, ['updatedAt'])).toBe(false)
  })

  it('crear mensaje: autor propio + rol acorde a la propiedad', () => {
    expect(canCreateMessage(user, { authorId: 'u-1', authorRole: 'user' }, ownThread)).toBe(true)
    expect(canCreateMessage(user, { authorId: 'u-1', authorRole: 'user' }, foreignThread)).toBe(false)
    expect(canCreateMessage(user, { authorId: 'u-1', authorRole: 'admin' }, ownThread)).toBe(false)
    expect(canCreateMessage(admin, { authorId: 'a-1', authorRole: 'admin' }, foreignThread)).toBe(true)
    expect(canCreateMessage(admin, { authorId: 'a-1', authorRole: 'user' }, foreignThread)).toBe(false)
  })

  it('marcar leído: cada lector solo su propio flag', () => {
    expect(canMarkMessageRead(user, 'owner', ownThread)).toBe(true)
    expect(canMarkMessageRead(user, 'admin', ownThread)).toBe(false)
    expect(canMarkMessageRead(admin, 'admin', foreignThread)).toBe(true)
    expect(canMarkMessageRead(admin, 'owner', foreignThread)).toBe(false)
  })

  it('notas internas y bandeja: exclusivo de admin', () => {
    expect(canAccessInternalNotes(admin)).toBe(true)
    expect(canAccessInternalNotes(user)).toBe(false)
    expect(canWriteInternalNote(admin, { authorId: 'a-1' })).toBe(true)
    expect(canWriteInternalNote(admin, { authorId: 'otro' })).toBe(false)
    expect(canWriteInternalNote(user, { authorId: 'u-1' })).toBe(false)
    expect(canAccessAdminInbox(admin)).toBe(true)
    expect(canAccessAdminInbox(user)).toBe(false)
  })

  it('autor en UI: el propio admin no se disfraza de usuario', () => {
    expect(messageAuthorRoleFor(user, { authorId: 'u-1', authorRole: 'user' })).toBe('user')
    expect(messageAuthorRoleFor(user, { authorId: 'a-1', authorRole: 'admin' })).toBe('admin')
    expect(messageAuthorRoleFor(admin, { authorId: 'a-1', authorRole: 'admin' })).toBe('admin')
    expect(messageAuthorRoleFor(null, { authorId: 'u-1', authorRole: 'user' })).toBe('user')
  })
})

describe('firestore.rules — el modelo está replicado en servidor (005)', () => {
  const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8')

  it('la colección de feedback existe con sus reglas de propiedad', () => {
    expect(rules).toMatch(/match\s+\/feedbackThreads\/\{threadId\}/)
    expect(rules).toMatch(/resource\.data\.ownerId == request\.auth\.uid \|\| isFeedbackAdmin\(\)/)
  })

  it('el rol admin se decide en servidor (correo del token OR lista de UIDs)', () => {
    expect(rules).toContain("'manuelchalupa@gmail.com'")
    expect(rules).toContain("'manuelchalu@gmail.com'")
    expect(rules).toMatch(/request\.auth\.uid in get\(.*admins\/uids.*\)\.data\.uids/)
  })

  it('admins/uids es inmutable para clientes (solo Console)', () => {
    const block = rules.match(/match\s+\/admins\/uids\s*\{[\s\S]*?\n\s*\}/)
    expect(block).toBeTruthy()
    expect(block?.[0]).toMatch(/allow create, update, delete: if false/)
  })

  it('internalNotes es admin-only y el catch-all deniega todo', () => {
    expect(rules).toMatch(/match\s+\/internalNotes\/\{noteId\}[\s\S]*?allow get, list: if isFeedbackAdmin\(\)/)
    const catchAll = rules.match(/match\s+\/\{document=\*\*\}[\s\S]*?\}\s*\}/)
    expect(catchAll?.[0]).toMatch(/if false/)
  })
})

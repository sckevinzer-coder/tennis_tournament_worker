// 조편성 라우트 3/3 — 수동 배정 CRUD (기존 groupAssignmentController 이전)
// 마운트: /group-assignments (프론트 호환)
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { groups, groupAssignments } from '../db/schema'
import { groupAssignmentApi } from './groupAssignments'

// POST /group-assignments — 수동 배정 생성
groupAssignmentApi.post('/', async (c) => {
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => null)
  if (!body?.groupId) return c.json({ message: 'groupId is required' }, 400)
  const [g] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, Number(body.groupId))).limit(1)
  if (!g) return c.json({ message: 'Group not found' }, 404)
  const [a] = await db.insert(groupAssignments).values({
    groupId: Number(body.groupId),
    participantId: body.participantId != null ? Number(body.participantId) : null,
    teamId: body.teamId != null ? Number(body.teamId) : null,
  }).returning()
  return c.json(a, 201)
})

// PUT /group-assignments/:id — 배정 수정
groupAssignmentApi.put('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [a] = await db.select().from(groupAssignments).where(eq(groupAssignments.id, id)).limit(1)
  if (!a) return c.json({ message: 'Group assignment not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (body.groupId) patch.groupId = Number(body.groupId)
  if (body.participantId !== undefined) patch.participantId = body.participantId != null ? Number(body.participantId) : null
  if (body.teamId !== undefined) patch.teamId = body.teamId != null ? Number(body.teamId) : null
  const [updated] = await db.update(groupAssignments).set(patch as never).where(eq(groupAssignments.id, id)).returning()
  return c.json(updated)
})

// DELETE /group-assignments/:id — 배정 삭제
groupAssignmentApi.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [a] = await db.select().from(groupAssignments).where(eq(groupAssignments.id, id)).limit(1)
  if (!a) return c.json({ message: 'Group assignment not found' }, 404)
  await db.delete(groupAssignments).where(eq(groupAssignments.id, id))
  return c.json({ message: 'Group assignment deleted' })
})

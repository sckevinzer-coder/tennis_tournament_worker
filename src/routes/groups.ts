// 조편성 라우트 1/3 — Groups CRUD (기존 groupRoutes 이전)
import { Hono } from 'hono'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import { groups, groupAssignments, participants, tournaments } from '../db/schema'
import { parsePagination, hasOrganizerAccess } from '../lib/ownership'
import type { AppEnv } from '../middleware/auth'

export const groupApi = new Hono<AppEnv>()

// GET /groups?tournamentId=X&limit=N&offset=N — 조 목록
groupApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const { limit, offset } = parsePagination(c.req.query())
  const tournamentId = c.req.query('tournamentId')
  if (tournamentId) {
    const list = await db.select().from(groups).where(eq(groups.tournamentId, Number(tournamentId))).limit(limit).offset(offset)
    return c.json(list)
  }
  const list = await db.select().from(groups).limit(limit).offset(offset)
  return c.json(list)
})

// GET /groups/:id — 단건
groupApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [g] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!g) return c.json({ message: 'Group not found' }, 404)
  return c.json(g)
})

// POST /groups — 생성 (운영자 전용, S-07)
groupApi.post('/', async (c) => {
  if (!hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => null)
  if (!body?.tournamentId || !body?.name) {
    return c.json({ message: 'tournamentId and name are required' }, 400)
  }
  const [t] = await db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, Number(body.tournamentId))).limit(1)
  if (!t) return c.json({ message: 'Tournament not found' }, 404)
  const [g] = await db.insert(groups).values({
    tournamentId: Number(body.tournamentId),
    name: String(body.name),
    groupSize: body.groupSize ?? null,
    description: body.description ?? null,
  }).returning()
  return c.json(g, 201)
})

// PUT /groups/:id — 수정 (운영자 전용, S-07)
groupApi.put('/:id', async (c) => {
  if (!hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [g] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!g) return c.json({ message: 'Group not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (body.name) patch.name = String(body.name)
  if (body.description !== undefined) patch.description = body.description ?? null
  if (body.groupSize !== undefined) patch.groupSize = body.groupSize ?? null
  const [updated] = await db.update(groups).set(patch as never).where(eq(groups.id, id)).returning()
  return c.json(updated)
})

// DELETE /groups/:id — 삭제 (assignment는 FK cascade, 운영자 전용 S-07)
groupApi.delete('/:id', async (c) => {
  if (!hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [g] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!g) return c.json({ message: 'Group not found' }, 404)
  await db.delete(groups).where(eq(groups.id, id))
  return c.json({ message: 'Group deleted' })
})

// GET /groups/:id/participants — 조 소속 참가자
groupApi.get('/:id/participants', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [g] = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  if (!g) return c.json({ message: 'Group not found' }, 404)
  const assigns = await db.select().from(groupAssignments).where(eq(groupAssignments.groupId, id))
  const pids = assigns.map((a) => a.participantId).filter((v): v is number => v != null)
  if (pids.length === 0) return c.json([])
  const list = await db.select().from(participants).where(inArray(participants.id, pids))
  return c.json(list)
})

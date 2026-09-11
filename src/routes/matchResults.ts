// 경기결과 이력 CRUD — 기존 matchResultRoutes 이전
// 마운트: /match-results
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { matchResults } from '../db/schema'
import type { AppEnv } from '../middleware/auth'

export const matchResultApi = new Hono<AppEnv>()

// GET /match-results — 전체 목록
matchResultApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const list = await db.select().from(matchResults)
  return c.json(list)
})

// GET /match-results/:id — 단건
matchResultApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [r] = await db.select().from(matchResults).where(eq(matchResults.id, id)).limit(1)
  if (!r) return c.json({ message: 'Match result not found' }, 404)
  return c.json(r)
})

// POST /match-results — 생성
matchResultApi.post('/', async (c) => {
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  if (!body.matchId) return c.json({ message: 'matchId is required' }, 400)
  const [r] = await db.insert(matchResults).values({
    matchId: Number(body.matchId),
    participant1Score: body.participant1Score != null ? Number(body.participant1Score) : 0,
    participant2Score: body.participant2Score != null ? Number(body.participant2Score) : 0,
    sets: body.sets != null ? (typeof body.sets === 'string' ? String(body.sets) : JSON.stringify(body.sets)) : null,
    winnerId: body.winnerId != null ? Number(body.winnerId) : null,
    isCompleted: body.isCompleted ? 1 : 0,
    isConfirmed: body.isConfirmed ? 1 : 0,
    submittedBy: body.submittedBy ? String(body.submittedBy) : null,
  }).returning()
  return c.json(r, 201)
})

// PUT /match-results/:id — 수정
matchResultApi.put('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [r] = await db.select().from(matchResults).where(eq(matchResults.id, id)).limit(1)
  if (!r) return c.json({ message: 'Match result not found' }, 404)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (body.matchId != null) patch.matchId = Number(body.matchId)
  if (body.participant1Score !== undefined) patch.participant1Score = Number(body.participant1Score)
  if (body.participant2Score !== undefined) patch.participant2Score = Number(body.participant2Score)
  if (body.winnerId !== undefined) patch.winnerId = body.winnerId != null ? Number(body.winnerId) : null
  if (body.isCompleted !== undefined) patch.isCompleted = body.isCompleted ? 1 : 0
  if (body.isConfirmed !== undefined) patch.isConfirmed = body.isConfirmed ? 1 : 0
  const [updated] = await db.update(matchResults).set(patch as never).where(eq(matchResults.id, id)).returning()
  return c.json(updated)
})

// DELETE /match-results/:id — 삭제
matchResultApi.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [r] = await db.select().from(matchResults).where(eq(matchResults.id, id)).limit(1)
  if (!r) return c.json({ message: 'Match result not found' }, 404)
  await db.delete(matchResults).where(eq(matchResults.id, id))
  return c.json({ message: 'Match result deleted' })
})

// 스코어링 룰 CRUD — 기존 scoringRuleController/Routes 이전
// 마운트: /scoring-rules
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { scoringRules } from '../db/schema'
import type { AppEnv } from '../middleware/auth'

export const scoringRuleApi = new Hono<AppEnv>()

scoringRuleApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  return c.json(await db.select().from(scoringRules))
})

scoringRuleApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const [r] = await db.select().from(scoringRules).where(eq(scoringRules.id, Number(c.req.param('id')))).limit(1)
  if (!r) return c.json({ message: 'Scoring rule not found' }, 404)
  return c.json(r)
})

scoringRuleApi.post('/', async (c) => {
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const [r] = await db.insert(scoringRules).values({
    tournamentId: body.tournamentId != null ? Number(body.tournamentId) : null,
    name: body.name != null ? String(body.name) : null,
    description: body.description != null ? String(body.description) : null,
    pointsForWin: body.pointsForWin != null ? Number(body.pointsForWin) : undefined,
    pointsForDraw: body.pointsForDraw != null ? Number(body.pointsForDraw) : undefined,
    pointsForLoss: body.pointsForLoss != null ? Number(body.pointsForLoss) : undefined,
    tiebreakTrigger: body.tiebreakTrigger != null ? Number(body.tiebreakTrigger) : undefined,
    tiebreakPoints: body.tiebreakPoints != null ? Number(body.tiebreakPoints) : undefined,
    isDefault: body.isDefault ? 1 : 0,
  } as never).returning()
  return c.json(r, 201)
})

scoringRuleApi.put('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [r] = await db.select().from(scoringRules).where(eq(scoringRules.id, id)).limit(1)
  if (!r) return c.json({ message: 'Scoring rule not found' }, 404)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (body.name !== undefined) patch.name = body.name != null ? String(body.name) : null
  if (body.description !== undefined) patch.description = body.description != null ? String(body.description) : null
  if (body.pointsForWin !== undefined) patch.pointsForWin = Number(body.pointsForWin)
  if (body.pointsForDraw !== undefined) patch.pointsForDraw = Number(body.pointsForDraw)
  if (body.pointsForLoss !== undefined) patch.pointsForLoss = Number(body.pointsForLoss)
  if (body.tiebreakTrigger !== undefined) patch.tiebreakTrigger = Number(body.tiebreakTrigger)
  if (body.tiebreakPoints !== undefined) patch.tiebreakPoints = Number(body.tiebreakPoints)
  if (body.isDefault !== undefined) patch.isDefault = body.isDefault ? 1 : 0
  const [updated] = await db.update(scoringRules).set(patch as never).where(eq(scoringRules.id, id)).returning()
  return c.json(updated)
})

scoringRuleApi.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [r] = await db.select().from(scoringRules).where(eq(scoringRules.id, id)).limit(1)
  if (!r) return c.json({ message: 'Scoring rule not found' }, 404)
  await db.delete(scoringRules).where(eq(scoringRules.id, id))
  return c.json({ message: 'Scoring rule deleted' })
})

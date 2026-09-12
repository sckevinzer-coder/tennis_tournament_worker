// 팀 CRUD — 기존 teamController/teamRoutes 이전
// - 단식: 참가자 팀 (신청자 1명 → 같은 참가자 자동 팀/복식 페어)
import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { participants, teams, tournaments } from '../db/schema'
import type { AppEnv } from '../middleware/auth'

export const teamApi = new Hono<AppEnv>()

// GET /teams?tournamentId=X — 목록 (대회별 필터)
teamApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const tournamentId = c.req.query('tournamentId')
  if (tournamentId) {
    const list = await db.select().from(teams).where(eq(teams.tournamentId, Number(tournamentId)))
    return c.json(list)
  }
  const list = await db.select().from(teams)
  return c.json(list)
})

// GET /teams/:id — 단건 + 멤버
teamApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [t] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  if (!t) return c.json({ message: 'Team not found' }, 404)
  const members = [
    t.player1Id ? (await db.select().from(participants).where(eq(participants.id, t.player1Id)).limit(1))[0] ?? null : null,
    t.player2Id ? (await db.select().from(participants).where(eq(participants.id, t.player2Id)).limit(1))[0] ?? null : null,
  ].filter(Boolean)
  return c.json({ ...t, members })
})

// POST /teams — 생성 (운영자 전용, S-07)
teamApi.post('/', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => null)
  if (!body?.name || !String(body.name).trim()) {
    return c.json({ message: 'name is required' }, 400)
  }
  if (!body.tournamentId) {
    return c.json({ message: 'tournamentId is required' }, 400)
  }
  const [t] = await db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, Number(body.tournamentId))).limit(1)
  if (!t) return c.json({ message: 'Tournament not found' }, 404)
  // 주장 필수 (원본: player1Id NOT NULL)
  if (body.player1Id == null && body.participant1Id == null) {
    return c.json({ message: 'player1Id is required' }, 400)
  }
  const p1 = body.player1Id ?? body.participant1Id
  const p2 = body.player2Id ?? body.participant2Id
  // 참가자 존재 검증 (같은 대회 소속)
  for (const [key, val] of [['player1Id', p1], ['player2Id', p2]] as const) {
    if (val != null) {
      const [p] = await db.select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.id, Number(val)), eq(participants.tournamentId, Number(body.tournamentId))))
        .limit(1)
      if (!p) return c.json({ message: `${key} participant not in this tournament` }, 400)
    }
  }
  const [team] = await db.insert(teams).values({
    name: String(body.name).trim(),
    tournamentId: Number(body.tournamentId),
    player1Id: Number(p1),
    player2Id: p2 != null ? Number(p2) : null,
  }).returning()
  return c.json(team, 201)
})

// PUT /teams/:id — 수정 (운영자 전용, S-07)
teamApi.put('/:id', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [t] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  if (!t) return c.json({ message: 'Team not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (body.name) patch.name = String(body.name).trim()
  const np1 = body.player1Id ?? body.participant1Id
  const np2 = body.player2Id ?? body.participant2Id
  if (np1 !== undefined) patch.player1Id = np1 != null ? Number(np1) : null
  if (np2 !== undefined) patch.player2Id = np2 != null ? Number(np2) : null
  const [updated] = await db.update(teams).set(patch as never).where(eq(teams.id, id)).returning()
  return c.json(updated)
})

// DELETE /teams/:id — 삭제 (운영자 전용, S-07)
teamApi.delete('/:id', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [t] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  if (!t) return c.json({ message: 'Team not found' }, 404)
  await db.delete(teams).where(eq(teams.id, id))
  return c.json({ message: 'Team deleted' })
})

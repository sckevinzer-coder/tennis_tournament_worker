// 랭킹 스냅샷 CRUD — 기존 rankingSnapshotController/Routes 이전
// 마운트: /ranking-snapshots
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { rankingSnapshots } from '../db/schema'
import type { AppEnv } from '../middleware/auth'

export const rankingSnapshotApi = new Hono<AppEnv>()

rankingSnapshotApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  return c.json(await db.select().from(rankingSnapshots))
})

rankingSnapshotApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const [r] = await db.select().from(rankingSnapshots).where(eq(rankingSnapshots.id, Number(c.req.param('id')))).limit(1)
  if (!r) return c.json({ message: 'Ranking snapshot not found' }, 404)
  return c.json(r)
})

rankingSnapshotApi.post('/', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401) // S-07
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  if (!body.participantId || !body.tournamentId || body.rank == null) {
    return c.json({ message: 'participantId, tournamentId, rank are required' }, 400)
  }
  const [r] = await db.insert(rankingSnapshots).values({
    participantId: Number(body.participantId),
    tournamentId: Number(body.tournamentId),
    rank: Number(body.rank),
    totalPoints: body.totalPoints != null ? Number(body.totalPoints) : 0,
    matchesPlayed: body.matchesPlayed != null ? Number(body.matchesPlayed) : 0,
  }).returning()
  return c.json(r, 201)
})

rankingSnapshotApi.put('/:id', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401) // S-07
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [r] = await db.select().from(rankingSnapshots).where(eq(rankingSnapshots.id, id)).limit(1)
  if (!r) return c.json({ message: 'Ranking snapshot not found' }, 404)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (body.participantId) patch.participantId = Number(body.participantId)
  if (body.tournamentId) patch.tournamentId = Number(body.tournamentId)
  if (body.rank) patch.rank = Number(body.rank)
  if (body.totalPoints) patch.totalPoints = Number(body.totalPoints)
  if (body.matchesPlayed) patch.matchesPlayed = Number(body.matchesPlayed)
  const [updated] = await db.update(rankingSnapshots).set(patch as never).where(eq(rankingSnapshots.id, id)).returning()
  return c.json(updated)
})

rankingSnapshotApi.delete('/:id', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401) // S-07
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [r] = await db.select().from(rankingSnapshots).where(eq(rankingSnapshots.id, id)).limit(1)
  if (!r) return c.json({ message: 'Ranking snapshot not found' }, 404)
  await db.delete(rankingSnapshots).where(eq(rankingSnapshots.id, id))
  return c.json({ message: 'Ranking snapshot deleted' })
})

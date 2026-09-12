// 대회 CRUD — 기존 tournamentRoutes 이전 (GET /, POST /, PUT /:id, DELETE /:id, GET /mine)
import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import { tournaments, organizers } from '../db/schema'
import { requireTournamentOwner, parseIdParam } from '../lib/ownership'
import type { AppEnv } from '../middleware/auth'

export const tournamentApi = new Hono<AppEnv>()

// GET / — 전체 대회 목록
tournamentApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const list = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt))
  return c.json(list)
})

// GET /mine — 내(주최자) 대회 목록 (Bearer 필수)
tournamentApi.get('/mine', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ message: '유효한 토큰이 필요합니다' }, 401)
  if (c.get('role') !== 'organizer') return c.json([])
  const db = getDb(c.env.DB)
  const [org] = await db.select().from(organizers).where(eq(organizers.userId, userId)).limit(1)
  if (!org) return c.json([])
  const list = await db.select().from(tournaments).where(eq(tournaments.organizerId, org.id)).orderBy(desc(tournaments.createdAt))
  return c.json(list.map(parseTournament))
})

// courts JSON 문자열 → 배열 파싱 (프론트 호환)
function parseTournament(t: any) {
  if (t && typeof t.courts === 'string') {
    try { t.courts = JSON.parse(t.courts) } catch { t.courts = [] }
  }
  return t
}

// GET /:id — 대회 단건
tournamentApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = parseIdParam(c.req.param('id'))
  if (!id) return c.json({ message: '유효하지 않은 대회 ID' }, 400)
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id)).limit(1)
  if (!t) return c.json({ message: 'Tournament not found' }, 404)
  return c.json(parseTournament(t))
})

// 유효성 검증 + 정규화 (courts 콤마 문자열/배열 → 배열)
function normalizeTournamentBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  if (body.name !== undefined) out.name = String(body.name).trim()
  if (body.startDate !== undefined) out.startDate = String(body.startDate)
  if (body.endDate !== undefined) out.endDate = body.endDate ? String(body.endDate) : null
  if (body.status !== undefined) out.status = String(body.status)
  if (body.description !== undefined) out.description = body.description ?? null
  if (body.maxParticipants !== undefined) out.maxParticipants = Number(body.maxParticipants) || 16
  if (body.matchType !== undefined) {
    if (!['singles', 'doubles'].includes(String(body.matchType))) throw new Error('matchType must be singles or doubles')
    out.matchType = body.matchType
  }
  if (body.doublesMode !== undefined) {
    if (!['team', 'random'].includes(String(body.doublesMode))) throw new Error('doublesMode must be team or random')
    out.doublesMode = body.doublesMode
  }
  if (body.gamesPerPlayer !== undefined && body.gamesPerPlayer !== null) {
    const gp = Number(body.gamesPerPlayer)
    if (!Number.isInteger(gp) || gp < 2 || gp > 6) throw new Error('gamesPerPlayer must be an integer between 2 and 6')
    out.gamesPerPlayer = gp
  }
  if (body.format !== undefined) {
    if (!['tournament', 'league'].includes(String(body.format))) throw new Error('format must be tournament or league')
    out.format = body.format
  }
  if (body.location !== undefined) out.location = body.location ?? null
  if (body.entryFee !== undefined) out.entryFee = body.entryFee ?? null
  if (body.courts !== undefined) {
    const arr = Array.isArray(body.courts)
      ? body.courts.map((v) => String(v).trim()).filter(Boolean)
      : String(body.courts ?? '').split(',').map((v) => v.trim()).filter(Boolean)
    if (arr.length > 50) throw new Error('courts too many')
    out.courts = JSON.stringify(arr)
  }
  return out
}

// POST / — 대회 생성 (운영자 전용, organizerId 자동 연결)
tournamentApi.post('/', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => ({}))
  if (!body?.name || !String(body.name).trim()) {
    return c.json({ message: 'name is required' }, 400)
  }
  let payload: Record<string, unknown>
  try {
    payload = normalizeTournamentBody(body)
  } catch (e) {
    return c.json({ message: (e as Error).message }, 400)
  }
  payload.startDate = payload.startDate || new Date().toISOString()
  // 주최자 id 연결 (Bearer 토큰 기반, 클라이언트 지정값 무시)
  const [org] = await db.select().from(organizers).where(eq(organizers.userId, c.get('userId')!)).limit(1)
  if (org) payload.organizerId = org.id
  const [t] = await db.insert(tournaments).values(payload as never).returning()
  return c.json(parseTournament(t), 201)
})

// PUT /:id — 대회 수정 (운영자 전용)
tournamentApi.put('/:id', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = parseIdParam(c.req.param('id'))
  if (!id) return c.json({ message: '유효하지 않은 대회 ID' }, 400)
  // S-06: 본인 대회만 수정 가능 (IDOR 방지)
  const own = await requireTournamentOwner(db, c.get('userId'), id)
  if (!own.ok) return c.json({ message: own.message }, own.status)
  const body = await c.req.json().catch(() => ({}))
  let payload: Record<string, unknown>
  try {
    payload = normalizeTournamentBody(body)
  } catch (e) {
    return c.json({ message: (e as Error).message }, 400)
  }
  payload.updatedAt = new Date().toISOString()
  const [updated] = await db.update(tournaments).set(payload as never).where(eq(tournaments.id, id)).returning()
  return c.json(parseTournament(updated))
})

// DELETE /:id — 대회 삭제 (운영자 전용, FK CASCADE로 관련 데이터 함께 삭제)
tournamentApi.delete('/:id', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = parseIdParam(c.req.param('id'))
  if (!id) return c.json({ message: '유효하지 않은 대회 ID' }, 400)
  // S-06: 본인 대회만 삭제 가능 (IDOR 방지)
  const ownDel = await requireTournamentOwner(db, c.get('userId'), id)
  if (!ownDel.ok) return c.json({ message: ownDel.message }, ownDel.status)
  await db.delete(tournaments).where(eq(tournaments.id, id))
  return c.json({ message: 'Tournament deleted' })
})
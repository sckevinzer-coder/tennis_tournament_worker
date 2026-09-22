// 참가자 CRUD — 기존 participantController/participantRoutes 이전
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { participants, matches, tournaments } from '../db/schema'
import type { AppEnv } from '../middleware/auth'
import { sanitizeUserInput, parsePagination, recordAudit, requireTournamentOwner, hasOrganizerAccess } from '../lib/ownership'

export const participantApi = new Hono<AppEnv>()

const PART_STATUS = ['registered', 'confirmed', 'eliminated', 'winner']

// GET /participants?tournamentId=X&limit=N&offset=N — 목록 (대회별 필터 + 페이징)
participantApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const { limit, offset } = parsePagination(c.req.query())
  const tournamentId = c.req.query('tournamentId')
  if (tournamentId) {
    const list = await db.select().from(participants).where(eq(participants.tournamentId, Number(tournamentId))).limit(limit).offset(offset)
    return c.json(list)
  }
  const list = await db.select().from(participants).limit(limit).offset(offset)
  return c.json(list)
})

// GET /participants/:id — 단건
participantApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1)
  if (!p) return c.json({ message: 'Participant not found' }, 404)
  return c.json(p)
})

// POST /participants — 생성 (userId는 Bearer 토큰으로만 연결)
participantApi.post('/', async (c) => {
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => null)
  const name = sanitizeUserInput(body?.name != null ? String(body.name) : '', 100)
  if (!name) {
    return c.json({ message: 'name is required' }, 400)
  }
  if (!body.tournamentId) {
    return c.json({ message: 'tournamentId is required' }, 400)
  }
  const [t] = await db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, Number(body.tournamentId))).limit(1)
  if (!t) return c.json({ message: 'Tournament not found' }, 404)
  // S-06: 대회 소유자만 직접 등록 가능 (IDOR 방지) — 최고관리자는 우회
  const own = await requireTournamentOwner(db, c.env, c.get('userId'), Number(body.tournamentId))
  if (!own.ok) return c.json({ message: own.message }, own.status)

  const [p] = await db.insert(participants).values({
    name,
    email: body.email ?? null,
    phone: body.phone ?? null,
    tournamentId: Number(body.tournamentId),
    // P1-4: userId는 Bearer 토큰으로만 연결 (클라이언트 임의 지정 방지)
    userId: c.get('userId') ?? null,
    seedRank: body.seedRank ?? null,
    status: 'registered',
  }).returning()
  recordAudit(db, c.get('userId'), 'participant.create', 'participant', p.id, { name: p.name, tournamentId: p.tournamentId })
  return c.json(p, 201)
})

// PUT /participants/:id — 수정 (운영자 전용, S-07)
participantApi.put('/:id', async (c) => {
  if (!hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1)
  if (!p) return c.json({ message: 'Participant not found' }, 404)
  // S-06: 소속 대회 소유자만 수정 가능 (IDOR 방지) — 최고관리자는 우회
  const own = await requireTournamentOwner(db, c.env, c.get('userId'), p.tournamentId)
  if (!own.ok) return c.json({ message: own.message }, own.status)

  const body = await c.req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (body.name) patch.name = String(body.name).trim()
  if (body.email !== undefined) patch.email = body.email ?? null
  if (body.phone !== undefined) patch.phone = body.phone ?? null
  if (body.seedRank !== undefined) patch.seedRank = body.seedRank
  if (body.status !== undefined) {
    if (!PART_STATUS.includes(String(body.status))) return c.json({ message: 'invalid status' }, 400)
    patch.status = body.status
  }
  if (body.totalScore !== undefined) patch.totalScore = Number(body.totalScore) || 0

  const [updated] = await db.update(participants).set(patch as never).where(eq(participants.id, id)).returning()
  recordAudit(db, c.get('userId'), 'participant.update', 'participant', id, { name: updated.name, status: updated.status })
  return c.json(updated)
})

// DELETE /participants/:id — 삭제 (운영자 전용, S-07)
participantApi.delete('/:id', async (c) => {
  if (!hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1)
  if (!p) return c.json({ message: 'Participant not found' }, 404)
  // S-06: 소속 대회 소유자만 삭제 가능 (IDOR 방지) — 최고관리자는 우회
  const own = await requireTournamentOwner(db, c.env, c.get('userId'), p.tournamentId)
  if (!own.ok) return c.json({ message: own.message }, own.status)
  await db.delete(participants).where(eq(participants.id, id))
  recordAudit(db, c.get('userId'), 'participant.delete', 'participant', id, undefined)
  return c.json({ message: 'Participant deleted' })
})

// GET /participants/:id/stats — 참가자 통계 (전적·승/패·게임득실)
participantApi.get('/:id/stats', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [p] = await db.select().from(participants).where(eq(participants.id, id)).limit(1)
  if (!p) return c.json({ message: 'Participant not found' }, 404)

  // 참가자가 속한 completed 경기 전체
  const all = await db.select().from(matches).where(eq(matches.status, 'completed'))
  const myMatches = all.filter((m) =>
    [m.participant1Id, m.participant2Id, m.participant3Id, m.participant4Id].includes(id)
  )
  let wins = 0, losses = 0, gamesFor = 0, gamesAgainst = 0
  for (const m of myMatches) {
    const sets: Array<{ gamesA?: number; gamesB?: number }> = m.sets ? JSON.parse(m.sets) : []
    let gf = 0, ga = 0
    for (const s of sets) { gf += s.gamesA ?? 0; ga += s.gamesB ?? 0 }
    const isTeamA = [m.participant1Id, m.participant3Id].includes(id)
    gamesFor += isTeamA ? gf : ga
    gamesAgainst += isTeamA ? ga : gf
    if (m.winnerId === id) wins++
    else if (
      m.winnerId != null &&
      [m.participant1Id, m.participant2Id, m.participant3Id, m.participant4Id].includes(m.winnerId)
    ) losses++
  }
  // 대회 수 (중복 제거)
  const tournamentCount = new Set(myMatches.map((m) => m.tournamentId)).size
  return c.json({
    participantId: id,
    participantName: p.name,
    totalMatches: myMatches.length, wins, losses,
    gamesFor, gamesAgainst, gameDiff: gamesFor - gamesAgainst,
    tournamentCount,
  })
})
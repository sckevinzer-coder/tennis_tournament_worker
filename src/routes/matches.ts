// 경기 CRUD + 스코어 입력 — 기존 matchRoutes 이전
// 마운트: /matches (프론트 호환)
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { matches, matchResults } from '../db/schema'
import { submitScore, confirmMatch, stringifySets } from '../lib/matchScore'
import { onMatchCompleted } from '../lib/bracketService'
import { publishMatchUpdate } from '../lib/realtime'
import { notifyMatchStarted } from '../lib/webPush'
import { recordAudit, hasOrganizerAccess } from '../lib/ownership'
import type { AppEnv } from '../middleware/auth'
import { parsePagination } from '../lib/ownership'

export const matchApi = new Hono<AppEnv>()

const MATCH_STATUS = ['scheduled', 'in_progress', 'completed', 'confirmation_needed']

// GET /matches?tournamentId=X&limit=N&offset=N — 목록
matchApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const { limit, offset } = parsePagination(c.req.query())
  const tournamentId = c.req.query('tournamentId')
  if (tournamentId) {
    const list = await db.select().from(matches).where(eq(matches.tournamentId, Number(tournamentId))).limit(limit).offset(offset)
    return c.json(list)
  }
  const list = await db.select().from(matches).limit(limit).offset(offset)
  return c.json(list)
})

// GET /matches/:id — 단건
matchApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [m] = await db.select().from(matches).where(eq(matches.id, id)).limit(1)
  if (!m) return c.json({ message: 'Match not found' }, 404)
  return c.json(m)
})

// PUT /matches/:id — 스코어 입력
// body: { score1, score2, sets?, status?, court?, submittedBy?: 'organizer'|'participant1'|'participant2' }
matchApi.put('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  // S-08: submittedBy=organizer 변조 방지 — 운영자 경로는 토큰 role 검증 필수
  if (body.submittedBy != null && String(body.submittedBy) === 'organizer'
    && !hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) {
    return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  }
  try {
    if (body.submittedBy) {
      const submittedBy = String(body.submittedBy)
      if (!['organizer', 'participant1', 'participant2'].includes(submittedBy)) {
        return c.json({ message: "submittedBy must be one of 'organizer', 'participant1', 'participant2'" }, 400)
      }
            const result = await submitScore(db, id,
        { score1: body.score1 as number | null, score2: body.score2 as number | null, sets: body.sets },
        submittedBy as 'organizer' | 'participant1' | 'participant2',
        (tid) => onMatchCompleted(db, tid),
      )
      // 실시간 브로드캐스트: 스코어 업데이트 (운영자 입력은 즉시 완료 처리)
      const pubType = result.status === 'completed' ? 'match_completed' : 'score_updated'
      publishMatchUpdate(c.env, Number(result.match.tournamentId), Number(result.match.id), pubType, {
        score1: result.match.score1, score2: result.match.score2, sets: result.match.sets,
        winnerId: result.match.winnerId, status: result.match.status,
      })
      return c.json({ match: result.match, status: result.status, conflict: (result as { conflict?: boolean }).conflict || false, confirmed: (result as { confirmed?: boolean }).confirmed || false })
    }
    // 기존 동작 (단순 저장) — 하위 호환
    const [m] = await db.select().from(matches).where(eq(matches.id, id)).limit(1)
    if (!m) return c.json({ message: 'Match not found' }, 404)
    const prevStatus = m.status
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (body.score1 != null) patch.score1 = Number(body.score1)
    if (body.score2 != null) patch.score2 = Number(body.score2)
    if (body.status !== undefined) {
      if (!MATCH_STATUS.includes(String(body.status))) return c.json({ message: 'invalid status' }, 400)
      patch.status = String(body.status)
    }
    if (body.sets !== undefined) patch.sets = stringifySets(body.sets)
    if ((body as Record<string, unknown>).court !== undefined) {
      const cv = String((body as Record<string, unknown>).court ?? '').trim()
      patch.court = cv || null
    }
    const [updated] = await db.update(matches).set(patch as never).where(eq(matches.id, id)).returning()
    // 실시간 브로드캐스트: 상태 변경 시 WS 전파
    const pubType =
      updated.status === 'completed' ? 'match_completed'
      : updated.status === 'in_progress' ? 'match_started'
      : 'score_updated'
    publishMatchUpdate(c.env, Number(updated.tournamentId), Number(updated.id), pubType, {
      score1: updated.score1, score2: updated.score2, sets: updated.sets,
      winnerId: updated.winnerId, status: updated.status, court: updated.court,
    })
    // Step 28: 경기 시작(in_progress 전환) 시 구독자에게 Web Push 전송 (응답 지연 방지: waitUntil)
    if (prevStatus !== 'in_progress' && updated.status === 'in_progress') {
      const snapshot = {
        id: Number(updated.id), tournamentId: Number(updated.tournamentId),
        court: updated.court ?? null,
        participant1Id: updated.participant1Id ?? null, participant2Id: updated.participant2Id ?? null,
        participant3Id: updated.participant3Id ?? null, participant4Id: updated.participant4Id ?? null,
      }
      const pushTitle = `🎾 경기 시작${updated.court ? ` — ${updated.court}` : ''}`
      const envSnap = c.env as unknown as Parameters<typeof notifyMatchStarted>[0]
      c.executionCtx.waitUntil(notifyMatchStarted(envSnap, snapshot, pushTitle, '코트로 이동해 주세요!'))
    }
    recordAudit(db, c.get('userId'), 'match.update', 'match', id, Object.keys(patch).reduce((acc, k) => ({ ...acc, [k]: updated[k as keyof typeof updated] }), {} as Record<string, unknown>))
    return c.json(updated)
  } catch (e) {
    const err = e as Error & { statusCode?: number }
    const code = (err.statusCode || 500) as 400 | 401 | 404 | 500
    return c.json({ message: err.message }, code)
  }
})

// POST /matches/:id/confirm — 운영자 최종 확정 (확인필요 해소)
matchApi.post('/:id/confirm', async (c) => {
  if (!hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  try {
        const m = await confirmMatch(db, id, {
      winnerId: body.winnerId as number | null,
      score1: body.score1 as number | null, score2: body.score2 as number | null, sets: body.sets,
    }, (tid) => onMatchCompleted(db, tid))
    // 실시간 브로드캐스트: 운영자 확정 = 경기 완료
    publishMatchUpdate(c.env, Number(m.tournamentId), Number(m.id), 'match_completed', {
      score1: m.score1, score2: m.score2, sets: m.sets,
      winnerId: m.winnerId, status: m.status,
    })
    recordAudit(db, c.get('userId'), 'match.confirm', 'match', m.id, { winnerId: m.winnerId })
    return c.json(m)
  } catch (e) {
    const err = e as Error & { statusCode?: number }
    const code = (err.statusCode || 500) as 400 | 401 | 404 | 500
    return c.json({ message: err.message }, code)
  }
})

// POST /matches — 수동 경기 생성 (운영자 전용)
matchApi.post('/', async (c) => {
  if (!hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  if (!body.tournamentId || !body.round) return c.json({ message: 'tournamentId and round are required' }, 400)
  const [m] = await db.insert(matches).values({
    tournamentId: Number(body.tournamentId),
    participant1Id: body.participant1Id != null ? Number(body.participant1Id) : null,
    participant2Id: body.participant2Id != null ? Number(body.participant2Id) : null,
    participant3Id: body.participant3Id != null ? Number(body.participant3Id) : null,
    participant4Id: body.participant4Id != null ? Number(body.participant4Id) : null,
    teamAId: body.teamAId != null ? Number(body.teamAId) : null,
    teamBId: body.teamBId != null ? Number(body.teamBId) : null,
    type: body.type ? String(body.type) : 'singles',
    round: String(body.round),
    stage: body.stage ? String(body.stage) : 'group',
    status: 'scheduled',
    court: body.court ? String(body.court) : null,
  } as never).returning()
  recordAudit(db, c.get('userId'), 'match.create', 'match', m.id, { tournamentId: m.tournamentId, round: m.round, stage: m.stage })
  return c.json(m, 201)
})

// DELETE /matches/:id — 경기 삭제 (운영자 전용, 관련 MatchResult 함께 삭제)
matchApi.delete('/:id', async (c) => {
  if (!hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [m] = await db.select().from(matches).where(eq(matches.id, id)).limit(1)
  if (!m) return c.json({ message: 'Match not found' }, 404)
  const delResult = { matchId: id }
  await db.delete(matchResults).where(eq(matchResults.matchId, id))
  await db.delete(matches).where(eq(matches.id, id))
  recordAudit(db, c.get('userId'), 'match.delete', 'match', id, delResult)
  return c.json({ message: 'Match deleted' })
})

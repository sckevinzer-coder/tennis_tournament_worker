// 참가 신청 — 기존 registrationRequestController/Routes 이전 (12.2)
// 마운트: /registration-requests
import { Hono } from 'hono'
import { eq, and, asc } from 'drizzle-orm'
import { getDb } from '../db/client'
import { registrationRequests, tournaments, participants, teams } from '../db/schema'
import { recordAudit, parsePagination } from '../lib/ownership'
import type { AppEnv } from '../middleware/auth'

export const registrationRequestApi = new Hono<AppEnv>()

function parseNames(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) return v.map((n) => String(n ?? '').trim()).filter(Boolean)
  if (typeof v === 'string' && v) {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p.map((n) => String(n ?? '').trim()).filter(Boolean) } catch { /* ignore */ }
    return [v.trim()].filter(Boolean)
  }
  return []
}

// GET / — 목록 (?tournamentId=N&limit=N&offset=N)
registrationRequestApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const { limit, offset } = parsePagination(c.req.query())
  const tid = c.req.query('tournamentId')
  const list = tid
    ? await db.select().from(registrationRequests).where(eq(registrationRequests.tournamentId, Number(tid))).orderBy(asc(registrationRequests.createdAt)).limit(limit).offset(offset)
    : await db.select().from(registrationRequests).orderBy(asc(registrationRequests.createdAt)).limit(limit).offset(offset)
  return c.json(list)
})

// GET /:id — 단건
registrationRequestApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const [r] = await db.select().from(registrationRequests).where(eq(registrationRequests.id, Number(c.req.param('id')))).limit(1)
  if (!r) return c.json({ message: 'Registration request not found' }, 404)
  return c.json(r)
})

// POST / — 신청 (비회원 허용)
registrationRequestApi.post('/', async (c) => {
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  if (!body.tournamentId || !body.participantName || !String(body.participantName).trim()) {
    return c.json({ message: 'tournamentId와 참가자 이름은 필수입니다.' }, 400)
  }
  const rawNames = Array.isArray(body.memberNames) && (body.memberNames as unknown[]).length > 0
    ? (body.memberNames as unknown[]).map((n) => String(n ?? '').trim()).filter(Boolean)
    : [String(body.participantName).trim()]
  const names = rawNames.filter((v, i, a) => v && a.indexOf(v) === i)
  if (names.length === 0) return c.json({ message: '최소 1명의 이름이 필요합니다.' }, 400)
  if (names.length > 2) return c.json({ message: '복식 신청은 최대 2명까지입니다.' }, 400)
  const leadName = names[0]
  const existing = await db.select().from(registrationRequests)
    .where(eq(registrationRequests.tournamentId, Number(body.tournamentId)))
  const dup = existing.find((r) => (r.status === 'pending' || r.status === 'approved') && names.includes(r.participantName))
  if (dup) {
    return c.json({ message: `'${dup.participantName}' 참가자가 이미 신청/등록되어 있습니다. (대기/승인 상태에서는 재신청 불가)` }, 409)
  }
  const [r] = await db.insert(registrationRequests).values({
    tournamentId: Number(body.tournamentId),
    participantName: leadName,
    memberNames: JSON.stringify(names),
    status: 'pending',
  }).returning()
  return c.json(r, 201)
})

// POST /registration-requests/:id/approve — 승인 (운영자 전용)
// Participant(+복식 팀 페어 Team) 자동 생성 후 approved
registrationRequestApi.post('/:id/approve', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const request = (await db.select().from(registrationRequests).where(eq(registrationRequests.id, id)).limit(1))[0]
  if (!request) return c.json({ message: 'Registration request not found' }, 404)
  if (request.status === 'approved') return c.json({ message: '이미 승인된 신청입니다.' }, 400)
  const tournament = (await db.select().from(tournaments).where(eq(tournaments.id, request.tournamentId)).limit(1))[0]
  if (!tournament) return c.json({ message: 'Tournament not found' }, 404)
  const names = parseNames(request.memberNames)
  const finalNames = names.length > 0 ? names : [request.participantName]
  const created: { id: number; name: string }[] = []
  for (const nm of finalNames) {
    if (!nm) continue
    const [existing] = await db.select().from(participants)
      .where(and(eq(participants.tournamentId, request.tournamentId), eq(participants.name, nm))).limit(1)
    if (existing) { created.push({ id: existing.id, name: existing.name }); continue }
    const [p] = await db.insert(participants).values({
      name: nm, tournamentId: request.tournamentId,
    } as never).returning()
    created.push({ id: p.id, name: p.name })
  }
  // 복식 팀 페어 모드: 2명이면 Team 자동 결성
  if (tournament.matchType === 'doubles' && tournament.doublesMode === 'team' && created.length >= 2) {
    const [p1, p2] = created
    const existingTeams = await db.select().from(teams).where(eq(teams.tournamentId, request.tournamentId))
    const clash = existingTeams.some((t) =>
      [t.player1Id, t.player2Id].includes(p1.id) || [t.player1Id, t.player2Id].includes(p2.id))
    if (!clash) {
      // 병렬화: pp1/pp2 동시 조회 (2RTT → 1RTT)
      const [a1, a2] = await Promise.all([
        db.select().from(participants).where(eq(participants.id, p1.id)).limit(1),
        db.select().from(participants).where(eq(participants.id, p2.id)).limit(1),
      ])
      const pp1 = a1[0]
      const pp2 = a2[0]
      if (pp1 && pp2) {
        await db.insert(teams).values({
          tournamentId: request.tournamentId,
          name: `${pp1.name}·${pp2.name}`,
          player1Id: pp1.id, player2Id: pp2.id,
        } as never)
      }
    }
  }
  const note = `승인: ${created.map((p) => p.id).join(',')}`
  const [updated] = await db.update(registrationRequests).set({
    status: 'approved',
    notes: request.notes ? `${request.notes} ${note}` : note,
    updatedAt: new Date().toISOString(),
  } as never).where(eq(registrationRequests.id, id)).returning()
  recordAudit(db, c.get('userId'), 'registration.approve', 'registration', id, { participants: created.map((p) => p.id) })
  return c.json({ request: updated, participants: created })
})

// POST /registration-requests/:id/reject — 거절 (운영자 전용, 재신청 가능)
registrationRequestApi.post('/:id/reject', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [request] = await db.select().from(registrationRequests).where(eq(registrationRequests.id, id)).limit(1)
  if (!request) return c.json({ message: 'Registration request not found' }, 404)
  if (request.status === 'approved') return c.json({ message: '이미 승인된 신청은 거절할 수 없습니다.' }, 400)
  const [updated] = await db.update(registrationRequests).set({
    status: 'rejected', updatedAt: new Date().toISOString(),
  } as never).where(eq(registrationRequests.id, id)).returning()
  recordAudit(db, c.get('userId'), 'registration.reject', 'registration', id, { participantName: request.participantName })
  return c.json(updated)
})

// DELETE /registration-requests/:id — 삭제 (운영자 전용)
registrationRequestApi.delete('/:id', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [request] = await db.select().from(registrationRequests).where(eq(registrationRequests.id, id)).limit(1)
  if (!request) return c.json({ message: 'Registration request not found' }, 404)
  await db.delete(registrationRequests).where(eq(registrationRequests.id, id))
  recordAudit(db, c.get('userId'), 'registration.delete', 'registration', id, { participantName: request.participantName })
  return c.json({ message: 'Registration request deleted' })
})


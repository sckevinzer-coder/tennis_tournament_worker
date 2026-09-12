// 조편성 라우트 2/3 — assignments/run + 조회 (기존 groupAssignmentController.run 이전)
// 마운트: /group-assignments (프론트 호환: POST /group-assignments/run)
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { groups, groupAssignments, participants, teams, tournaments } from '../db/schema'
import { assignParticipantsToGroups, type GroupMode } from '../lib/groupAssignment'
import type { AppEnv } from '../middleware/auth'

export const groupAssignmentApi = new Hono<AppEnv>()

const MODES = ['round_robin', 'random', 'seed', 'mixed']

// POST /group-assignments/run — 조 편성 실행 (영속 저장, 재편성 지원, 운영자 전용 S-07)
groupAssignmentApi.post('/run', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => null)
  const tournamentId = body?.tournamentId != null ? Number(body.tournamentId) : NaN
  const numGroups = body?.numGroups != null ? Number(body.numGroups) : NaN
  const mode: GroupMode = MODES.includes(body?.mode) ? body.mode : 'round_robin'
  if (!Number.isFinite(tournamentId)) return c.json({ message: 'tournamentId is required' }, 400)
  if (!Number.isFinite(numGroups) || numGroups < 1) return c.json({ message: 'numGroups must be >= 1' }, 400)

  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1)
  if (!t) return c.json({ message: 'Tournament not found' }, 404)
  const isTeamMode = t.matchType === 'doubles' && t.doublesMode === 'team'

  // 기존 편성 삭제 (재편성 지원) — Group 삭제 시 assignment는 cascade
  await db.delete(groups).where(eq(groups.tournamentId, tournamentId))

  const madeGroups: typeof groups.$inferSelect[] = []
  const madeAssigns: typeof groupAssignments.$inferSelect[] = []

  if (isTeamMode) {
    const allTeams = await db.select().from(teams).where(eq(teams.tournamentId, tournamentId))
    const complete = allTeams.filter((x) => x.player2Id != null)
    const incomplete = allTeams.filter((x) => x.player2Id == null)
    if (complete.length === 0) {
      return c.json({
        message: incomplete.length > 0
          ? '완성된 팀(2명)이 없습니다. 1명 팀에 파트너를 추가해 주세요.'
          : '결성된 팀이 없습니다. 먼저 팀을 결성하세요.',
      }, 400)
    }
    const assigned = assignParticipantsToGroups(complete.map((x) => ({ id: x.id })), numGroups, mode)
    // ── 최적화: groups 멀티로우 삽입 후 returning으로 ID 확보 → assignments 멀티로우 삽입 (2N+1 → 2쿼리) ──
    const insertedGroups = assigned.length
      ? await db.insert(groups).values(assigned.map((gi) => ({
        tournamentId, name: gi.name, groupSize: gi.participants.length,
      } as never))).returning()
      : []
    madeGroups.push(...insertedGroups)
    const assignRows = assigned.flatMap((gi, idx) => {
      const g = insertedGroups[idx]
      if (!g) return []
      return gi.participants.map((tm) => ({ groupId: g.id, participantId: null, teamId: tm.id }))
    })
    if (assignRows.length > 0) {
      const insertedAssigns = await db.insert(groupAssignments).values(assignRows as never).returning()
      madeAssigns.push(...insertedAssigns)
    }
    return c.json({
      groups: madeGroups, assignments: madeAssigns, unit: 'team',
      excludedIncompleteTeams: incomplete.map((x) => ({ teamId: x.id, name: x.name || `#${x.id}`, player1Id: x.player1Id })),
    }, 201)
  }

  const plist = await db.select().from(participants).where(eq(participants.tournamentId, tournamentId))
  if (plist.length === 0) {
    return c.json({ message: '참가자가 없습니다. 참가자를 먼저 등록하세요.' }, 400)
  }
  const assigned = assignParticipantsToGroups(
    plist.map((p) => ({ id: p.id, seedRank: p.seedRank })), numGroups, mode)
  // ── 최적화: groups/assignments 멀티로우 삽입 (2N+1 → 2쿼리) ──
  const insertedGroups = assigned.length
    ? await db.insert(groups).values(assigned.map((gi) => ({
      tournamentId, name: gi.name, groupSize: gi.participants.length,
    } as never))).returning()
    : []
  madeGroups.push(...insertedGroups)
  const assignRows = assigned.flatMap((gi, idx) => {
    const g = insertedGroups[idx]
    if (!g) return []
    return gi.participants.map((pm) => ({ groupId: g.id, participantId: pm.id }))
  })
  if (assignRows.length > 0) {
    const insertedAssigns = await db.insert(groupAssignments).values(assignRows as never).returning()
    madeAssigns.push(...insertedAssigns)
  }
  return c.json({ groups: madeGroups, assignments: madeAssigns, unit: 'participant' }, 201)
})

// GET /group-assignments — 전체 배정 조회
groupAssignmentApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const list = await db.select().from(groupAssignments)
  return c.json(list)
})

// GET /group-assignments/:id — 단건
groupAssignmentApi.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [a] = await db.select().from(groupAssignments).where(eq(groupAssignments.id, id)).limit(1)
  if (!a) return c.json({ message: 'Group assignment not found' }, 404)
  return c.json(a)
})

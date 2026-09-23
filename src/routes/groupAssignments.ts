// 조편성 라우트 2/3 — assignments/run + 조회 (기존 groupAssignmentController.run 이전)
// 마운트: /group-assignments (프론트 호환: POST /group-assignments/run)
import { Hono } from 'hono'
import { eq, inArray } from 'drizzle-orm'
import { getDb, type DB } from '../db/client'
import { groups, groupAssignments, participants, teams, tournaments } from '../db/schema'
import { assignParticipantsToGroups, type GroupMode } from '../lib/groupAssignment'
import type { AppEnv } from '../middleware/auth'
import { hasOrganizerAccess } from '../lib/ownership'

export const groupAssignmentApi = new Hono<AppEnv>()

const MODES = ['round_robin', 'random', 'seed', 'mixed']

// D1 한 문장의 SQL 변수 제한(실제 ~100~105) 회피 — 다중행 INSERT를 작은 청크로 나누어 삽입.
// (증상: D1_ERROR "too many SQL variables"; 20그룹 성공 / 22그룹 500 — 변수 수 제한 초과)
// 각 group 행: tournamentId/name/groupSize + Drizzle 주입 createdAt/updatedAt = 5 bound 변수.
const INSERT_CHUNK = 16

// 다중행 INSERT + RETURNING을 청크 단위로 나누어 실행 → D1 변수 제한 회피 + 삽입 ID 즉시 확보
async function insertGroupsBatch(db: DB, rows: { tournamentId: number; name: string; groupSize: number }[]) {
  const out: (typeof groups.$inferSelect)[] = []
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK)
    out.push(...((await db.insert(groups).values(chunk as never).returning()) as (typeof groups.$inferSelect)[]))
  }
  return out
}
async function insertAssignmentsBatch(db: DB, rows: { groupId: number; participantId: number | null; teamId: number | null }[]) {
  const out: (typeof groupAssignments.$inferSelect)[] = []
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK)
    out.push(...((await db.insert(groupAssignments).values(chunk as never).returning()) as (typeof groupAssignments.$inferSelect)[]))
  }
  return out
}

// POST /group-assignments/run — 조 편성 실행 (영속 저장, 재편성 지원, 운영자 전용 S-07)
groupAssignmentApi.post('/run', async (c) => {
  if (!hasOrganizerAccess(c.env, c.get('userId'), c.get('role'))) return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => null)
  const tournamentId = body?.tournamentId != null ? Number(body.tournamentId) : NaN
  const numGroups = body?.numGroups != null ? Number(body.numGroups) : NaN
  const mode: GroupMode = MODES.includes(body?.mode) ? body.mode : 'round_robin'
    if (!Number.isFinite(tournamentId)) return c.json({ message: 'tournamentId is required' }, 400)
  if (!Number.isFinite(numGroups) || numGroups < 1) return c.json({ message: 'numGroups must be >= 1' }, 400)
  console.log(`[group-run] tid=${tournamentId} numGroups=${numGroups} mode=${mode}`)

  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1)
  if (!t) return c.json({ message: 'Tournament not found' }, 404)
  const isTeamMode = t.matchType === 'doubles' && t.doublesMode === 'team'

  // 기존 편성 삭제 (재편성 지원) — Group 삭제 시 assignment는 cascade
  await db.delete(groups).where(eq(groups.tournamentId, tournamentId))

  const madeGroups: typeof groups.$inferSelect[] = []
  const madeAssigns: typeof groupAssignments.$inferSelect[] = []

  try {
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
      const insertedGroups = await insertGroupsBatch(db, assigned.map((gi) => ({ tournamentId, name: gi.name, groupSize: gi.participants.length })))
      madeGroups.push(...insertedGroups)
      const assignRows = assigned.flatMap((gi, idx) => {
        const g = insertedGroups[idx]
        if (!g) return []
        return gi.participants.map((tm) => ({ groupId: g.id, participantId: null, teamId: tm.id }))
      })
      if (assignRows.length > 0) madeAssigns.push(...await insertAssignmentsBatch(db, assignRows as any))
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
    const insertedGroups = await insertGroupsBatch(db, assigned.map((gi) => ({ tournamentId, name: gi.name, groupSize: gi.participants.length })))
    madeGroups.push(...insertedGroups)
    const assignRows = assigned.flatMap((gi, idx) => {
      const g = insertedGroups[idx]
      if (!g) return []
      return gi.participants.map((pm) => ({ groupId: g.id, participantId: pm.id }))
    })
    if (assignRows.length > 0) madeAssigns.push(...await insertAssignmentsBatch(db, assignRows as any))
    return c.json({ groups: madeGroups, assignments: madeAssigns, unit: 'participant' }, 201)
  } catch (e: any) {
    const cause = e?.cause ? (e.cause.message || e.cause) : (e?.message || e)
    console.error('[group-run] INSERT FAILED:', cause, e?.stack)
    return c.json({ message: '조 편성 저장 중 오류: ' + (cause as any)?.toString?.() }, 500)
  }
})

// GET /group-assignments — 전체 배정 조회
// ?tournamentId=X — 대회별 조회 (groups 조인). 전체 조회는 DB 누적으로 무거워짐 → 프론트는 이 쿼리를 사용
groupAssignmentApi.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const tournamentId = c.req.query('tournamentId')
  if (tournamentId) {
    const gs = await db.select({ id: groups.id }).from(groups).where(eq(groups.tournamentId, Number(tournamentId)))
    const gids = gs.map((g) => g.id)
    if (gids.length === 0) return c.json([])
    const list = await db.select().from(groupAssignments).where(inArray(groupAssignments.groupId, gids))
    return c.json(list)
  }
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

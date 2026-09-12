// 조별 순위 + 브래킷 강제생성 — 기존 tournamentRoutes standings/generate-bracket 이전
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import { tournaments, groups, groupAssignments, participants, teams, matches } from '../db/schema'
import { ensureTeamBracket } from '../lib/bracketService'
import { computeTeamStandings } from '../lib/standingsTeam'
import { computeGroupStandings } from '../lib/standingsGroup'
import { tournamentApi } from './tournaments'
import { requireTournamentOwner, parseIdParam } from '../lib/ownership'

// GET /tournaments/:id/standings — 조별 순위
tournamentApi.get('/:id/standings', async (c) => {
  const db = getDb(c.env.DB)
  const tournamentId = Number(c.req.param('id'))
  // 병렬화: tournament + matches + groups 동시 조회 (3RTT → 1RTT)
  const [tArr, matchList, groupList] = await Promise.all([
    db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1),
    db.select().from(matches).where(eq(matches.tournamentId, tournamentId)),
    db.select().from(groups).where(eq(groups.tournamentId, tournamentId)),
  ])
  const tournament = tArr[0]
  if (!tournament) return c.json({ message: 'Tournament not found' }, 404)
  if (tournament.matchType === 'doubles' && tournament.doublesMode === 'team') {
    if (groupList.length === 0) {
      const teamList = await db.select().from(teams).where(eq(teams.tournamentId, tournamentId))
      return c.json({ unit: 'team', groups: [{ name: '전체', standings: computeTeamStandings(matchList, teamList) }] })
    }
    // ── 최적화: 배정 1쿼리 일괄 조회 + 팀 1쿼리 (N+1 제거) ──
    const groupIds = groupList.map((g) => g.id)
    const allAssigns = groupIds.length
      ? await db.select().from(groupAssignments).where(inArray(groupAssignments.groupId, groupIds))
      : []
    const assignsByGroup = new Map<number, typeof allAssigns>()
    for (const a of allAssigns) {
      const list = assignsByGroup.get(a.groupId) || []
      list.push(a)
      assignsByGroup.set(a.groupId, list)
    }
    const allTeamIds = [...new Set(allAssigns.map((a) => a.teamId).filter((v): v is number => v != null))]
    const tRows = allTeamIds.length
      ? await db.select().from(teams).where(inArray(teams.id, allTeamIds))
      : []
    const teamsById = new Map(tRows.map((t) => [t.id, t]))

    const out: { groupId: number; name: string; standings: ReturnType<typeof computeTeamStandings> }[] = []
    for (const g of groupList) {
      const assigns = assignsByGroup.get(g.id) || []
      const teamIds = assigns.map((a) => a.teamId).filter((v): v is number => v != null)
      const gTeams: { id: number; name: string; player1Id: number | null; player2Id: number | null; seedRank: number | null }[] = []
      for (const tid of teamIds) {
        const t = teamsById.get(tid)
        if (t) gTeams.push({ id: t.id, name: t.name, player1Id: t.player1Id, player2Id: t.player2Id, seedRank: (t as unknown as { seedRank?: number | null }).seedRank ?? null })
      }
      out.push({ groupId: g.id, name: g.name, standings: computeTeamStandings(matchList, gTeams) })
    }
    return c.json({ unit: 'team', groups: out })
  }
  const participantList = await db.select().from(participants).where(eq(participants.tournamentId, tournamentId))
  // ── 최적화: 배정 1쿼리 일괄 조회 (N+1 제거) ──
  const groupIds = groupList.map((g) => g.id)
  const allAssigns = groupIds.length
    ? await db.select().from(groupAssignments).where(inArray(groupAssignments.groupId, groupIds))
    : []
  const assignsByGroup = new Map<number, number[]>()
  for (const a of allAssigns) {
    if (a.participantId == null) continue
    const list = assignsByGroup.get(a.groupId) || []
    list.push(a.participantId)
    assignsByGroup.set(a.groupId, list)
  }
  const out: { groupId: number; name: string; standings: ReturnType<typeof computeGroupStandings> }[] = []
  for (const g of groupList) {
    const ids = assignsByGroup.get(g.id) || []
    out.push({ groupId: g.id, name: g.name, standings: computeGroupStandings(matchList, participantList, ids) })
  }
  return c.json({ unit: 'participant', groups: out })
})

// POST /tournaments/:id/generate-bracket — 본선 강제 생성 (운영자 전용)
tournamentApi.post('/:id/generate-bracket', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const tournamentId = parseIdParam(c.req.param('id'))
  if (!tournamentId) return c.json({ message: '유효하지 않은 대회 ID' }, 400)
  // S-06: 본인 대회만 브래킷 생성 가능 (IDOR 방지)
  const ownBracket = await requireTournamentOwner(db, c.get('userId'), tournamentId)
  if (!ownBracket.ok) return c.json({ message: ownBracket.message }, ownBracket.status)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const res = await ensureTeamBracket(db, tournamentId, {
    force: body?.force === true,
    qualifiedPerGroup: body?.qualifiedPerGroup != null ? Number(body.qualifiedPerGroup) : 2,
  })
  return c.json(res)
})

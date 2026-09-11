// 조별 순위 + 브래킷 강제생성 — 기존 tournamentRoutes standings/generate-bracket 이전
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { tournaments, groups, groupAssignments, participants, teams, matches } from '../db/schema'
import { ensureTeamBracket } from '../lib/bracketService'
import { computeTeamStandings } from '../lib/standingsTeam'
import { computeGroupStandings } from '../lib/standingsGroup'
import { tournamentApi } from './tournaments'

// GET /tournaments/:id/standings — 조별 순위
tournamentApi.get('/:id/standings', async (c) => {
  const db = getDb(c.env.DB)
  const tournamentId = Number(c.req.param('id'))
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1)
  if (!tournament) return c.json({ message: 'Tournament not found' }, 404)
  const matchList = await db.select().from(matches).where(eq(matches.tournamentId, tournamentId))
  const groupList = await db.select().from(groups).where(eq(groups.tournamentId, tournamentId))
  if (tournament.matchType === 'doubles' && tournament.doublesMode === 'team') {
    if (groupList.length === 0) {
      const teamList = await db.select().from(teams).where(eq(teams.tournamentId, tournamentId))
      return c.json({ unit: 'team', groups: [{ name: '전체', standings: computeTeamStandings(matchList, teamList) }] })
    }
    const out: { groupId: number; name: string; standings: ReturnType<typeof computeTeamStandings> }[] = []
    for (const g of groupList) {
      const assigns = await db.select().from(groupAssignments).where(eq(groupAssignments.groupId, g.id))
      const teamIds = assigns.map((a) => a.teamId).filter((v): v is number => v != null)
      const gTeams: { id: number; name: string; player1Id: number | null; player2Id: number | null; seedRank: number | null }[] = []
      for (const tid of teamIds) {
        const [t] = await db.select().from(teams).where(eq(teams.id, tid)).limit(1)
        if (t) gTeams.push({ id: t.id, name: t.name, player1Id: t.player1Id, player2Id: t.player2Id, seedRank: (t as unknown as { seedRank?: number | null }).seedRank ?? null })
      }
      out.push({ groupId: g.id, name: g.name, standings: computeTeamStandings(matchList, gTeams) })
    }
    return c.json({ unit: 'team', groups: out })
  }
  const participantList = await db.select().from(participants).where(eq(participants.tournamentId, tournamentId))
  const out: { groupId: number; name: string; standings: ReturnType<typeof computeGroupStandings> }[] = []
  for (const g of groupList) {
    const assigns = await db.select().from(groupAssignments).where(eq(groupAssignments.groupId, g.id))
    const ids = assigns.map((a) => a.participantId).filter((v): v is number => v != null)
    out.push({ groupId: g.id, name: g.name, standings: computeGroupStandings(matchList, participantList, ids) })
  }
  return c.json({ unit: 'participant', groups: out })
})

// POST /tournaments/:id/generate-bracket — 본선 강제 생성 (운영자 전용)
tournamentApi.post('/:id/generate-bracket', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const tournamentId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const res = await ensureTeamBracket(db, tournamentId, {
    force: body?.force === true,
    qualifiedPerGroup: body?.qualifiedPerGroup != null ? Number(body.qualifiedPerGroup) : 2,
  })
  return c.json(res)
})

// 경기 생성 파이프라인 — 기존 tournamentRoutes generate-matches 이전
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { tournaments, groups, groupAssignments, participants, teams, matches } from '../db/schema'
import { generateAllMatches } from '../lib/generateAll'
import { tournamentApi } from './tournaments'

// POST /tournaments/:id/generate-matches — 조별 풀리그 + 본선 생성 (운영자 전용)
tournamentApi.post('/:id/generate-matches', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const tournamentId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const groupList = await db.select().from(groups).where(eq(groups.tournamentId, tournamentId))
  if (!groupList || groupList.length === 0) {
    return c.json({ message: '조 편성이 먼저 완료되어야 합니다. (POST /group-assignments/run)' }, 400)
  }
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1)
  if (!tournament) return c.json({ message: 'Tournament not found' }, 404)
  const groupInput: { id: number | null; name: string; participants: { id: number; seedRank: number | null; totalScore: number | null }[]; teams: { id: number; player1Id: number | null; player2Id: number | null; seedRank: number | null }[] }[] = []
  for (const g of groupList) {
    const assigns = await db.select().from(groupAssignments).where(eq(groupAssignments.groupId, g.id))
    const pentries: { id: number; seedRank: number | null; totalScore: number | null }[] = []
    for (const a of assigns) {
      if (a.participantId == null) continue
      const [p] = await db.select().from(participants).where(eq(participants.id, a.participantId)).limit(1)
      if (p) pentries.push({ id: p.id, seedRank: p.seedRank ?? null, totalScore: (p as { totalScore?: number | null }).totalScore ?? null })
    }
    groupInput.push({ id: g.id, name: g.name, participants: pentries, teams: [] })
  }
  const existing = await db.select().from(matches).where(eq(matches.tournamentId, tournamentId))
  for (const m of existing) await db.delete(matches).where(eq(matches.id, m.id))

  const matchType = body?.matchType === 'doubles' ? 'doubles'
    : body?.matchType === 'singles' ? 'singles' : (tournament.matchType || 'singles')
  let doublesMode = body?.doublesMode as string | undefined
  if (doublesMode !== undefined) {
    if (!['team', 'random'].includes(doublesMode)) return c.json({ message: 'doublesMode must be team or random' }, 400)
  } else {
    doublesMode = tournament.doublesMode || 'random'
  }
  let gamesPerPlayer = 4
  if (body?.gamesPerPlayer !== undefined && body?.gamesPerPlayer !== null) {
    gamesPerPlayer = Number(body.gamesPerPlayer)
  } else if (tournament.gamesPerPlayer != null) {
    gamesPerPlayer = Number(tournament.gamesPerPlayer)
  }
  if (!Number.isInteger(gamesPerPlayer) || gamesPerPlayer < 2 || gamesPerPlayer > 6) {
    return c.json({ message: 'gamesPerPlayer must be an integer between 2 and 6' }, 400)
  }
  let format = body?.format as string | undefined
  if (format !== undefined) {
    if (!['tournament', 'league'].includes(format)) return c.json({ message: 'format must be tournament or league' }, 400)
  } else {
    format = tournament.format || 'tournament'
  }
  if (matchType === 'doubles' && doublesMode === 'random') format = 'league'

  if (matchType === 'doubles' && doublesMode === 'team') {
    for (const gi of groupInput) {
      const src = groupList.find((x) => x.name === gi.name)
      const assigns = src ? await db.select().from(groupAssignments).where(eq(groupAssignments.groupId, src.id)) : []
      const teamIds = assigns.map((a) => a.teamId).filter((v): v is number => v != null)
      gi.teams = []
      for (const tid of teamIds) {
        const [t] = await db.select().from(teams).where(eq(teams.id, tid)).limit(1)
        if (t) gi.teams.push({ id: t.id, player1Id: t.player1Id, player2Id: t.player2Id, seedRank: (t as unknown as { seedRank?: number | null }).seedRank ?? null })
      }
    }
  }
  const { matches: allMatches, skippedGroups } = generateAllMatches(groupInput, { matchType, doublesMode, gamesPerPlayer, format })
  const created: unknown[] = []
  for (const m of allMatches) {
    const [row] = await db.insert(matches).values({
      tournamentId,
      participant1Id: m.participant1Id ?? null, participant2Id: m.participant2Id ?? null,
      participant3Id: (m.participant3Id as number | null) ?? null,
      participant4Id: (m.participant4Id as number | null) ?? null,
      teamAId: (m.teamAId as number | null) ?? null, teamBId: (m.teamBId as number | null) ?? null,
      type: m.type || 'singles', round: m.round, stage: m.stage || 'group', status: 'scheduled',
    } as never).returning()
    created.push(row)
  }
  return c.json({
    count: created.length, matchType, doublesMode,
    gamesPerPlayer: matchType === 'doubles' && doublesMode === 'random' ? gamesPerPlayer : null,
    format, bracketPending: false,
    bracketPlaceholder: matchType === 'doubles' && doublesMode === 'team' && format !== 'league',
    skippedGroups, matches: created,
  }, 201)
})


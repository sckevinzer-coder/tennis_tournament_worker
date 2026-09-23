// P1-4 계정 연결 — 참가자용 "내 대회·기록" API (GET /me/tournaments)
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import type { AppEnv } from '../middleware/auth'
import { participants, tournaments, teams, matches, organizers, users } from '../db/schema'
import { parseTournament } from './tournaments'

export const meApi = new Hono<AppEnv>()

function parseScoreSets(value: string | null): Array<{ gamesA?: number; gamesB?: number }> {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// GET /me/tournaments — 계정 기준 참가·주최 대회와 대회별 개인 전적
meApi.get('/tournaments', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ message: '유효한 토큰이 필요합니다' }, 401)
  const db = getDb(c.env.DB)

  const [accountRows, myParticipants, myOrganizers] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(participants).where(eq(participants.userId, userId)),
    db.select().from(organizers).where(eq(organizers.userId, userId)),
  ])
  if (!accountRows[0]) return c.json({ message: '사용자를 찾을 수 없습니다' }, 404)

  const [allTournaments, allMatches, allParticipants, allTeams] = await Promise.all([
    db.select().from(tournaments),
    db.select().from(matches),
    db.select().from(participants),
    db.select().from(teams),
  ])
  const organizerIds = new Set(myOrganizers.map((org) => org.id))
  const myTournamentIds = new Set(myParticipants.map((p) => p.tournamentId))
  const relevantTournaments = allTournaments.filter((t) =>
    myTournamentIds.has(t.id) || (t.organizerId != null && organizerIds.has(t.organizerId)))
  const relevantIds = new Set(relevantTournaments.map((t) => t.id))
  const relevantMatches = allMatches.filter((m) => relevantIds.has(m.tournamentId))
  const relevantParticipants = allParticipants.filter((p) => relevantIds.has(p.tournamentId))
  const relevantTeams = allTeams.filter((tm) => relevantIds.has(tm.tournamentId))
  const participantById = new Map(relevantParticipants.map((p) => [p.id, p]))

  const result = relevantTournaments.map((tournament) => {
    const myRows = myParticipants.filter((p) => p.tournamentId === tournament.id)
    const myIds = new Set(myRows.map((p) => p.id))
    const tournamentTeams = relevantTeams.filter((tm) => tm.tournamentId === tournament.id)
    const teamsByPlayer = new Map<number, { teamId: number; teamName: string; partnerName: string | null }>()
    for (const team of tournamentTeams) {
      const players = [team.player1Id, team.player2Id].filter((id): id is number => id != null)
      for (const playerId of players) {
        const partnerId = players.find((id) => id !== playerId)
        teamsByPlayer.set(playerId, {
          teamId: team.id,
          teamName: team.name,
          partnerName: partnerId ? participantById.get(partnerId)?.name ?? null : null,
        })
      }
    }
    const myTeamIds = new Set([...myIds]
      .map((id) => teamsByPlayer.get(id)?.teamId)
      .filter((id): id is number => id != null))

    let matchesPlayed = 0, wins = 0, losses = 0, gamesFor = 0, gamesAgainst = 0
    for (const match of relevantMatches.filter((m) => m.tournamentId === tournament.id && m.status === 'completed')) {
      const playerIds = [match.participant1Id, match.participant2Id, match.participant3Id, match.participant4Id]
        .filter((id): id is number => id != null)
      if (!playerIds.some((id) => myIds.has(id)) && !myTeamIds.size) continue

      const isSideA = match.teamAId != null
        ? myTeamIds.has(match.teamAId)
        : [match.participant1Id, match.participant3Id].some((id) => id != null && myIds.has(id))
      const sets = parseScoreSets(match.sets)
      let matchGamesFor = 0, matchGamesAgainst = 0
      for (const set of sets) {
        matchGamesFor += Number(set.gamesA ?? 0)
        matchGamesAgainst += Number(set.gamesB ?? 0)
      }
      // 과거 데이터에 sets가 없으면 저장된 세트 점수를 사용한다.
      if (!sets.length) [matchGamesFor, matchGamesAgainst] = [match.score1, match.score2]
      gamesFor += isSideA ? matchGamesFor : matchGamesAgainst
      gamesAgainst += isSideA ? matchGamesAgainst : matchGamesFor

      const winningPlayerTeam = relevantTeams.find((team) =>
        [team.player1Id, team.player2Id].includes(match.winnerId ?? -1))
      const winnerTeamId = match.teamAId != null ? winningPlayerTeam?.id ?? null : null
      const won = winnerTeamId != null ? myTeamIds.has(winnerTeamId) : match.winnerId != null && myIds.has(match.winnerId)
      if (won) wins++
      else losses++
      matchesPlayed++
    }

    return {
      ...parseTournament({ ...tournament }),
      as: tournament.organizerId != null && organizerIds.has(tournament.organizerId) ? 'organizer' : 'participant',
      myStats: { matchesPlayed, wins, losses, gamesFor, gamesAgainst, gameDiff: gamesFor - gamesAgainst },
      participants: myRows.map((p) => ({
        id: p.id, name: p.name, status: p.status, team: teamsByPlayer.get(p.id) ?? null,
      })),
    }
  })

  return c.json({
    account: accountRows[0],
    tournaments: result,
    summary: {
      joined: result.filter((t) => t.participants.length > 0).length,
      owned: result.filter((t) => t.as === 'organizer').length,
    },
  })
})


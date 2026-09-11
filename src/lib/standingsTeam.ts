// 순위 집계 — utils/standings.js 이전 (순수 함수)
export interface StandingMatch {
  id?: number
  status?: string | null
  winnerId?: number | null
  teamAId?: number | null
  teamBId?: number | null
  participant1Id?: number | null
  participant2Id?: number | null
  participant3Id?: number | null
  participant4Id?: number | null
  score1?: number | null
  score2?: number | null
  sets?: { gamesA?: number; gamesB?: number; games_a?: number; games_b?: number }[] | string | null
}
export interface StandingSet { gamesA?: number; gamesB?: number; games_a?: number; games_b?: number; tiebreakA?: number; tiebreakB?: number }
export interface StandingTeam { id: number; name: string; player1Id?: number | null; player2Id?: number | null }
export interface StandingPlayer { id: number; name?: string | null; seedRank?: number | null }

function parseSets(m: StandingMatch): StandingSet[] {
  if (Array.isArray(m.sets)) return m.sets as StandingSet[]
  if (typeof m.sets === 'string' && m.sets) {
    try { const v = JSON.parse(m.sets); return Array.isArray(v) ? v as StandingSet[] : [] } catch { return [] }
  }
  return []
}

export function computeTeamStandings(matches: StandingMatch[], teams: StandingTeam[]) {
  const rows = new Map(
    teams.map((t) => [t.id, {
      teamId: t.id, name: t.name,
      players: [t.player1Id, t.player2Id].filter((v) => v != null).map(Number),
      played: 0, wins: 0, losses: 0, gamesFor: 0, gamesAgainst: 0, gameDiff: 0,
    }]),
  )
  const completed = matches.filter(
    (m) => m.status === 'completed' && m.winnerId != null && m.teamAId != null && m.teamBId != null,
  )
  for (const m of completed) {
    const A = rows.get(Number(m.teamAId)); const B = rows.get(Number(m.teamBId))
    if (!A || !B) continue
    const sets = parseSets(m)
    let gamesA = 0; let gamesB = 0
    if (sets.length > 0) {
      for (const s of sets) { gamesA += Number(s.gamesA ?? s.games_a) || 0; gamesB += Number(s.gamesB ?? s.games_b) || 0 }
    } else {
      gamesA += Number(m.score1) || 0; gamesB += Number(m.score2) || 0
    }
    A.gamesFor += gamesA; A.gamesAgainst += gamesB
    B.gamesFor += gamesB; B.gamesAgainst += gamesA
    A.played++; B.played++
    const winnerTeam =
      A.players.includes(Number(m.winnerId)) ? A
      : B.players.includes(Number(m.winnerId)) ? B
      : (Number(m.winnerId) === Number(m.participant1Id) ? A : B)
    if (winnerTeam === A) { A.wins++; B.losses++ }
    else { B.wins++; A.losses++ }
  }
  const list = [...rows.values()]
  list.forEach((r) => { r.gameDiff = r.gamesFor - r.gamesAgainst })
  list.sort((a, b) => b.wins - a.wins || b.gameDiff - a.gameDiff || b.gamesFor - a.gamesFor || a.teamId - b.teamId)
  applyTeamHeadToHead(list, completed)
  return list
}

function rowsHasPlayer(rows: { teamId: number; players: number[] }[], participantId: number | null | undefined, teamId: number | null | undefined) {
  const row = rows.find((r) => r.teamId === Number(teamId))
  return !!row && participantId != null && row.players.includes(Number(participantId))
}

function applyTeamHeadToHead(
  list: { teamId: number; wins: number; gameDiff: number; gamesFor: number; players: number[] }[],
  completedMatches: StandingMatch[],
) {
  let i = 0
  while (i < list.length) {
    let j = i
    while (j + 1 < list.length && list[j + 1].wins === list[i].wins && list[j + 1].gameDiff === list[i].gameDiff && list[j + 1].gamesFor === list[i].gamesFor) j++
    if (j > i) {
      const group = list.slice(i, j + 1)
      const ids = new Set(group.map((g) => g.teamId))
      const h2h = new Map(group.map((g) => [g.teamId, 0]))
      for (const m of completedMatches) {
        if (m.teamAId == null || m.teamBId == null) continue
        if (!ids.has(Number(m.teamAId)) || !ids.has(Number(m.teamBId))) continue
        if (m.winnerId == null) continue
        const winnerTeamId = rowsHasPlayer(group, m.winnerId, m.teamAId) ? Number(m.teamAId)
          : rowsHasPlayer(group, m.winnerId, m.teamBId) ? Number(m.teamBId)
          : (Number(m.winnerId) === Number(m.participant1Id) ? Number(m.teamAId) : Number(m.teamBId))
        h2h.set(winnerTeamId, (h2h.get(winnerTeamId) || 0) + 1)
      }
      group.sort((a, b) => (h2h.get(b.teamId) || 0) - (h2h.get(a.teamId) || 0))
      for (let k = 0; k < group.length; k++) list[i + k] = group[k]
    }
    i = j + 1
  }
}

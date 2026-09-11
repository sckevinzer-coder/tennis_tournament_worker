// 조별 단식 순위 — utils/standings.js 이전
import type { StandingMatch, StandingPlayer } from './standingsTeam'

export function computeGroupStandings(matches: StandingMatch[], participants: StandingPlayer[], groupParticipantIds: number[] | null = null) {
  const pmap = new Map(participants.map((p) => [Number(p.id), p]))
  let scopeIds: Set<number>
  if (groupParticipantIds && groupParticipantIds.length > 0) {
    scopeIds = new Set(groupParticipantIds.map(Number))
  } else {
    scopeIds = new Set<number>()
    for (const m of matches) {
      if (m.participant1Id != null) scopeIds.add(Number(m.participant1Id))
      if (m.participant2Id != null) scopeIds.add(Number(m.participant2Id))
    }
  }
  const rows = new Map<number, {
    participantId: number; name: string; seedRank: number | null
    played: number; wins: number; losses: number
    setsFor: number; setsAgainst: number; setDiff: number
    gamesFor: number; gamesAgainst: number; gameDiff: number
  }>()
  for (const pid of scopeIds) {
    const p = pmap.get(pid)
    rows.set(pid, {
      participantId: pid, name: p?.name || `#${pid}`, seedRank: p?.seedRank ?? null,
      played: 0, wins: 0, losses: 0,
      setsFor: 0, setsAgainst: 0, setDiff: 0,
      gamesFor: 0, gamesAgainst: 0, gameDiff: 0,
    })
  }
  const completed = matches.filter(
    (m) =>
      m.status === 'completed' && m.winnerId != null &&
      m.participant1Id != null && m.participant2Id != null &&
      scopeIds.has(Number(m.participant1Id)) && scopeIds.has(Number(m.participant2Id)),
  )
  for (const m of completed) {
    const A = rows.get(Number(m.participant1Id)); const B = rows.get(Number(m.participant2Id))
    if (!A || !B) continue
    let setsA = 0, setsB = 0; let gamesA = 0, gamesB = 0
    let sets: { gamesA?: number; gamesB?: number; games_a?: number; games_b?: number }[] = []
    if (Array.isArray(m.sets)) sets = m.sets
    else if (typeof m.sets === 'string' && m.sets) { try { const v = JSON.parse(m.sets); if (Array.isArray(v)) sets = v } catch { /* ignore */ } }
    if (sets.length > 0) {
      for (const s of sets) {
        const ga = Number(s.gamesA ?? s.games_a) || 0
        const gb = Number(s.gamesB ?? s.games_b) || 0
        gamesA += ga; gamesB += gb
        if (ga > gb) setsA++; else if (gb > ga) setsB++
      }
    } else {
      gamesA = Number(m.score1) || 0; gamesB = Number(m.score2) || 0
      if (gamesA > gamesB) setsA++; else if (gamesB > gamesA) setsB++
    }
    A.setsFor += setsA; A.setsAgainst += setsB
    B.setsFor += setsB; B.setsAgainst += setsA
    A.gamesFor += gamesA; A.gamesAgainst += gamesB
    B.gamesFor += gamesB; B.gamesAgainst += gamesA
    A.played++; B.played++
    const winnerRow = Number(m.winnerId) === Number(m.participant1Id) ? A : B
    const loserRow = winnerRow === A ? B : A
    winnerRow.wins++; loserRow.losses++
  }
  const list = [...rows.values()]
  list.forEach((r) => { r.setDiff = r.setsFor - r.setsAgainst; r.gameDiff = r.gamesFor - r.gamesAgainst })
  list.sort((a, b) =>
    b.wins - a.wins || b.setDiff - a.setDiff || b.gameDiff - a.gameDiff ||
    (a.seedRank ?? 999999) - (b.seedRank ?? 999999) || a.participantId - b.participantId,
  )
  return list
}

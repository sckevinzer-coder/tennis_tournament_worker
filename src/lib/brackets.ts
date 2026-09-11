// 팀(페어) 매치 — utils/matchGenerator.js 이전
import { bracketRoundName, nextPowerOfTwo } from './matchGenerator'
import type { GenTeam, GenMatch } from './matchGenerator'

export function generateTeamRoundRobinMatches(teams: GenTeam[], roundName: string): GenMatch[] {
  const matches: GenMatch[] = []
  const list = [...teams].sort((a, b) => a.id - b.id)
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const teamA = list[i]; const teamB = list[j]
      matches.push({
        teamAId: teamA.id, teamBId: teamB.id,
        participant1Id: teamA.player1Id, participant2Id: teamB.player1Id,
        participant3Id: teamA.player2Id ?? null, participant4Id: teamB.player2Id ?? null,
        type: 'doubles', round: roundName, stage: 'group', status: 'scheduled',
      })
    }
  }
  return matches
}

export function generateTeamBracketMatches(teams: GenTeam[]): GenMatch[] {
  const n = teams.length
  if (n === 0) return []
  const size = nextPowerOfTwo(n)
  const byes = size - n
  const ranked = [...teams].sort((a, b) => {
    const sa = a.seedRank != null ? a.seedRank : Infinity
    const sb = b.seedRank != null ? b.seedRank : Infinity
    if (sa !== sb) return (sa as number) - (sb as number)
    return (a.id ?? 0) - (b.id ?? 0)
  })
  const byeRecipients = ranked.slice(0, byes)
  const pairingPool = ranked.slice(byes)
  const mk = (tA: GenTeam | null | undefined, tB: GenTeam | null | undefined, roundName: string, extra: Partial<GenMatch> = {}): GenMatch => ({
    teamAId: tA?.id ?? null, teamBId: tB?.id ?? null,
    participant1Id: tA?.player1Id ?? null, participant3Id: tA?.player2Id ?? null,
    participant2Id: tB?.player1Id ?? null, participant4Id: tB?.player2Id ?? null,
    type: 'doubles', round: roundName, stage: 'bracket', status: 'scheduled', ...extra,
  })
  const round1Name = bracketRoundName(size / 2, Math.log2(size), 0)
  const regularMatches: GenMatch[] = []
  for (let i = 0; i < pairingPool.length; i += 2) regularMatches.push(mk(pairingPool[i], pairingPool[i + 1], round1Name))
  const byeMatches = byeRecipients.map((t) => mk(t, null, round1Name, { isBye: true }))
  const matches: GenMatch[] = []
  let bi = 0, mi = 0
  while (bi < byeMatches.length || mi < regularMatches.length) {
    if (bi < byeMatches.length) matches.push(byeMatches[bi++])
    if (mi < regularMatches.length) matches.push(regularMatches[mi++])
  }
  let cur = matches.length
  let roundIndex = 1
  while (cur > 1) {
    const nextCount = cur / 2
    for (let i = 0; i < nextCount; i++) matches.push(mk(null, null, bracketRoundName(nextCount, Math.log2(size), roundIndex)))
    cur = nextCount
    roundIndex++
  }
  return matches
}

export function generateTeamBracketPlaceholders(qualifiedTotal: number): GenMatch[] {
  const size = nextPowerOfTwo(qualifiedTotal || 0)
  if (size < 2) return []
  const matches: GenMatch[] = []
  let current = size
  let roundIndex = 0
  while (current > 1) {
    const nextCount = current / 2
    const roundName = bracketRoundName(nextCount, Math.log2(size), roundIndex)
    for (let i = 0; i < nextCount; i++) {
      matches.push({
        teamAId: null, teamBId: null,
        participant1Id: null, participant2Id: null, participant3Id: null, participant4Id: null,
        type: 'doubles', round: roundName, stage: 'bracket', status: 'scheduled',
      })
    }
    current = nextCount
    roundIndex++
  }
  return matches
}

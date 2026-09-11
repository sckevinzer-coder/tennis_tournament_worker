// 경기 생성 유틸 — utils/matchGenerator.js 이전 (순수 함수, D1 무관)
export interface GenPlayer { id: number; seedRank?: number | null; totalScore?: number | null }
export interface GenTeam { id: number; player1Id: number | null; player2Id: number | null; seedRank?: number | null }
export interface GenMatch {
  participant1Id: number | null
  participant2Id: number | null
  participant3Id?: number | null
  participant4Id?: number | null
  teamAId?: number | null
  teamBId?: number | null
  type?: string
  round: string
  stage: string
  status: string
  isBye?: boolean
  groupId?: number | null
}

export function generateRoundRobinMatches(participants: GenPlayer[], roundName: string): GenMatch[] {
  const matches: GenMatch[] = []
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      matches.push({
        participant1Id: participants[i].id,
        participant2Id: participants[j].id,
        round: roundName, stage: 'group', status: 'scheduled',
      })
    }
  }
  return matches
}

export function nextPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n || 1)))
}

export function bracketRoundName(matchesInRound: number, _totalRounds: number, roundIndex: number): string {
  if (matchesInRound === 1) return 'final'
  if (matchesInRound === 2) return 'semifinal'
  if (matchesInRound === 4) return 'quarterfinal'
  if (matchesInRound === 8) return 'round_of_16'
  if (matchesInRound === 16) return 'round_of_32'
  return `round_${roundIndex + 1}`
}

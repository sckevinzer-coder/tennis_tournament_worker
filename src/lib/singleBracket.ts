// 단식 브래킷 + generateAllMatches — utils/matchGenerator.js 이전
import { generateRoundRobinMatches } from './matchGenerator'
import { generateDoublesFixedGamesMatches } from './doublesMixer'
import { generateTeamRoundRobinMatches, generateTeamBracketPlaceholders } from './brackets'
import { bracketRoundName, nextPowerOfTwo } from './matchGenerator'
import type { GenPlayer, GenMatch } from './matchGenerator'

export function generateBracketMatches(participants: GenPlayer[]): GenMatch[] {
  const n = participants.length
  if (n === 0) return []
  const size = nextPowerOfTwo(n)
  const byes = size - n
  const matches: GenMatch[] = []
  const ranked = [...participants].sort((a, b) => {
    const sa = a.seedRank != null ? a.seedRank : Infinity
    const sb = b.seedRank != null ? b.seedRank : Infinity
    if (sa !== sb) return (sa as number) - (sb as number)
    const ta = a.totalScore != null ? a.totalScore : 0
    const tb = b.totalScore != null ? b.totalScore : 0
    if (ta !== tb) return (tb as number) - (ta as number)
    return (a.id ?? 0) - (b.id ?? 0)
  })
  const byeRecipients = ranked.slice(0, byes)
  const pairingPool = ranked.slice(byes)
  const round1Name = bracketRoundName(size / 2, Math.log2(size), 0)
  const regularMatches: GenMatch[] = []
  for (let i = 0; i < pairingPool.length; i += 2) {
    regularMatches.push({
      participant1Id: pairingPool[i] ? pairingPool[i].id : null,
      participant2Id: pairingPool[i + 1] ? pairingPool[i + 1].id : null,
      round: round1Name, stage: 'bracket', status: 'scheduled',
    })
  }
  const byeMatches: GenMatch[] = byeRecipients.map((p) => ({
    participant1Id: p ? p.id : null, participant2Id: null,
    isBye: true, round: round1Name, stage: 'bracket', status: 'scheduled',
  }))
  const round1: GenMatch[] = []
  let rbi = 0, rmi = 0
  while (rbi < byeMatches.length || rmi < regularMatches.length) {
    if (rbi < byeMatches.length) round1.push(byeMatches[rbi++])
    if (rmi < regularMatches.length) round1.push(regularMatches[rmi++])
  }
  matches.push(...round1)
  let cur = matches.length
  if (cur === 0) return matches
  let roundIndex = 1
  while (cur > 1) {
    const nextCount = cur / 2
    for (let i = 0; i < nextCount; i++) {
      matches.push({
        participant1Id: null, participant2Id: null,
        round: bracketRoundName(nextCount, Math.log2(size), roundIndex),
        stage: 'bracket', status: 'scheduled',
      })
    }
    cur = nextCount
    roundIndex++
  }
  return matches
}

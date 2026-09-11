// generateAllMatches 파이프라인 — utils/matchGenerator.js 이전
import { generateRoundRobinMatches } from './matchGenerator'
import { generateDoublesFixedGamesMatches } from './doublesMixer'
import { generateTeamRoundRobinMatches, generateTeamBracketPlaceholders } from './brackets'
import { generateBracketMatches } from './singleBracket'
import type { GenMatch, GenPlayer, GenTeam } from './matchGenerator'

export interface GroupInput {
  id?: number | null
  name: string
  participants: GenPlayer[]
  teams?: GenTeam[]
}

export function generateAllMatches(
  groups: GroupInput[],
  options: { qualifiedPerGroup?: number; matchType?: string; doublesMode?: string; gamesPerPlayer?: number; format?: string } = {},
): { matches: GenMatch[]; skippedGroups: string[]; bracketPending?: boolean } {
  const { qualifiedPerGroup = 2, matchType = 'singles', doublesMode = 'random', gamesPerPlayer = 4, format = 'tournament' } = options
  let allMatches: GenMatch[] = []
  const skippedGroups: string[] = []
  groups.forEach((group) => {
    const roundName = `group_${group.name}`
    const groupId = group.id
    if (matchType === 'doubles') {
      if (doublesMode === 'team') {
        const teams = group.teams || []
        if (teams.length < 2) { skippedGroups.push(group.name); return }
        const ms = generateTeamRoundRobinMatches(teams, roundName)
        ms.forEach((m) => { m.groupId = groupId ?? null })
        allMatches = allMatches.concat(ms)
      } else {
        if (group.participants.length < 4) { skippedGroups.push(group.name); return }
        const ms = generateDoublesFixedGamesMatches(group.participants, roundName, gamesPerPlayer)
        ms.forEach((m) => { m.groupId = groupId ?? null })
        allMatches = allMatches.concat(ms)
      }
    } else {
      const ms = generateRoundRobinMatches(group.participants, roundName)
      ms.forEach((m) => { m.groupId = groupId ?? null })
      allMatches = allMatches.concat(ms)
    }
  })
  if (matchType === 'doubles') {
    if (doublesMode !== 'team') return { matches: allMatches, skippedGroups, bracketPending: false }
    if (format !== 'league') {
      const validGroups = groups.filter((g) => (g.teams || []).length >= 2)
      const qualifiedTotal = validGroups.length * qualifiedPerGroup
      if (qualifiedTotal >= 2) allMatches = allMatches.concat(generateTeamBracketPlaceholders(qualifiedTotal))
    }
    return { matches: allMatches, skippedGroups, bracketPending: false }
  }
  if (format === 'league') return { matches: allMatches, skippedGroups }
  const qualified: GenPlayer[] = []
  groups.forEach((group) => {
    const sorted = [...group.participants].sort((a, b) => {
      const sa = a.totalScore != null ? a.totalScore : 0
      const sb = b.totalScore != null ? b.totalScore : 0
      if (sb !== sa) return (sb as number) - (sa as number)
      if (a.seedRank != null && b.seedRank != null && a.seedRank !== b.seedRank) return (a.seedRank as number) - (b.seedRank as number)
      return a.id - b.id
    })
    qualified.push(...sorted.slice(0, qualifiedPerGroup))
  })
  allMatches = allMatches.concat(generateBracketMatches(qualified))
  return { matches: allMatches, skippedGroups }
}

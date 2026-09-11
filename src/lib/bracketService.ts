// 브래킷 서비스 — utils/bracketService.js 이전 (Drizzle 버전)
import { eq, and, asc } from 'drizzle-orm'
import { getDb } from '../db/client'
import { matches, teams, tournaments, groups, groupAssignments } from '../db/schema'
import { computeTeamStandings } from './standingsTeam'
import { generateTeamBracketMatches } from './brackets'

type Db = ReturnType<typeof getDb>

export function winningSide(match: {
  status?: string | null; winnerId?: number | null
  participant1Id?: number | null; participant2Id?: number | null
  participant3Id?: number | null; participant4Id?: number | null
}): 'A' | 'B' | null {
  if (match.status !== 'completed' || match.winnerId == null) return null
  const winnerId = Number(match.winnerId)
  const aPlayers = [match.participant1Id, match.participant3Id].filter((v) => v != null).map(Number)
  const bPlayers = [match.participant2Id, match.participant4Id].filter((v) => v != null).map(Number)
  if (aPlayers.includes(winnerId)) return 'A'
  if (bPlayers.includes(winnerId)) return 'B'
  return null
}

export async function propagateBracketWinners(db: Db, tournamentId: number) {
  const all = await db.select().from(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.stage, 'bracket')))
    .orderBy(asc(matches.id))
  if (all.length < 2) return { updated: 0 }
  const rounds: { round: string; list: typeof all }[] = []
  let cur: { round: string; list: typeof all } | null = null
  for (const m of all) {
    if (!cur || cur.round !== (m.round || '')) { cur = { round: m.round || '', list: [] }; rounds.push(cur) }
    cur.list.push(m)
  }
  // bye 자동 해결 — 첫 라운드(rounds[0])에만 적용. 실제 bye는 1회전에서만 발생하며,
  // 이후 라운드의 편측 슬롯(앞 경기 승자 대기 중)은 bye가 아니므로 건드리지 않음.
  // 메모리 스냅샷도 함께 갱신해 같은 호출 내 전파가 bye 승자를 볼 수 있게 한다.
  const firstRound = rounds[0]?.list ?? []
  for (const m of firstRound) {
    const bEmpty = m.teamBId == null && m.participant2Id == null
    const aPresent = m.teamAId != null || m.participant1Id != null
    if (bEmpty && aPresent && m.status !== 'completed') {
      const wid = m.winnerId ?? m.participant1Id ?? null
      await db.update(matches).set({
        status: 'completed',
        winnerId: wid,
        updatedAt: new Date().toISOString(),
      }).where(eq(matches.id, m.id))
      m.status = 'completed'
      m.winnerId = wid
    }
  }
  const teamsById = new Map<number, { id: number; player1Id: number | null; player2Id: number | null }>()
  const getTeam = async (id: number | null | undefined) => {
    if (!id) return null
    if (!teamsById.has(Number(id))) {
      const [t] = await db.select().from(teams).where(eq(teams.id, Number(id))).limit(1)
      if (t) teamsById.set(Number(id), { id: t.id, player1Id: t.player1Id, player2Id: t.player2Id })
    }
    return teamsById.get(Number(id)) || null
  }
  let updated = 0
  for (let r = 0; r < rounds.length - 1; r++) {
    const curList = rounds[r].list
    const nextList = rounds[r + 1].list
    for (let i = 0; i < nextList.length; i++) {
      const freshA = (await db.select().from(matches).where(eq(matches.id, curList[2 * i]?.id ?? -1)).limit(1))[0]
      const freshB = curList[2 * i + 1] ? (await db.select().from(matches).where(eq(matches.id, curList[2 * i + 1].id)).limit(1))[0] : null
      const srcA = freshA || curList[2 * i]
      const srcB = freshB || curList[2 * i + 1]
      if (!srcA) break
      const wTeamA = srcA ? await getTeam(winningSide(srcA) === 'A' ? srcA.teamAId : winningSide(srcA) === 'B' ? srcA.teamBId : null) : null
      const wTeamB = srcB ? await getTeam(winningSide(srcB) === 'A' ? srcB.teamAId : winningSide(srcB) === 'B' ? srcB.teamBId : null) : null
      const want = {
        teamAId: wTeamA?.id ?? null, teamBId: wTeamB?.id ?? null,
        participant1Id: wTeamA?.player1Id ?? null, participant3Id: wTeamA?.player2Id ?? null,
        participant2Id: wTeamB?.player1Id ?? null, participant4Id: wTeamB?.player2Id ?? null,
      }
      const tgt = nextList[i]
      const keys = ['teamAId', 'teamBId', 'participant1Id', 'participant3Id', 'participant2Id', 'participant4Id'] as const
      const changed = keys.some((k) => ((tgt[k] as number | null) ?? null) !== (want[k] ?? null))
      if (changed) {
        await db.update(matches).set({ ...want, updatedAt: new Date().toISOString() }).where(eq(matches.id, tgt.id))
        updated++
      }
    }
  }
  return { updated }
}

export async function ensureTeamBracket(db: Db, tournamentId: number, opts: { force?: boolean; qualifiedPerGroup?: number } = {}) {
  const { force = false, qualifiedPerGroup = 2 } = opts
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1)
  if (!tournament) return { created: false, reason: 'tournament-not-found' }
  if (tournament.matchType !== 'doubles' || tournament.doublesMode !== 'team') return { created: false, reason: 'not-team-mode' }
  const existingBracket = await db.select().from(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.stage, 'bracket')))
  const hasRealAssignment = existingBracket.some((m) => m.teamAId != null || m.teamBId != null || m.participant1Id != null)
  if (hasRealAssignment) return { created: false, reason: 'already-exists' }
  const groupMatches = await db.select().from(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.stage, 'group')))
    .orderBy(asc(matches.id))
  if (groupMatches.length === 0) return { created: false, reason: 'no-group-matches' }
  if (!force && !groupMatches.every((m) => m.status === 'completed')) return { created: false, reason: 'group-not-finished' }
  const groupList = await db.select().from(groups).where(eq(groups.tournamentId, tournamentId)).orderBy(asc(groups.name))
  const groupStandings: { standing: ReturnType<typeof computeTeamStandings>; teamsInGroup: { id: number; name: string; player1Id: number | null; player2Id: number | null; seedRank: number | null }[] }[] = []
  for (const g of groupList) {
    const assigns = await db.select().from(groupAssignments).where(eq(groupAssignments.groupId, g.id))
    const teamIds = assigns.map((a) => a.teamId).filter((v): v is number => v != null)
    if (teamIds.length === 0) continue
    const teamsInGroup: { id: number; name: string; player1Id: number | null; player2Id: number | null; seedRank: number | null }[] = []
    for (const tid of teamIds) {
      const [t] = await db.select().from(teams).where(eq(teams.id, tid)).limit(1)
      if (t) teamsInGroup.push({ id: t.id, name: t.name, player1Id: t.player1Id, player2Id: t.player2Id, seedRank: (t as unknown as { seedRank?: number | null }).seedRank ?? null })
    }
    if (teamsInGroup.length === 0) continue
    const idSet = new Set(teamsInGroup.map((t) => t.id))
    const groupOnlyMatches = groupMatches.filter((m) => m.teamAId != null && m.teamBId != null && idSet.has(Number(m.teamAId)) && idSet.has(Number(m.teamBId)))
    groupStandings.push({ standing: computeTeamStandings(groupOnlyMatches, teamsInGroup), teamsInGroup })
  }
  const qualifiedTeams: { id: number; name: string; player1Id: number | null; player2Id: number | null; seedRank: number | null }[] = []
  const seen = new Set<number>()
  for (let rank = 0; rank < qualifiedPerGroup; rank++) {
    for (const { standing, teamsInGroup } of groupStandings) {
      const row = standing[rank]
      if (!row) continue
      if (seen.has(row.teamId)) continue
      const t = teamsInGroup.find((x) => x.id === row.teamId)
      if (!t) continue
      seen.add(t.id)
      qualifiedTeams.push(t)
    }
  }
  if (qualifiedTeams.length < 2) return { created: false, reason: 'not-enough-qualified-teams' }
  if (existingBracket.length > 0) {
    for (const m of existingBracket) await db.delete(matches).where(eq(matches.id, m.id))
  }
  const bracketMatches = generateTeamBracketMatches(qualifiedTeams)
  for (const bm of bracketMatches) {
    await db.insert(matches).values({
      tournamentId,
      participant1Id: bm.participant1Id ?? null, participant2Id: bm.participant2Id ?? null,
      participant3Id: bm.participant3Id ?? null, participant4Id: bm.participant4Id ?? null,
      teamAId: bm.teamAId ?? null, teamBId: bm.teamBId ?? null,
      type: 'doubles', round: bm.round, stage: 'bracket', status: 'scheduled',
    })
  }
  await propagateBracketWinners(db, tournamentId)
  return { created: true, count: bracketMatches.length }
}

export async function onMatchCompleted(db: Db, tournamentId: number) {
  try {
    await ensureTeamBracket(db, tournamentId)
    await propagateBracketWinners(db, tournamentId)
  } catch (e) {
    console.error('[bracketService] onMatchCompleted failed:', (e as Error).message)
  }
}


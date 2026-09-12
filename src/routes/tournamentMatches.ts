// 경기 생성 파이프라인 — 기존 tournamentRoutes generate-matches 이전
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import { groups, groupAssignments, participants, teams, matches } from '../db/schema'
import { generateAllMatches } from '../lib/generateAll'
import { tournamentApi } from './tournaments'
import { requireTournamentOwner } from '../lib/ownership'

// POST /tournaments/:id/generate-matches — 조별 풀리그 + 본선 생성 (운영자 전용)
tournamentApi.post('/:id/generate-matches', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const tournamentId = Number(c.req.param('id'))
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) return c.json({ message: '유효하지 않은 대회 ID' }, 400)
  // S-06: 본인 대회만 매치 생성 가능 (IDOR 방지) — 존재 여부도 함께 확인
  const ownGen = await requireTournamentOwner(db, c.get('userId'), tournamentId)
  if (!ownGen.ok) return c.json({ message: ownGen.message }, ownGen.status)
  const tournament = ownGen.tournament
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  // 병렬화: groups 조회 (tournament는 소유자 확인에서 이미 조회됨)
  const [groupList] = await Promise.all([
    db.select().from(groups).where(eq(groups.tournamentId, tournamentId)),
  ])
  if (!groupList || groupList.length === 0) {
    return c.json({ message: '조 편성이 먼저 완료되어야 합니다. (POST /group-assignments/run)' }, 400)
  }

  // ── 최적화: 배정/참가자/팀을 3개 쿼리로 일괄 조회 (기존 N+1 제거) ──
  const groupIds = groupList.map((g) => g.id)
  const allAssigns = await db.select().from(groupAssignments)
    .where(inArray(groupAssignments.groupId, groupIds))
  const assignsByGroup = new Map<number, typeof allAssigns>()
  for (const a of allAssigns) {
    const list = assignsByGroup.get(a.groupId) || []
    list.push(a)
    assignsByGroup.set(a.groupId, list)
  }
  const allParticipantIds = [...new Set(allAssigns.map((a) => a.participantId).filter((v): v is number => v != null))]
  const allTeamIds = [...new Set(allAssigns.map((a) => a.teamId).filter((v): v is number => v != null))]
  const pRows = allParticipantIds.length
    ? await db.select().from(participants).where(inArray(participants.id, allParticipantIds))
    : []
  const participantsById = new Map(pRows.map((p) => [p.id, p]))
  const tRows = allTeamIds.length
    ? await db.select().from(teams).where(inArray(teams.id, allTeamIds))
    : []
  const teamsById = new Map(tRows.map((t) => [t.id, t]))

  const groupInput: { id: number | null; name: string; participants: { id: number; seedRank: number | null; totalScore: number | null }[]; teams: { id: number; player1Id: number | null; player2Id: number | null; seedRank: number | null }[] }[] = []
  for (const g of groupList) {
    const assigns = assignsByGroup.get(g.id) || []
    const pentries: { id: number; seedRank: number | null; totalScore: number | null }[] = []
    for (const a of assigns) {
      if (a.participantId == null) continue
      const p = participantsById.get(a.participantId)
      if (p) pentries.push({ id: p.id, seedRank: p.seedRank ?? null, totalScore: (p as { totalScore?: number | null }).totalScore ?? null })
    }
    groupInput.push({ id: g.id, name: g.name, participants: pentries, teams: [] })
  }
  // 기존 매치 일괄 삭제 (match_results는 FK CASCADE) — 루프 삭제 제거
  await db.delete(matches).where(eq(matches.tournamentId, tournamentId))

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
      const assigns = src ? (assignsByGroup.get(src.id) || []) : []
      const teamIds = assigns.map((a) => a.teamId).filter((v): v is number => v != null)
      gi.teams = teamIds
        .map((tid) => teamsById.get(tid))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({ id: t.id, player1Id: t.player1Id, player2Id: t.player2Id, seedRank: (t as unknown as { seedRank?: number | null }).seedRank ?? null }))
    }
  }
  const { matches: allMatches, skippedGroups } = generateAllMatches(groupInput, { matchType, doublesMode, gamesPerPlayer, format })
  // ── 최적화: db.batch() 일괄 삽입 (N쿼리 → 1왕복, D1 100파라미터 제한 회피) ──
  if (allMatches.length > 0) {
    const stmts = allMatches.map((m) => db.insert(matches).values({
      tournamentId,
      participant1Id: m.participant1Id ?? null, participant2Id: m.participant2Id ?? null,
      participant3Id: (m.participant3Id as number | null) ?? null,
      participant4Id: (m.participant4Id as number | null) ?? null,
      teamAId: (m.teamAId as number | null) ?? null, teamBId: (m.teamBId as number | null) ?? null,
      type: m.type || 'singles', round: m.round, stage: m.stage || 'group', status: 'scheduled',
    } as never))
    await db.batch(stmts as unknown as [import('drizzle-orm/batch').BatchItem<'sqlite'>, ...import('drizzle-orm/batch').BatchItem<'sqlite'>[]])
  }
  return c.json({
    count: allMatches.length, matchType, doublesMode,
    gamesPerPlayer: matchType === 'doubles' && doublesMode === 'random' ? gamesPerPlayer : null,
    format, bracketPending: false,
    bracketPlaceholder: matchType === 'doubles' && doublesMode === 'team' && format !== 'league',
        skippedGroups, matches: [],
  }, 201)
})

// DELETE /:id/matches — 해당 대회의 모든 경기 삭제 (리셋) (운영자 전용, 벌크)
// match_results는 matches 외래키 ON DELETE CASCADE로 자동 삭제됨
tournamentApi.delete('/:id/matches', async (c) => {
  if (c.get('role') !== 'organizer') {
    return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  }
  const db = getDb(c.env.DB)
  const tournamentId = Number(c.req.param('id'))
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
    return c.json({ message: '유효하지 않은 대회 ID' }, 400)
  }
  // 대회 존재 여부 + 소유자 확인 (S-06 IDOR 방지)
  const ownReset = await requireTournamentOwner(db, c.get('userId'), tournamentId)
  if (!ownReset.ok) return c.json({ message: ownReset.message }, ownReset.status)

  // 삭제 전 매치 수 확인 (프론트 total 반환용) → 일괄 삭제 (1쿼리)
  const existing = await db.select({ id: matches.id })
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
  await db.delete(matches).where(eq(matches.tournamentId, tournamentId))
  return c.json({ deleted: existing.length, total: existing.length, tournamentId })
})


// 스코어 입력 공통 서비스 — utils/matchScoreService.js 이전 (Drizzle 버전)
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import { matches, matchResults } from '../db/schema'
import { determineWinner, inputsMatch } from './scoreLogic'

type Db = ReturnType<typeof getDb>

export function parseSets(v: unknown): { gamesA: number; gamesB: number }[] | null {
  if (v == null) return null
  if (Array.isArray(v)) return v as { gamesA: number; gamesB: number }[]
  if (typeof v === 'string' && v) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : null } catch { return null }
  }
  return null
}

export function stringifySets(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v || null
  return JSON.stringify(v)
}

export async function submitScore(
  db: Db,
  matchId: number,
  input: { score1?: number | null; score2?: number | null; sets?: unknown } = {},
  submittedBy: 'organizer' | 'participant1' | 'participant2' = 'organizer',
  onMatchCompleted?: (tournamentId: number) => Promise<void>,
) {
  if (!['organizer', 'participant1', 'participant2'].includes(submittedBy)) {
    const err = new Error("submittedBy must be one of 'organizer', 'participant1', 'participant2'") as Error & { statusCode: number }
    err.statusCode = 400
    throw err
  }
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
  if (!match) {
    const err = new Error('Match not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  const score1 = input.score1 != null ? Number(input.score1) : match.score1
  const score2 = input.score2 != null ? Number(input.score2) : match.score2
  const curSets = parseSets(match.sets)
  const sets = input.sets !== undefined ? (input.sets as { gamesA: number; gamesB: number }[] | null) : curSets

  if (submittedBy === 'organizer') {
    const winnerId = determineWinner({ sets, score1, score2 }, match.participant1Id, match.participant2Id)
    await db.update(matches).set({
      score1, score2, sets: stringifySets(sets),
      winnerId, status: 'completed', updatedAt: new Date().toISOString(),
    }).where(eq(matches.id, matchId))
    await db.insert(matchResults).values({
      matchId: match.id,
      participant1Score: score1 ?? 0, participant2Score: score2 ?? 0,
      sets: stringifySets(sets), winnerId, isCompleted: 1, isConfirmed: 1, submittedBy: 'organizer',
    })
    if (onMatchCompleted) await onMatchCompleted(Number(match.tournamentId))
    const [fresh] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
    return { match: fresh, status: 'completed' as string }
  }

  await db.insert(matchResults).values({
    matchId: match.id,
    participant1Score: score1 ?? 0, participant2Score: score2 ?? 0,
    sets: stringifySets(sets), submittedBy,
  })
  const [p1Input] = await db.select().from(matchResults)
    .where(and(eq(matchResults.matchId, match.id), eq(matchResults.submittedBy, 'participant1')))
    .orderBy(desc(matchResults.createdAt)).limit(1)
  const [p2Input] = await db.select().from(matchResults)
    .where(and(eq(matchResults.matchId, match.id), eq(matchResults.submittedBy, 'participant2')))
    .orderBy(desc(matchResults.createdAt)).limit(1)

  if (p1Input && p2Input) {
    const a = { score1: p1Input.participant1Score, score2: p1Input.participant2Score, sets: parseSets(p1Input.sets) }
    const b = { score1: p2Input.participant1Score, score2: p2Input.participant2Score, sets: parseSets(p2Input.sets) }
    if (inputsMatch(a, b)) {
      const winnerId = determineWinner({ sets: a.sets, score1: a.score1, score2: a.score2 }, match.participant1Id, match.participant2Id)
      await db.update(matches).set({
        score1, score2, sets: stringifySets(sets),
        winnerId, status: 'completed', updatedAt: new Date().toISOString(),
      }).where(eq(matches.id, matchId))
      await db.update(matchResults).set({ isCompleted: 1, isConfirmed: 1, winnerId })
        .where(eq(matchResults.matchId, match.id))
      if (onMatchCompleted) await onMatchCompleted(Number(match.tournamentId))
      const [fresh] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
      return { match: fresh, status: 'completed' as string, confirmed: true }
    }
    await db.update(matches).set({
      score1, score2, sets: stringifySets(sets),
      status: 'confirmation_needed', updatedAt: new Date().toISOString(),
    }).where(eq(matches.id, matchId))
    const [fresh] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
    return { match: fresh, status: 'confirmation_needed' as string, conflict: true }
  }

  const nextStatus = match.status === 'scheduled' ? 'in_progress' : match.status
  await db.update(matches).set({
    score1, score2, sets: stringifySets(sets),
    status: nextStatus, updatedAt: new Date().toISOString(),
  }).where(eq(matches.id, matchId))
  const [fresh] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
  return { match: fresh, status: nextStatus as string }
}

export async function confirmMatch(
  db: Db,
  matchId: number,
  decision: { winnerId?: number | null; score1?: number | null; score2?: number | null; sets?: unknown } = {},
  onMatchCompleted?: (tournamentId: number) => Promise<void>,
) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
  if (!match) {
    const err = new Error('Match not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  const score1 = decision.score1 != null ? Number(decision.score1) : match.score1
  const score2 = decision.score2 != null ? Number(decision.score2) : match.score2
  const sets = decision.sets !== undefined ? (decision.sets as { gamesA: number; gamesB: number }[] | null) : parseSets(match.sets)
  let winnerId = decision.winnerId != null ? Number(decision.winnerId) : null
  if (winnerId == null) winnerId = determineWinner({ sets, score1, score2 }, match.participant1Id, match.participant2Id)
  if (winnerId == null) {
    const err = new Error('winnerId를 결정할 수 없습니다. 명시적으로 winnerId를 전달하세요.') as Error & { statusCode: number }
    err.statusCode = 400
    throw err
  }
  await db.update(matches).set({
    score1, score2, sets: stringifySets(sets),
    winnerId, status: 'completed', updatedAt: new Date().toISOString(),
  }).where(eq(matches.id, matchId))
  await db.update(matchResults).set({ isCompleted: 1, isConfirmed: 1, winnerId })
    .where(eq(matchResults.matchId, match.id))
  if (onMatchCompleted) await onMatchCompleted(Number(match.tournamentId))
  const [fresh] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
  return fresh
}


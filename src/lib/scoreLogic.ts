// 테니스 스코어 승자 판정 로직 (순수 함수) — utils/scoreLogic.js 이전
export interface SetScore { gamesA: number; gamesB: number; tiebreakA?: number; tiebreakB?: number; games_a?: number; games_b?: number }

export function countSetWins(sets: SetScore[] | null | undefined): { winsA: number; winsB: number } {
  let winsA = 0
  let winsB = 0
  ;(sets || []).forEach((s) => {
    if (!s) return
    const ga = s.gamesA ?? s.games_a ?? 0
    const gb = s.gamesB ?? s.games_b ?? 0
    if (ga > gb) winsA += 1
    else if (gb > ga) winsB += 1
  })
  return { winsA, winsB }
}

export function isMatchComplete(sets: SetScore[] | null | undefined, setsToWin = 2): boolean {
  const { winsA, winsB } = countSetWins(sets)
  return winsA >= setsToWin || winsB >= setsToWin
}

export function determineWinner(
  input: { sets?: SetScore[] | null; score1?: number | null; score2?: number | null } | null | undefined,
  participant1Id: number | null | undefined,
  participant2Id: number | null | undefined,
): number | null {
  if (!input) return null
  const { sets, score1, score2 } = input
  if (sets && sets.length > 0) {
    const { winsA, winsB } = countSetWins(sets)
    if (winsA > winsB) return participant1Id != null ? Number(participant1Id) : null
    if (winsB > winsA) return participant2Id != null ? Number(participant2Id) : null
    return null
  }
  if (score1 != null && score2 != null) {
    if (Number(score1) > Number(score2)) return participant1Id != null ? Number(participant1Id) : null
    if (Number(score2) > Number(score1)) return participant2Id != null ? Number(participant2Id) : null
    return null
  }
  return null
}

export function inputsMatch(
  a: { score1?: number | null; score2?: number | null; sets?: SetScore[] | null } | null | undefined,
  b: { score1?: number | null; score2?: number | null; sets?: SetScore[] | null } | null | undefined,
): boolean {
  if (!a || !b) return false
  if (a.sets && b.sets) {
    if (a.sets.length !== b.sets.length) return false
    for (let i = 0; i < a.sets.length; i++) {
      const sa = a.sets[i]
      const sb = b.sets[i]
      if ((sa.gamesA ?? sa.games_a) !== (sb.gamesA ?? sb.games_a)) return false
      if ((sa.gamesB ?? sa.games_b) !== (sb.gamesB ?? sb.games_b)) return false
    }
    return a.score1 === b.score1 && a.score2 === b.score2
  }
  return Number(a.score1) === Number(b.score1) && Number(a.score2) === Number(b.score2)
}

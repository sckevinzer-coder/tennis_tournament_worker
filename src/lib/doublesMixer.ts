// 12.4 게임 수 고정 믹서 복식 — utils/matchGenerator.js 이전
import type { GenPlayer, GenMatch } from './matchGenerator'

export function generateDoublesFixedGamesMatches(participants: GenPlayer[], roundName: string, gamesPerPlayer = 4): GenMatch[] {
  const players = [...participants].sort((a, b) => a.id - b.id)
  const n = players.length
  if (n < 4) return []
  const K = Math.max(2, Math.min(6, Number(gamesPerPlayer) || 4))
  const gamesPerRound = Math.max(1, Math.floor(n / 4))
  const totalGames = Math.ceil((n * K) / 4)
  const totalRounds = Math.ceil(totalGames / gamesPerRound)
  const targets = new Map(players.map((p) => [p.id, K]))
  for (let i = 0, excess = totalGames * 4 - n * K; excess > 0; excess--) {
    targets.set(players[i].id, (targets.get(players[i].id) || 0) + 1)
    i = (i + 1) % n
  }
  let s = (players.reduce((acc, p) => (acc + p.id * 2654435761) >>> 0, 0) || 1) >>> 0
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  const shuffle = (arr: GenPlayer[]) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t }
    return a
  }
  const pairKey = (x: number, y: number) => (x < y ? `${x}|${y}` : `${y}|${x}`)
  const partnerCount = new Map<string, number>()
  const oppCount = new Map<string, number>()
  const bump = (map: Map<string, number>, a: number, b: number) => {
    const k = pairKey(a, b); map.set(k, (map.get(k) || 0) + 1)
  }
  const matches: GenMatch[] = []
  const playedCount = new Map(players.map((p) => [p.id, 0]))
  const restCount = new Map(players.map((p) => [p.id, 0]))
  for (let r = 0; r < totalRounds && matches.length < totalGames; r++) {
    const gamesLeft = totalGames - matches.length
    const pool = players
      .filter((p) => (targets.get(p.id) || 0) - (playedCount.get(p.id) || 0) > 0)
      .sort((a, b) => {
        const ra = (targets.get(a.id) || 0) - (playedCount.get(a.id) || 0)
        const rb = (targets.get(b.id) || 0) - (playedCount.get(b.id) || 0)
        if (rb !== ra) return rb - ra
        if ((restCount.get(a.id) || 0) !== (restCount.get(b.id) || 0)) return (restCount.get(a.id) || 0) - (restCount.get(b.id) || 0)
        return a.id - b.id
      })
    const gamesNow = Math.min(gamesPerRound, gamesLeft, Math.floor(pool.length / 4))
    if (gamesNow < 1) break
    const playing = pool.slice(0, gamesNow * 4)
    players.filter((p) => playing.indexOf(p) < 0).forEach((p) => restCount.set(p.id, (restCount.get(p.id) || 0) + 1))
    const shuffled = shuffle(playing)
    for (let i = 0; i + 3 < shuffled.length && matches.length < totalGames; i += 4) {
      const q = shuffled.slice(i, i + 4)
      type Pair = [GenPlayer, GenPlayer]
      const options: [Pair, Pair][] = [
        [[q[0], q[1]], [q[2], q[3]]],
        [[q[0], q[2]], [q[1], q[3]]],
        [[q[0], q[3]], [q[1], q[2]]],
      ]
      let best = options[0]
      let bestScore = Infinity
      const opts = options as unknown as [[GenPlayer, GenPlayer], [GenPlayer, GenPlayer]][]
      for (const pr of opts) {
        const a1 = pr[0][0]; const a2 = pr[0][1]; const b1 = pr[1][0]; const b2 = pr[1][1]
        const score =
          (partnerCount.get(pairKey(a1.id, a2.id)) || 0) * 100 +
          (partnerCount.get(pairKey(b1.id, b2.id)) || 0) * 100 +
          (oppCount.get(pairKey(a1.id, b1.id)) || 0) +
          (oppCount.get(pairKey(a1.id, b2.id)) || 0) +
          (oppCount.get(pairKey(a2.id, b1.id)) || 0) +
          (oppCount.get(pairKey(a2.id, b2.id)) || 0) + rand()
        if (score < bestScore) { bestScore = score; best = pr as unknown as [Pair, Pair] }
      }
      const a1 = (best as unknown as [[GenPlayer, GenPlayer], [GenPlayer, GenPlayer]])[0][0]
      const a2 = (best as unknown as [[GenPlayer, GenPlayer], [GenPlayer, GenPlayer]])[0][1]
      const b1 = (best as unknown as [[GenPlayer, GenPlayer], [GenPlayer, GenPlayer]])[1][0]
      const b2 = (best as unknown as [[GenPlayer, GenPlayer], [GenPlayer, GenPlayer]])[1][1]
      bump(partnerCount, a1.id, a2.id)
      bump(partnerCount, b1.id, b2.id)
      const xs = [a1.id, a2.id]; const ys = [b1.id, b2.id]
      for (const x of xs) for (const y of ys) bump(oppCount, x, y)
      matches.push({
        participant1Id: a1.id, participant2Id: b1.id,
        participant3Id: a2.id, participant4Id: b2.id,
        type: 'doubles', round: roundName, stage: 'group', status: 'scheduled',
      })
    }
    playing.forEach((p) => playedCount.set(p.id, (playedCount.get(p.id) || 0) + 1))
  }
  return matches
}

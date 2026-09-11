// 조편성 유틸 — 기존 backend/utils/groupAssignment.js 이전 (순수 로직, DB 없음)
// Modes: round_robin | random | seed | mixed
export interface Assignable {
  id: number
  seedRank?: number | null
}

export interface AssignedGroup<T> {
  id: number
  name: string
  participants: T[]
}

export type GroupMode = 'round_robin' | 'random' | 'seed' | 'mixed'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function snakeDistribute<T extends Assignable>(list: T[], numGroups: number): AssignedGroup<T>[] {
  const groups: AssignedGroup<T>[] = Array.from({ length: numGroups }, (_, i) => ({
    id: i + 1,
    name: String.fromCharCode(65 + i),
    participants: [],
  }))
  list.forEach((p, index) => {
    const round = Math.floor(index / numGroups)
    const col = index % numGroups
    const gi = round % 2 === 0 ? col : numGroups - 1 - col
    groups[gi].participants.push(p)
  })
  return groups
}

export function assignParticipantsToGroups<T extends Assignable>(
  items: T[],
  numGroups: number,
  mode: GroupMode = 'round_robin'
): AssignedGroup<T>[] {
  if (!items || items.length === 0) return []
  if (!numGroups || numGroups < 1) throw new Error('numGroups must be >= 1')

  const groups: AssignedGroup<T>[] = Array.from({ length: numGroups }, (_, i) => ({
    id: i + 1,
    name: String.fromCharCode(65 + i),
    participants: [],
  }))

  if (mode === 'random') {
    const ordered = shuffle(items)
    ordered.forEach((p, index) => {
      groups[index % numGroups].participants.push(p)
    })
    return groups
  }

  if (mode === 'seed') {
    const seeded = items.filter((p) => p.seedRank != null).sort((a, b) => (a.seedRank ?? 0) - (b.seedRank ?? 0))
    const unseeded = items.filter((p) => p.seedRank == null)
    return snakeDistribute([...seeded, ...unseeded], numGroups)
  }

  if (mode === 'mixed') {
    const seeded = items.filter((p) => p.seedRank != null).sort((a, b) => (a.seedRank ?? 0) - (b.seedRank ?? 0))
    const unseeded = shuffle(items.filter((p) => p.seedRank == null))
    return snakeDistribute([...seeded, ...unseeded], numGroups)
  }

  // default: round_robin (등록순)
  const ordered = [...items].sort((a, b) => a.id - b.id)
  ordered.forEach((p, index) => {
    groups[index % numGroups].participants.push(p)
  })
  return groups
}

// 초기 브래킷 생성 (2명씩 페어, 홀수면 부전승)
export function generateInitialBrackets<T extends { id: number }>(items: T[]) {
  const brackets: Array<{ participant1Id: number; participant2Id: number | null; round: string; isBye?: boolean }> = []
  for (let i = 0; i < items.length; i += 2) {
    if (i + 1 < items.length) {
      brackets.push({ participant1Id: items[i].id, participant2Id: items[i + 1].id, round: 'round_1' })
    } else {
      brackets.push({ participant1Id: items[i].id, participant2Id: null, round: 'round_1', isBye: true })
    }
  }
  return brackets
}

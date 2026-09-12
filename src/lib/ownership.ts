// 대회 소유자 검증 헬퍼 (S-06 IDOR 대응)
// organizer A가 organizer B의 대회를 수정/삭제하지 못하도록
// 요청자의 organizers.id와 tournaments.organizerId를 비교
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { tournaments, organizers } from '../db/schema'

type Db = ReturnType<typeof getDb>
type Tournament = typeof tournaments.$inferSelect

export type OwnerCheck =
  | { ok: true; orgId: number; tournament: Tournament }
  | { ok: false; status: 403 | 404; message: string }

export async function requireTournamentOwner(
  db: Db,
  userId: number | null | undefined,
  tournamentId: number,
): Promise<OwnerCheck> {
  if (userId == null) {
    return { ok: false, status: 403, message: '대회 소유자 권한이 필요합니다' }
  }
  const [org] = await db.select().from(organizers).where(eq(organizers.userId, userId)).limit(1)
  if (!org) {
    return { ok: false, status: 403, message: '대회 소유자 권한이 필요합니다' }
  }
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1)
  if (!t) {
    return { ok: false, status: 404, message: 'Tournament not found' }
  }
  if (t.organizerId != null && t.organizerId !== org.id) {
    return { ok: false, status: 403, message: '본인 대회만 수정할 수 있습니다' }
  }
  return { ok: true, orgId: org.id, tournament: t }
}

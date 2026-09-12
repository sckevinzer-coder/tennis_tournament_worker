// 보안·감사·검증 헬퍼 모듈 (S-13 페이징, S-15 XSS, S-16 ID, S-18 감사 로그)
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { auditLogs, tournaments, organizers } from '../db/schema'

type Db = ReturnType<typeof getDb>
type Tournament = typeof tournaments.$inferSelect
type QueryParams = Record<string, string | undefined>

// S-13: 페이지네이션 파싱 — 기본 100, 최대 500
export function parsePagination(query: QueryParams): { limit: number; offset: number } {
  let limit = parseInt(query.limit ?? '100', 10)
  let offset = parseInt(query.offset ?? '0', 10)
  if (!Number.isFinite(limit) || limit < 1) limit = 100
  if (limit > 500) limit = 500
  if (!Number.isFinite(offset) || offset < 0) offset = 0
  return { limit, offset }
}

// S-15: 저장형 XSS 방지 — 사용자 입력 정규화 (서버측 1차 필터)
// React가 기본 이스케이프하지만, 위험 패턴은 서버에서도 차단
const DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on\w+\s*=/i,  // onclick, onerror 등
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
]

export function sanitizeUserInput(input: string, maxLen = 500): string {
  let s = input.trim()
  if (s.length > maxLen) s = s.slice(0, maxLen)
  // 위험 패턴이 포함되어 있으면 안전한 문자로 치환
  for (const p of DANGEROUS_PATTERNS) {
    s = s.replace(p, (m) => m.replace(/[<>]/g, ''))
  }
  return s
}

// S-16: ID 경계값 검증 헬퍼 — NaN/음수/초대형 숫자 차단
export function parseIdParam(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > 2_147_483_647 || !Number.isInteger(n)) return null
  return n
}

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

// S-18: 감사 로그 기록
export async function recordAudit(
  db: Db,
  userId: number | null | undefined,
  action: string,
  targetType?: string,
  targetId?: number,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: userId ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      detail: detail ? JSON.stringify(detail) : null,
    } as never)
  } catch {
    // 감사 로그 실패는 메인 작업을 방해하지 않음
  }
}


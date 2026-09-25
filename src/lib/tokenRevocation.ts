// Step 26.4: 로그아웃된 토큰(jti) 폐기 목록 — JWT는 stateless이므로 서버측 무효화를 위해 별도 기록
import { eq, lt } from 'drizzle-orm'
import type { DB } from '../db/client'
import { revokedTokens } from '../db/schema'

// 폐기된 토큰인지 확인 (jti 미포함 토큰은 대상 아님 — 하위 호환)
export async function isTokenRevoked(db: DB, jti?: string | null): Promise<boolean> {
  if (!jti) return false
  const rows = await db
    .select({ jti: revokedTokens.jti })
    .from(revokedTokens)
    .where(eq(revokedTokens.jti, jti))
    .limit(1)
  return rows.length > 0
}

// 토큰 폐기 + 이미 만료된 폐기 기록 정리
export async function revokeToken(
  db: DB,
  data: { jti: string; userId: number; role: string | null; exp: number | null },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.insert(revokedTokens).values({
    jti: data.jti,
    userId: data.userId,
    role: data.role,
    expiresAt: data.exp ?? now + 60 * 60 * 24,
  }).onConflictDoNothing()
  // 만료된 기록은 더 이상 검사할 필요가 없으므로 정리한다.
  await db.delete(revokedTokens).where(lt(revokedTokens.expiresAt, now))
}

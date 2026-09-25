// Bearer JWT 인증 미들웨어 — 기존 tennis_tournament의 verifyBearer/requireOrganizer 대응
import type { MiddlewareHandler } from 'hono'
import { verifyJwt, jwtSecret } from '../lib/auth'
import { getDb } from '../db/client'
import { isTokenRevoked } from '../lib/tokenRevocation'

export type AppEnv = {
  Bindings: Env
  Variables: {
    userId: number | null
    role: string | null
    jti: string | null
    tokenExp: number | null
  }
}

// 토큰 검증 (선택) — 유효하면 userId/role 저장, 없어도 통과
// Step 26.4: 로그아웃으로 폐기된 토큰(jti)은 인증 실패(401)로 처리한다.
export const authOptional: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('userId', null)
  c.set('role', null)
  c.set('jti', null)
  c.set('tokenExp', null)
  const auth = c.req.header('authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m) {
    const payload = await verifyJwt(m[1], jwtSecret(c.env))
    if (payload) {
      if (await isTokenRevoked(getDb(c.env.DB), payload.jti)) {
        return c.json({ message: '로그아웃된 토큰입니다. 다시 로그인해 주세요.' }, 401)
      }
      c.set('userId', payload.sub)
      c.set('role', payload.role)
      c.set('jti', payload.jti ?? null)
      c.set('tokenExp', payload.exp ?? null)
    }
  }
  await next()
}

// 운영자 전용 가드 — 9.2 requireOrganizer 대응
export const requireOrganizer: MiddlewareHandler<AppEnv> = async (c, next) => {
  const role = c.get('role')
  if (role !== 'organizer') {
    return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  }
  await next()
}
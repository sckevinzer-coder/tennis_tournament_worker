// Bearer JWT 인증 미들웨어 — 기존 tennis_tournament의 verifyBearer/requireOrganizer 대응
import type { MiddlewareHandler } from 'hono'
import { verifyJwt, jwtSecret } from '../lib/auth'

export type AppEnv = {
  Bindings: Env
  Variables: {
    userId: number | null
    role: string | null
  }
}

// 토큰 검증 (선택) — 유효하면 userId/role 저장, 없어도 통과
export const authOptional: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('userId', null)
  c.set('role', null)
  const auth = c.req.header('authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m) {
    const payload = await verifyJwt(m[1], jwtSecret(c.env))
    if (payload) {
      c.set('userId', payload.sub)
      c.set('role', payload.role)
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
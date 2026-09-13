// 8.5 회원가입/로그인 — 기존 authController 이전
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { users, organizers } from '../db/schema'
import type { AppEnv } from '../middleware/auth'
import { createUserWithOrganizer, verifyPassword, hashPassword, signJwt, jwtSecret } from '../lib/auth'

export const authApi = new Hono<AppEnv>()

// POST /register — { name, email, password, role } → { token, user }
authApi.post('/register', async (c) => {
  const db = getDb(c.env.DB)
  const body = await c.req.json<{ name?: string; email?: string; password?: string; role?: string }>().catch(() => null)
  const name = String(body?.name ?? '').trim()
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  const role = body?.role === 'organizer' ? 'organizer' : 'user'

  if (!name || !email || !password) {
    return c.json({ message: 'name, email, password are required' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ message: '유효한 이메일이 필요합니다' }, 400)
  }
  if (password.length < 8) {
    return c.json({ message: '비밀번호는 8자 이상이어야 합니다' }, 400)
  }
  if (password.length > 72) {
    return c.json({ message: '비밀번호는 72자 이하이어야 합니다' }, 400)
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    return c.json({ message: '이미 가입된 이메일입니다' }, 409)
  }

  const user = await createUserWithOrganizer(db, { name, email, password, role })
  const token = await signJwt({ sub: user.id, role: user.role }, jwtSecret(c.env))
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, 201)
})

// POST /login — { email, password } → { token, user }
// S-10: 인메모리 rate limit — IP당 10회/분 초과 시 429
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function loginRateLimited(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now()
  const WINDOW_MS = 60_000
  const MAX_ATTEMPTS = 10
  const entry = loginAttempts.get(ip)
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { limited: false, retryAfter: 0 }
  }
  entry.count += 1
  if (entry.count > MAX_ATTEMPTS) {
    return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { limited: false, retryAfter: 0 }
}

authApi.post('/login', async (c) => {
  // S-10: 브루트포스 방어 — IP당 10회/분
  const ip = c.req.header('cf-connecting-ip')
    ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  const rl = loginRateLimited(ip)
  if (rl.limited) {
    return c.json({ message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429, { 'Retry-After': String(rl.retryAfter) })
  }
  const db = getDb(c.env.DB)
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => null)
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  if (!email || !password) {
    return c.json({ message: 'email, password are required' }, 400)
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) return c.json({ message: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401)

  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return c.json({ message: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401)

  const token = await signJwt({ sub: user.id, role: user.role }, jwtSecret(c.env))
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
})

// GET /me — Bearer 필수
authApi.get('/me', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ message: '유효한 토큰이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ message: 'User not found' }, 404)
  const [org] = await db.select().from(organizers).where(eq(organizers.userId, userId)).limit(1)
  return c.json({ id: user.id, name: user.name, email: user.email, role: user.role, organizer: org ? { id: org.id, orgName: org.orgName } : null })
})

// PUT /me — 내 정보(이름/이메일) 수정 — Bearer 필수
authApi.put('/me', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ message: '유효한 토큰이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const body = await c.req.json<{ name?: string; email?: string }>().catch(() => null)
  const name = String(body?.name ?? '').trim()
  const email = String(body?.email ?? '').trim().toLowerCase()

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ message: 'User not found' }, 404)

  const updates: Partial<typeof users.$inferInsert> = {}
  if (name) {
    if (name.length > 50) return c.json({ message: '이름은 50자 이하여야 합니다' }, 400)
    updates.name = name
  }
  if (email && email !== user.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ message: '유효한 이메일이 필요합니다' }, 400)
    }
    const dup = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (dup.length > 0) return c.json({ message: '이미 사용 중인 이메일입니다' }, 409)
    updates.email = email
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ id: user.id, name: user.name, email: user.email, role: user.role })
  }
  const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning()
  // 주최자면 조직명도 이름과 동기화 (초기 orgName이 가입자 이름과 동일한 경우만)
  const [org] = await db.select().from(organizers).where(eq(organizers.userId, userId)).limit(1)
  if (org && updates.name && org.orgName === user.name) {
    await db.update(organizers).set({ orgName: updates.name }).where(eq(organizers.id, org.id))
  }
  return c.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role })
})

// PUT /me/password — 비밀번호 변경 — Bearer 필수, 현재 비밀번호 확인
authApi.put('/me/password', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ message: '유효한 토큰이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>().catch(() => null)
  const currentPassword = String(body?.currentPassword ?? '')
  const newPassword = String(body?.newPassword ?? '')

  if (!currentPassword || !newPassword) {
    return c.json({ message: 'currentPassword, newPassword are required' }, 400)
  }
  if (newPassword.length < 8) {
    return c.json({ message: '비밀번호는 8자 이상이어야 합니다' }, 400)
  }
  if (newPassword.length > 72) {
    return c.json({ message: '비밀번호는 72자 이하이어야 합니다' }, 400)
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ message: 'User not found' }, 404)

  const ok = await verifyPassword(currentPassword, user.passwordHash)
  if (!ok) return c.json({ message: '현재 비밀번호가 올바르지 않습니다' }, 401)

  const passwordHash = await hashPassword(newPassword)
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId))
  return c.json({ message: '비밀번호가 변경되었습니다' })
})

// DELETE /me — 회원탈퇴 — Bearer 필수, 비밀번호 재확인
// 스키마: users 삭제 시 organizers cascade, tournaments.organizerId는 set null (대회는 무주공으로 유지)
authApi.delete('/me', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ message: '유효한 토큰이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const body = await c.req.json<{ password?: string }>().catch(() => null)
  const password = String(body?.password ?? '')
  if (!password) return c.json({ message: '비밀번호 확인이 필요합니다' }, 400)

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ message: 'User not found' }, 404)

  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return c.json({ message: '비밀번호가 올바르지 않습니다' }, 401)

  await db.delete(users).where(eq(users.id, userId))
  return c.json({ message: '회원탈퇴가 완료되었습니다' })
})
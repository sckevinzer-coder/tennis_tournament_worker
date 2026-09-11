// 8.5 회원가입/로그인 — 기존 authController 이전
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { users, organizers } from '../db/schema'
import type { AppEnv } from '../middleware/auth'
import { createUserWithOrganizer, verifyPassword, signJwt } from '../lib/auth'

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
  if (password.length < 4) {
    return c.json({ message: '비밀번호는 4자 이상이어야 합니다' }, 400)
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    return c.json({ message: '이미 가입된 이메일입니다' }, 409)
  }

  const user = await createUserWithOrganizer(db, { name, email, password, role })
  const token = await signJwt({ sub: user.id, role: user.role }, c.env.JWT_SECRET || 'tennis-dev-secret-change-me')
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, 201)
})

// POST /login — { email, password } → { token, user }
authApi.post('/login', async (c) => {
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

  const token = await signJwt({ sub: user.id, role: user.role }, c.env.JWT_SECRET || 'tennis-dev-secret-change-me')
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
// 인증 유틸 — Cloudflare Workers Web Crypto 기반
// bcrypt 대신 PBKDF2-SHA256 (Workers 런타임 제약), JWT는 HMAC-SHA256으로 직접 서명
import { users, organizers } from '../db/schema'

const PBKDF2_ITERATIONS = 100_000

// JWT_SECRET이 반드시 설정되어야 합니다 (wrangler secret put JWT_SECRET)
export function jwtSecret(env: Env): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured. Run: wrangler secret put JWT_SECRET')
  }
  return env.JWT_SECRET
}

// ---- 비밀번호 해시 (PBKDF2) ----
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256
  )
  const hashHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const saltHex = parts[2]
  const expectedHash = parts[3]
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key, 256
  )
  const hashHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex === expectedHash
}

// ---- JWT (HMAC-SHA256, 수동 서명) ----
function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export type JwtPayload = { sub: number; role: string; exp: number }

export async function signJwt(payload: Omit<JwtPayload, 'exp'>, secret: string, ttlSeconds = 60 * 60 * 24 * 7): Promise<string> {
  const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })))
  const data = `${header}.${body}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const sigBytes = b64urlDecode(sig)
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${header}.${body}`))
  if (!ok) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as JwtPayload
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ---- 사용자 생성 (주최자면 Organizer 자동 생성) ----
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'
type Db = ReturnType<typeof drizzle<typeof schema>>

export async function createUserWithOrganizer(
  db: Db,
  data: { name: string; email: string; password: string; role: 'user' | 'organizer' }
) {
  const passwordHash = await hashPassword(data.password)
  const [user] = await db.insert(users).values({
    name: data.name,
    email: data.email,
    passwordHash,
    role: data.role,
  }).returning()
  if (data.role === 'organizer') {
    await db.insert(organizers).values({ userId: user.id, orgName: data.name })
  }
  return user
}
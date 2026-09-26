// Step 28: 푸시 구독 API — 기존 인증 체계(authOptional + userId) 재사용
// POST /push/subscribe — { endpoint, keys: { p256dh, auth }, participantId?, tournamentId? }
// POST /push/unsubscribe — { endpoint }
// GET /push/vapid-public-key — { publicKey }
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { pushSubscriptions, participants, tournaments } from '../db/schema'
import { sanitizeUserInput } from '../lib/ownership'
import type { AppEnv } from '../middleware/auth'

export const pushApi = new Hono<AppEnv>()

// VAPID 공개키 — 구독 시 applicationServerKey로 사용 (vars 또는 secret)
pushApi.get('/vapid-public-key', async (c) => {
  const key = String((c.env as { VAPID_PUBLIC_KEY?: string }).VAPID_PUBLIC_KEY ?? '').trim()
  if (!key) return c.json({ message: '푸시 알림이 아직 설정되지 않았습니다' }, 503)
  return c.json({ publicKey: key })
})

// 구독 저장/갱신 — 로그인 없이도 가능(참가자 기반), endpoint UNIQUE로 upsert
pushApi.post('/subscribe', async (c) => {
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
  const keys = body.keys as { p256dh?: unknown; auth?: unknown } | undefined
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : ''
  const auth = typeof keys?.auth === 'string' ? keys.auth.trim() : ''
  if (!endpoint || !p256dh || !auth) {
    return c.json({ message: 'endpoint, keys.p256dh, keys.auth가 필요합니다' }, 400)
  }
  if (endpoint.length > 2000 || p256dh.length > 500 || auth.length > 500) {
    return c.json({ message: '구독 정보가 너무 깁니다' }, 400)
  }
  // endpoint는 URL이므로 sanitize 대상 아님. 숫자 필드만 검증
  const toId = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) return null
    return n
  }
  const participantId = toId(body.participantId)
  const tournamentId = toId(body.tournamentId)
  if (body.participantId != null && participantId == null) {
    return c.json({ message: '유효하지 않은 participantId' }, 400)
  }
  if (body.tournamentId != null && tournamentId == null) {
    return c.json({ message: '유효하지 않은 tournamentId' }, 400)
  }
  // FK 존재 검증 — 없는 참가자/대회 ID로 구독하면 이후 푸시 매칭이 깨지므로 404
  if (participantId != null) {
    const [p] = await db.select({ id: participants.id }).from(participants).where(eq(participants.id, participantId)).limit(1)
    if (!p) return c.json({ message: '참가자를 찾을 수 없습니다' }, 404)
  }
  if (tournamentId != null) {
    const [t] = await db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1)
    if (!t) return c.json({ message: '대회를 찾을 수 없습니다' }, 404)
  }
  const userId = c.get('userId')
  const now = new Date().toISOString()
  const [existing] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).limit(1)
  if (existing) {
    await db.update(pushSubscriptions).set({
      p256dh, auth,
      participantId: participantId ?? existing.participantId,
      tournamentId: tournamentId ?? existing.tournamentId,
      userId: userId ?? existing.userId,
      updatedAt: now,
    }).where(eq(pushSubscriptions.endpoint, endpoint))
    return c.json({ ok: true, updated: true })
  }
  await db.insert(pushSubscriptions).values({
    endpoint, p256dh, auth,
    participantId, tournamentId,
    userId: userId ?? null,
  } as never)
  return c.json({ ok: true, created: true }, 201)
})

// 구독 해제 — 본인 endpoint만 삭제 (endpoint 자체가 비밀 토큰 역할)
pushApi.post('/unsubscribe', async (c) => {
  const db = getDb(c.env.DB)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const endpoint = typeof body.endpoint === 'string' ? sanitizeUserInput(body.endpoint.trim(), 2000) : ''
  if (!endpoint) return c.json({ message: 'endpoint가 필요합니다' }, 400)
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  return c.json({ ok: true })
})

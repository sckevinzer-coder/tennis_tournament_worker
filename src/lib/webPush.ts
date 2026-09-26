// Step 28: Web Push 전송 헬퍼 (web-push-neo 기반, Cloudflare Workers 호환)
// - VAPID 키: wrangler secret VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ VAPID_SUBJECT는 vars)
// - 푸시 페이로드: { title, body, url?, tag?, matchId?, tournamentId? } JSON
import { sendNotification, type PushSubscription } from 'web-push-neo'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { pushSubscriptions } from '../db/schema'

type Db = ReturnType<typeof getDb>

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
  matchId?: number
  tournamentId?: number
  type?: string
}

type PushEnv = {
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
  DB: D1Database
}

function vapidDetails(env: PushEnv) {
  const publicKey = String(env.VAPID_PUBLIC_KEY ?? '').trim()
  const privateKey = String(env.VAPID_PRIVATE_KEY ?? '').trim()
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys are not configured. Run: wrangler secret put VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY')
  }
  return {
    subject: String(env.VAPID_SUBJECT ?? 'mailto:admin@example.com'),
    publicKey,
    privateKey,
  }
}

function toWebPushSubscription(row: { endpoint: string; p256dh: string; auth: string }): PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }
}

/** 참가자 ID 기준 구독 조회 */
export async function findSubscriptionsByParticipantIds(db: Db, participantIds: number[]) {
  const ids = [...new Set(participantIds.filter((n) => Number.isInteger(n) && n > 0))]
  if (ids.length === 0) return []
  const { inArray } = await import('drizzle-orm')
  return db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.participantId, ids))
}

/** 만료(410/404)된 구독 정리 */
async function removeDeadSubscription(db: Db, endpoint: string) {
  try {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  } catch {
    /* 정리 실패는 무시 */
  }
}

/** 구독 목록에 푸시 일괄 전송 (실패해도 호출자를 깨지 않음). 전송 결과 반환 */
export async function sendPushToSubscriptions(
  env: PushEnv,
  rows: { endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
): Promise<{ sent: number; removed: number; failed: number }> {
  const result = { sent: 0, removed: 0, failed: 0 }
  if (rows.length === 0) return result
  let details
  try {
    details = vapidDetails(env)
  } catch (e) {
    console.error('[webpush] VAPID 미설정:', (e as Error).message)
    return { sent: 0, removed: 0, failed: rows.length }
  }
  const body = JSON.stringify(payload)
  const db = getDb(env.DB)
  await Promise.all(rows.map(async (row) => {
    try {
      await sendNotification(toWebPushSubscription(row), body, {
        vapidDetails: details,
        TTL: 60 * 60 * 24, // 24시간 유지
        urgency: 'high',
        topic: payload.tag?.slice(0, 32),
      })
      result.sent += 1
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        await removeDeadSubscription(db, row.endpoint)
        result.removed += 1
      } else {
        console.error('[webpush] 전송 실패:', status ?? (e as Error)?.message)
        result.failed += 1
      }
    }
  }))
  return result
}

/** 경기 참가자(최대 4명)에게 경기 시작 푸시 전송 — fire-and-forget용 */
export async function notifyMatchStarted(
  env: PushEnv,
  match: { id: number; tournamentId: number; court?: string | null; participant1Id?: number | null; participant2Id?: number | null; participant3Id?: number | null; participant4Id?: number | null },
  title: string,
  body: string,
): Promise<void> {
  try {
    const db = getDb(env.DB)
    const ids = [match.participant1Id, match.participant2Id, match.participant3Id, match.participant4Id]
      .filter((v): v is number => v != null)
    const rows = await findSubscriptionsByParticipantIds(db, ids)
    if (rows.length === 0) return
    await sendPushToSubscriptions(env, rows, {
      title,
      body,
      url: `/`,
      tag: `match-${match.id}`,
      matchId: match.id,
      tournamentId: match.tournamentId,
      type: 'match_started',
    })
  } catch (e) {
    console.error('[webpush] notifyMatchStarted 실패:', (e as Error)?.message)
  }
}

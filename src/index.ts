// 테니스 대회 관리 — Cloudflare Workers 진입점 (Hono + Drizzle + D1)
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { eq, and } from 'drizzle-orm'
import { getDb, type DB } from './db/client'
import { organizers, participants, tournaments } from './db/schema'
import { jwtSecret, verifyJwt } from './lib/auth'
import type { AppEnv } from './middleware/auth'
import { authOptional } from './middleware/auth'
import { authApi } from './routes/auth'
import { tournamentApi } from './routes/tournaments'
import { participantApi } from './routes/participants'
import { teamApi } from './routes/teams'
import { groupApi } from './routes/groups'
import { groupAssignmentApi } from './routes/groupAssignments'
import './routes/groupAssignmentCrud'
import { matchApi } from './routes/matches'
import { matchResultApi } from './routes/matchResults'
import { scoringRuleApi } from './routes/scoringRules'
import { rankingSnapshotApi } from './routes/rankingSnapshots'
import { registrationRequestApi } from './routes/registrationRequests'
import './routes/tournamentMatches'
import './routes/tournamentNotices'
import './routes/tournamentStandings'
import { DOStub } from './lib/realtime'
import { MatchRealtime } from './do/MatchRealtime'

export { MatchRealtime }
// 라우트 마운트 (기존 tennis_tournament 경로 유지)

const app = new Hono<AppEnv>()

// CORS — 프론트(localhost:5173)와 프로덕션(origin 포함) 접근 허용
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://tennis-tournament.jplee.workers.dev',
]
app.use('*', cors({
  origin: (origin) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return origin
    return null
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Type'],
  credentials: true,
}))

// S-14: 요청 본문 크기 제한 (1MB) — DoS 방지
app.use('*', async (c, next) => {
  const cl = c.req.header('content-length')
  if (cl && Number(cl) > 1_000_000) {
    return c.json({ message: 'Request body too large (max 1MB)' }, 413)
  }
  await next()
})

// 모든 라우트에 선택 인증 적용 (Bearer 있으면 userId/role 저장)
app.use('*', authOptional)

// S-12: 보안 헤더 미들웨어 (HSTS, CSP, X-Frame-Options 등)
app.use('*', async (c, next) => {
  await next()
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.res.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://tennis-tournament.jplee.workers.dev; frame-ancestors 'none'"
  )
})

app.get('/health', (c) => c.json({ ok: true, app: c.env.APP_NAME || 'tennis-worker' }))

// 라우트 마운트 (기존 tennis_tournament 경로 유지)
app.route('/auth', authApi)
app.route('/tournaments', tournamentApi)
app.route('/participants', participantApi)
app.route('/teams', teamApi)
app.route('/groups', groupApi)
app.route('/group-assignments', groupAssignmentApi)
app.route('/matches', matchApi)
app.route('/match-results', matchResultApi)
app.route('/scoring-rules', scoringRuleApi)
app.route('/ranking-snapshots', rankingSnapshotApi)
app.route('/registration-requests', registrationRequestApi)

// 루트
app.get('/', (c) => c.json({ name: 'tennis-tournament', status: 'ok' }))

// 404
app.notFound((c) => c.json({ message: 'Not found' }, 404))

// 전역 에러 핸들러 — 의도된 HTTP 에러만 클라이언트 노출, 내부 에러는 숨김
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  if (err instanceof HTTPException) {
    return c.json({ message: err.message }, err.status)
  }
  return c.json({ message: 'Internal server error' }, 500)
})

// WebSocket 업그레이드는 Hono 밖에서 처리 (WebSocket은 직렬화 불가능)
async function handleWebSocketUpgrade(request: Request, env: any): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/ws')) return null

  // WebSocket 인증: ?token= 쿼리파라미터 또는 Authorization 헤더
  const token = url.searchParams.get('token')
    || request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) {
    return new Response('WebSocket authentication required', { status: 401 })
  }
  const secret = jwtSecret(env)
  const payload = await verifyJwt(token, secret)
  if (!payload) {
    return new Response('Invalid or expired token', { status: 401 })
  }

  // S-17: 구독 범위 제한 — 요청한 대회의 참가자 또는 소유 운영자만 구독 허용
  const tournamentId = Number(url.searchParams.get('tournamentId')) || 0
  if (tournamentId > 0) {
    const db = getDb(env.DB)
    const allowed = await canAccessTournament(db, payload.sub, tournamentId)
    if (!allowed) {
      return new Response('Forbidden: not authorized to this tournament', { status: 403 })
    }
  }

  // DO의 fetch로 WebSocket 업그레이드 요청을 프록시
  // tournamentId가 없으면 기본 DO를 사용하고, 나중에 SUBSCRIBE 메시지로 구독
  const doId = env.MATCH_REALTIME.idFromName(String(tournamentId || 0))
  const stub = env.MATCH_REALTIME.get(doId)
  return stub.fetch(request)
}

// S-17: 특정 대회에 대한 구독 자격 판단 — 소유 운영자 또는 참가자면 true
async function canAccessTournament(db: DB, userId: number, tournamentId: number): Promise<boolean> {
  try {
    // 사용자 본인의 운영자 레코드 조회
    const [org] = await db.select().from(organizers).where(eq(organizers.userId, userId)).limit(1)
    if (org) {
      // 해당 대회의 소유 운영자면 허용
      const [t] = await db.select().from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), eq(tournaments.organizerId, org.id))).limit(1)
      if (t) return true
    }
    // 해당 대회의 참가자면 허용 (이메일 등 비직접 userId 매칭은 participants.userId 기준)
    const [p] = await db.select().from(participants)
      .where(and(eq(participants.tournamentId, tournamentId), eq(participants.userId, userId))).limit(1)
    return !!p
  } catch {
    return false
  }
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    // WebSocket 업그레이드 요청 먼저 처리
    const wsResponse = await handleWebSocketUpgrade(request, env)
    if (wsResponse) return wsResponse
    // 나머지는 Hono로 처리
    return app.fetch(request, env, ctx)
  }
}
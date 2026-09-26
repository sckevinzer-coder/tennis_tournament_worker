// 테니스 대회 관리 — Cloudflare Workers 진입점 (Hono + Drizzle + D1)
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { jwtSecret, verifyJwt } from './lib/auth'
import { getDb } from './db/client'
import { isTokenRevoked } from './lib/tokenRevocation'
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
import { meApi } from './routes/me'
import { pushApi } from './routes/push'
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
  'http://127.0.0.1:5173',
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
    "default-src 'self'; script-src 'self' https://dapi.kakao.com https://t1.daumcdn.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.daumcdn.net https://*.kakao.com; connect-src 'self' https://tennis-tournament.jplee.workers.dev https://*.daumcdn.net https://*.kakao.com; frame-src 'self' https://*.daumcdn.net https://*.kakao.com; frame-ancestors 'none'"
  )
})

app.get('/health', (c) => c.json({ ok: true, app: c.env.APP_NAME || 'tennis-worker' }))

// Kakao Maps SDK는 일부 브라우저에서 공식 CDN 직접 로딩이 차단될 수 있으므로
// 공식 SDK 경로만 동일 출처로 중계한다. 클라이언트가 URL을 지정할 수 없다.
app.get('/map/kakao-sdk', async (c) => {
  const appKey = c.req.query('appkey') || ''
  if (!/^[a-zA-Z0-9]+$/.test(appKey)) {
    return c.json({ message: 'Invalid map key' }, 400)
  }
  // Step 29: 장소 키워드 검색용 services 라이브러리 전달 (값은 화이트리스트로 제한)
  const rawLibs = c.req.query('libraries') || ''
  const libraries = rawLibs.split(',').map((s) => s.trim()).filter((s) => /^[a-z]+$/.test(s)).slice(0, 5).join(',')
  const libsParam = libraries ? `&libraries=${encodeURIComponent(libraries)}` : ''
  let upstream: Response | null = null
  // Kakao CDN은 간헐적으로 Worker egress 요청을 거부할 수 있으므로 짧게 재시도한다.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const candidate = await fetch(
        `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false${libsParam}`,
        { headers: { Accept: 'application/javascript' } },
      )
      if (candidate.ok) {
        upstream = candidate
        break
      }
      if (candidate.status < 500 && candidate.status !== 429) break
    } catch {
      // 네트워크 오류는 한 번 더 시도한다.
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150))
  }
  if (!upstream) {
    return c.json({ message: 'Map SDK unavailable' }, 502)
  }
  const source = await upstream.text()
  // Kakao 로더가 자기 script.src에서 appkey를 추출하도록 같은 출처 경로를
  // 인식시키고, 자동 엔진 로딩은 autoload=false로 비활성화한다.
  // 클라이언트가 maps.load()를 호출하면 SDK가 공식 엔진 스크립트를
  // 순서대로 동적 삽입하므로 document.write 우회가 필요 없다.
  const proxiedSource = source.replace(
    '/\\/(beta-)?dapi\\.kakao\\.com\\/v2\\/maps\\/sdk\\.js\\b/',
    '/\\/map\\/kakao-sdk\\b/',
  )
  return new Response(proxiedSource, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

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
app.route('/me', meApi)
app.route('/push', pushApi)

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
  let payload = null
  try {
    const secret = jwtSecret(env)
    payload = await verifyJwt(token, secret)
  } catch {
    payload = null
  }
  if (!payload) {
    return new Response('Invalid or expired token', { status: 401 })
  }
  if (env.DB && await isTokenRevoked(getDb(env.DB), payload.jti)) {
    return new Response('Token has been revoked', { status: 401 })
  }

  // S-17: 구독 범위 — 인증된 사용자만 WS 연결·구독 허용.
  // 매치/대진표/순위는 공개 조회이므로 실시간 스코어 구독도 로그인 사용자에게 열림 (소유권/참가자격은
  // 쓰기 검증 S-06/S-07이 담당). 토큰 무효/만료는 위에서 401로 차단됨.
  const tournamentId = Number(url.searchParams.get('tournamentId')) || 0

  // DO의 fetch로 WebSocket 업그레이드 요청을 프록시
  // tournamentId가 없으면 기본 DO를 사용하고, 나중에 SUBSCRIBE 메시지로 구독
  const doId = env.MATCH_REALTIME.idFromName(String(tournamentId || 0))
  const stub = env.MATCH_REALTIME.get(doId)
  return stub.fetch(request)
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
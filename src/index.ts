// 테니스 대회 관리 — Cloudflare Workers 진입점 (Hono + Drizzle + D1)
import { Hono } from 'hono'
import { cors } from 'hono/cors'
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
import './routes/tournamentStandings'
import { DOStub } from './lib/realtime'
import { MatchRealtime } from './do/MatchRealtime'

export { MatchRealtime }
// 라우트 마운트 (기존 tennis_tournament 경로 유지)

const app = new Hono<AppEnv>()

// CORS — 프론트(localhost:5173)에서 접근 허용
app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Type'],
  credentials: true,
}))

// 모든 라우트에 선택 인증 적용 (Bearer 있으면 userId/role 저장)
app.use('*', authOptional)

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

// 전역 에러 핸들러
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ message: err.message || 'Internal server error' }, 500)
})

// WebSocket 업그레이드는 Hono 밖에서 처리 (WebSocket은 직렬화 불가능)
async function handleWebSocketUpgrade(request: Request, env: any): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/ws')) return null
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
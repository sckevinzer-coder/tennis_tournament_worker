// Worker -> Durable Object 브로드캐스트 헬퍼
import { MatchRealtime, MatchUpdatedPayload } from '../do/MatchRealtime'

export type DOStub = DurableObjectStub & {
  publish?: (payload: MatchUpdatedPayload) => void
  webSocketConnect?: (ws: WebSocket) => Promise<void>
}

export function getRealtimeDO(env: { MATCH_REALTIME: DurableObjectNamespace }) {
  return env.MATCH_REALTIME
}

export function publishMatchUpdate(
  env: { MATCH_REALTIME: DurableObjectNamespace },
  tournamentId: number,
  matchId: number,
  type: MatchUpdatedPayload['type'],
  data: Record<string, unknown>,
) {
  const id = env.MATCH_REALTIME.idFromName(String(tournamentId))
  const stub = env.MATCH_REALTIME.get(id) as DOStub
  console.log(`[publishMatchUpdate] tournamentId=${tournamentId}, matchId=${matchId}, type=${type}`)
  stub.publish?.({ tournamentId, matchId, type, data })
}


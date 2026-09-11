// cloudflare:workers types are global via @cloudflare/workers-types
// DurableObject, WebSocket, MessageEvent, etc. are global types

export interface MatchUpdatedPayload {
  tournamentId: number
  matchId: number
  type: 'score_updated' | 'match_completed' | 'bracket_updated'
  data: Record<string, unknown>
}

interface ConnInfo {
  ws: WebSocket
  subMatchIds: Set<string>
}

export class MatchRealtime {
  private connections: Map<string, ConnInfo> = new Map()
  private subscriptions: Map<string, Set<string>> = new Map()

  constructor(_state: any, _env: any) {}

  private send(ws: WebSocket, payload: object) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload))
    } catch {}
  }

  private handleMessage(connId: string, data: string) {
    let msg: { type?: string; tournamentId?: number; matchIds?: number[] } | null = null
    try { msg = JSON.parse(data) } catch { return }
    if (!msg || !msg.type) return
    const info = this.connections.get(connId)
    if (!info) return
    const ws = info.ws
    if (ws.readyState !== WebSocket.OPEN) return

    if (msg.type === 'SUBSCRIBE') {
      const tournamentId = Number(msg.tournamentId ?? 0)
      const matchIds = (msg.matchIds ?? []).map(Number).filter((n) => Number.isFinite(n))
      if (tournamentId > 0 && matchIds.length > 0) {
        const key = String(tournamentId)
        if (!this.subscriptions.has(key)) this.subscriptions.set(key, new Set())
        const set = this.subscriptions.get(key)!
        set.add(connId)
        matchIds.forEach((m) => info.subMatchIds.add(String(m)))
        this.send(ws, { type: 'SUBSCRIBED', tournamentId, matchIds })
      }
    } else if (msg.type === 'UNSUBSCRIBE') {
      const tournamentId = Number(msg.tournamentId ?? 0)
      if (tournamentId > 0) {
        const key = String(tournamentId)
        const set = this.subscriptions.get(key)
        if (set) { set.delete(connId); if (set.size === 0) this.subscriptions.delete(key) }
        this.send(ws, { type: 'UNSUBSCRIBED', tournamentId })
      }
    }
  }

  private handleNewConnection(ws: WebSocket, autoTournamentId?: number, autoMatchIds: number[] = []) {
    const connId = crypto.randomUUID()
    this.connections.set(connId, { ws, subMatchIds: new Set() })
    ws.accept()
    ws.addEventListener('message', (e: MessageEvent) => {
      if (ws.readyState !== WebSocket.OPEN) return
      const data = typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer)
      this.handleMessage(connId, data)
    })
    ws.addEventListener('close', () => this.onClose(connId))
    if (autoTournamentId && autoMatchIds.length > 0) {
      const key = String(autoTournamentId)
      if (!this.subscriptions.has(key)) this.subscriptions.set(key, new Set())
      const set = this.subscriptions.get(key)!
      set.add(connId)
      autoMatchIds.forEach((m) => {
        this.connections.get(connId)?.subMatchIds.add(String(m))
      })
      this.send(ws, { type: 'SUBSCRIBED', tournamentId: autoTournamentId, matchIds: autoMatchIds })
    }
  }

  private onClose(connId: string) {
    const info = this.connections.get(connId)
    if (info) {
      for (const key of info.subMatchIds) {
        const set = this.subscriptions.get(key)
        if (set) { set.delete(connId); if (set.size === 0) this.subscriptions.delete(key) }
      }
    }
    this.connections.delete(connId)
  }

  // WebSocket 업그레이드 핸들러 — DO의 fetch로 프록시
  async fetch(request: Request) {
    const url = new URL(request.url)
    console.log(`[MatchRealtime] fetch: ${request.method} ${url.pathname}`)
    // Internal publish endpoint (called by Worker via stub.fetch)
    if (url.pathname === '/__publish' && request.method === 'POST') {
      try {
        const body = await request.json()
        this.publish(body as MatchUpdatedPayload)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 })
      }
    }
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader === 'websocket') {
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      const tournamentId = Number(url.searchParams.get('tournamentId'))
      const matchIds = (url.searchParams.get('matchIds') || '').split(',').map(Number).filter((n) => Number.isFinite(n))
      this.handleNewConnection(server, tournamentId > 0 ? tournamentId : undefined, matchIds)
      return new Response(null, { status: 101, webSocket: client } as ResponseInit)
    }
    return new Response('MatchRealtime DO is running', { status: 200 })
  }

  publish(payload: MatchUpdatedPayload) {
    const key = String(payload.tournamentId)
    const connIds = this.subscriptions.get(key)
    console.log(`[MatchRealtime] publish: key=${key}, subscribers=${connIds?.size || 0}, totalConnections=${this.connections.size}`)
    if (!connIds || connIds.size === 0) return
    const body = JSON.stringify({ event: 'MATCH_UPDATED', ...payload })
    for (const connId of connIds) {
      const info = this.connections.get(connId)
      if (info && info.ws.readyState === WebSocket.OPEN) {
        try { info.ws.send(body) } catch {}
      }
    }
  }
}

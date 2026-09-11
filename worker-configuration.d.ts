interface Env {
  DB: D1Database
  MATCH_REALTIME: DurableObjectNamespace
  APP_NAME: string
  JWT_SECRET?: string
}

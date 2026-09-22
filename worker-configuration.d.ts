interface Env {
  DB: D1Database
  MATCH_REALTIME: DurableObjectNamespace
  APP_NAME: string
  JWT_SECRET?: string
  // 최고관리자 user id 목록 (콤마 구분) — wrangler secret으로만 설정 (예: "1,5")
  SUPERADMIN_IDS?: string
}

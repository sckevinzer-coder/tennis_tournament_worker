-- 0006: 로그아웃 토큰 무효화 목록 (Step 26.4 / S-11 잔여)
-- jti(JWT 고유 ID) 단위로 폐기된 토큰을 기록한다. 만료된 행은 로그아웃 시 함께 정리한다.
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  userId INTEGER,
  role TEXT,
  expiresAt INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expiresAt);

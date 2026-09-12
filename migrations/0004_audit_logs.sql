-- 0004: audit logs table (S-18)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER,
  action TEXT NOT NULL,
  targetType TEXT,
  targetId INTEGER,
  detail TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
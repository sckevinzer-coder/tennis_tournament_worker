CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
  participantId INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  tournamentId INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_push_participant ON push_subscriptions(participantId);
CREATE INDEX IF NOT EXISTS idx_push_tournament ON push_subscriptions(tournamentId);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(userId);

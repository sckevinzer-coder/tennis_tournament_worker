-- tennis tournament initial schema (D1 / SQLite)
-- same stack as stringing_history (Hono + Drizzle + D1)
-- ENUM -> TEXT, JSON -> TEXT (validated at app layer)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS organizers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  orgName TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT,
  scoringRule TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  maxParticipants INTEGER NOT NULL DEFAULT 16,
  description TEXT,
  organizerId INTEGER REFERENCES organizers(id) ON DELETE SET NULL,
  matchType TEXT NOT NULL DEFAULT 'singles',
  doublesMode TEXT NOT NULL DEFAULT 'random',
  gamesPerPlayer INTEGER DEFAULT 4,
  format TEXT NOT NULL DEFAULT 'tournament',
  location TEXT,
  entryFee TEXT,
  courts TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  tournamentId INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  userId INTEGER REFERENCES users(id) ON DELETE SET NULL,
  group_name TEXT,
  seedRank INTEGER,
  status TEXT NOT NULL DEFAULT 'registered',
  totalScore INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_participants_tournament ON participants(tournamentId);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  player1Id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  player2Id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournamentId);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  groupSize INTEGER,
  description TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_groups_tournament ON groups(tournamentId);

CREATE TABLE IF NOT EXISTS group_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  groupId INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  participantId INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  teamId INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  participant1Id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  participant2Id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'singles',
  participant3Id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  participant4Id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  teamAId INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  teamBId INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  score1 INTEGER NOT NULL DEFAULT 0,
  score2 INTEGER NOT NULL DEFAULT 0,
  sets TEXT,
  round TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'group',
  status TEXT NOT NULL DEFAULT 'scheduled',
  winnerId INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  court TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournamentId);
CREATE TABLE IF NOT EXISTS match_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matchId INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  participant1Score INTEGER NOT NULL DEFAULT 0,
  participant2Score INTEGER NOT NULL DEFAULT 0,
  sets TEXT,
  winnerId INTEGER,
  isCompleted INTEGER NOT NULL DEFAULT 0,
  submittedBy TEXT,
  isConfirmed INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_match_results_match ON match_results(matchId);

CREATE TABLE IF NOT EXISTS registration_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  participantName TEXT NOT NULL,
  memberNames TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_regrequests_tournament ON registration_requests(tournamentId);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scoring_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournamentId INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  tiebreakTrigger INTEGER DEFAULT 6,
  tiebreakPoints INTEGER DEFAULT 7,
  pointsForWin INTEGER DEFAULT 1,
  pointsForLoss INTEGER DEFAULT 0,
  isDefault INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participantId INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  tournamentId INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  totalPoints INTEGER NOT NULL DEFAULT 0,
  matchesPlayed INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ga_group ON group_assignments(groupId);
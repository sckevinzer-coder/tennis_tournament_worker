// 테니스 대회 관리 — Drizzle 스키마 (D1/SQLite)
// migrations/0000_init.sql과 1:1 대응. ENUM은 앱 레벨 검증.
import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: text('role').notNull().default('user'), // 'user' | 'organizer'
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
})

export const organizers = sqliteTable('organizers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('userId').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  orgName: text('orgName'),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
})

export const tournaments = sqliteTable('tournaments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  startDate: text('startDate').notNull(),
  endDate: text('endDate'),
  scoringRule: text('scoringRule'), // JSON text
  status: text('status').notNull().default('draft'),
  maxParticipants: integer('maxParticipants').notNull().default(16),
  description: text('description'),
  organizerId: integer('organizerId').references(() => organizers.id, { onDelete: 'set null' }),
  matchType: text('matchType').notNull().default('singles'),
  doublesMode: text('doublesMode').notNull().default('random'),
  gamesPerPlayer: integer('gamesPerPlayer').default(4),
  format: text('format').notNull().default('tournament'),
  location: text('location'),
  entryFee: text('entryFee'),
  courts: text('courts'), // JSON text (string array)
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
})

export const participants = sqliteTable('participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  tournamentId: integer('tournamentId').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  userId: integer('userId').references(() => users.id, { onDelete: 'set null' }),
  groupName: text('group_name'),
  seedRank: integer('seedRank'),
  status: text('status').notNull().default('registered'),
  totalScore: integer('totalScore').notNull().default(0),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
}, (t) => ({
  tournamentIdx: index('idx_participants_tournament').on(t.tournamentId),
}))

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournamentId').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  player1Id: integer('player1Id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  player2Id: integer('player2Id').references(() => participants.id, { onDelete: 'set null' }),
  seedRank: integer('seedRank'),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
}, (t) => ({
  tournamentIdx: index('idx_teams_tournament').on(t.tournamentId),
}))

export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournamentId').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  groupSize: integer('groupSize'),
  description: text('description'),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
}, (t) => ({
  tournamentIdx: index('idx_groups_tournament').on(t.tournamentId),
}))

export const groupAssignments = sqliteTable('group_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: integer('groupId').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  participantId: integer('participantId').references(() => participants.id, { onDelete: 'cascade' }),
  teamId: integer('teamId').references(() => teams.id, { onDelete: 'cascade' }),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
}, (t) => ({
  groupIdx: index('idx_ga_group').on(t.groupId),
}))

export const matches = sqliteTable('matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournamentId').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  participant1Id: integer('participant1Id').references(() => participants.id, { onDelete: 'set null' }),
  participant2Id: integer('participant2Id').references(() => participants.id, { onDelete: 'set null' }),
  type: text('type').notNull().default('singles'),
  participant3Id: integer('participant3Id').references(() => participants.id, { onDelete: 'set null' }),
  participant4Id: integer('participant4Id').references(() => participants.id, { onDelete: 'set null' }),
  teamAId: integer('teamAId').references(() => teams.id, { onDelete: 'set null' }),
  teamBId: integer('teamBId').references(() => teams.id, { onDelete: 'set null' }),
  score1: integer('score1').notNull().default(0),
  score2: integer('score2').notNull().default(0),
  sets: text('sets'),
  round: text('round').notNull(),
  stage: text('stage').notNull().default('group'),
  status: text('status').notNull().default('scheduled'),
  winnerId: integer('winnerId').references(() => participants.id, { onDelete: 'set null' }),
  court: text('court'),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
}, (t) => ({
  tournamentIdx: index('idx_matches_tournament').on(t.tournamentId),
}))

export const matchResults = sqliteTable('match_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  matchId: integer('matchId').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  participant1Score: integer('participant1Score').notNull().default(0),
  participant2Score: integer('participant2Score').notNull().default(0),
  sets: text('sets'),
  winnerId: integer('winnerId'),
  isCompleted: integer('isCompleted').notNull().default(0),
  submittedBy: text('submittedBy'),
  isConfirmed: integer('isConfirmed').notNull().default(0),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
}, (t) => ({
  matchIdx: index('idx_match_results_match').on(t.matchId),
}))

export const registrationRequests = sqliteTable('registration_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournamentId').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  participantName: text('participantName').notNull(),
  memberNames: text('memberNames'),
  status: text('status').notNull().default('pending'),
  notes: text('notes'),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
}, (t) => ({
  tournamentIdx: index('idx_regrequests_tournament').on(t.tournamentId),
}))

export const notices = sqliteTable('notices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournamentId').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content'),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
})

export const scoringRules = sqliteTable('scoring_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournamentId').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name'),
  description: text('description'),
  tiebreakTrigger: integer('tiebreakTrigger').default(6),
  tiebreakPoints: integer('tiebreakPoints').default(7),
  pointsForWin: integer('pointsForWin').default(1),
  pointsForDraw: integer('pointsForDraw').default(1),
  pointsForLoss: integer('pointsForLoss').default(0),
  isDefault: integer('isDefault').notNull().default(0),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
})

// S-18: 감사 로그 테이블
// 주요 변경 작업(대회 생성/수정/삭제, 경기 확정, 참가 신청 승인/거절) 이력 기록
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('userId'),
  action: text('action').notNull(), // 'tournament.create', 'match.confirm', 'registration.approve' 등
  targetType: text('targetType'), // 'tournament', 'match', 'participant', 'registration'
  targetId: integer('targetId'),
  detail: text('detail'), // JSON text (변경 내용 요약)
  createdAt: text('createdAt').notNull().default("datetime('now')"),
})

export const rankingSnapshots = sqliteTable('ranking_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  participantId: integer('participantId').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  tournamentId: integer('tournamentId').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  rank: integer('rank').notNull(),
  totalPoints: integer('totalPoints').notNull().default(0),
  matchesPlayed: integer('matchesPlayed').notNull().default(0),
  createdAt: text('createdAt').notNull().default("datetime('now')"),
  updatedAt: text('updatedAt').notNull().default("datetime('now')"),
})

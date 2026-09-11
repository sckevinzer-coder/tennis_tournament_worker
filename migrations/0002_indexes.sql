-- 0002: 쿼리 최적화 인덱스
-- - 복합: 대회별 스테이지 조회 (브래킷/조별 분리)
CREATE INDEX IF NOT EXISTS idx_matches_tournament_stage ON matches(tournamentId, stage);
-- - 팀 역방향 조회 (배정→팀 일괄 조회 시 inArray 이전 필터링 용도)
CREATE INDEX IF NOT EXISTS idx_ga_team ON group_assignments(teamId);
-- - 승자 조회 (완료 경기 통계)
CREATE INDEX IF NOT EXISTS idx_matches_winner ON matches(winnerId);

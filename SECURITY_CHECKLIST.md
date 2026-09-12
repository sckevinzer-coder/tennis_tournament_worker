# 보안 취약점 점검 체크리스트 (KISA 주요정보통신기반시설 기준)

> 기준: KISA 주요정보통신기반시설 기술적 취약점 분석·평가 기준 → 애플리케이션 계층에 매핑
> 대상: tennis-tournament Worker (Hono + Drizzle + D1 + Durable Object)
> 작성일: 2026-09-12

## 진행 현황

| ID | 항목 | 등급 | 상태 | 비고 |
|----|------|------|------|------|
| S-01 | JWT 하드코딩 fallback 제거 | P0 | 완료 | lib/auth.ts fail-fast, 시크릿 운영 중 |
| S-02 | CORS allowlist | P1 | 완료 | 프로덕션 도메인 포함 |
| S-03 | WebSocket 인증 (/ws JWT 필수) | P1 | 완료 | 무토큰 401, 프론트 토큰가드 |
| S-04 | 에러 메시지 은닉 | P2 | 완료 | onError generic 500 |
| S-05 | 대회 생성 입력 검증 | P2 | 완료 | 화이트리스트 검증 |
| S-06 | 대회 소유자 검증 (IDOR) | P0 | 완료 | ownership.ts 헬퍼, 7개 엔드포인트 적용 + curl 검증(403/200) |
| S-07 | 무인증 쓰기 API 인증 추가 | P0 | 완료 | 8개 파일 20개 엔드포인트에 organizer 가드 (curl 401/200 검증) |
| S-08 | 스코어 입력 submittedBy 변조 방지 | P1 | 완료 | matches.ts PUT에서 organizer 경로 토큰 검증 (curl 401/200 검증) |
| S-09 | 비밀번호 정책 강화 (8자+) | P2 | 완료 | 8자 이상 + 72자 이하 제한 (curl 400/201 검증) |
| S-10 | 로그인 rate limit | P2 | 완료 | IP당 10회/분, 초과 시 429 (curl 401→429 검증) |
| S-11 | JWT TTL 단축 + 로그아웃 | P2 | 완료(단축) | 7일→24시간 (curl 24h 검증). 로그아웃 API는 미구현 |
| S-12 | 보안 헤더 미들웨어 | P3 | 미조치 | HSTS/CSP/X-Frame 등 |
| S-13 | 대량조회 페이징 | P3 | 미조치 | participants/matches 등 |
| S-14 | 요청 본문 크기 제한 | P3 | 미조치 | c.req.json() 무제한 |
| S-15 | 저장형 XSS 서버측 필터 | P3 | 미조치 | 공지/이름 길이·태그 필터 |
| S-16 | ID 경계값 검증 | P3 | 미조치 | NaN/음수/초대형 |
| S-17 | WS 구독 범위 제한 | P3 | 미조치 | 대회별 참가자격 미검증 |
| S-18 | 감사 로그 | P3 | 미조치 | 변경 이력 기록 없음 |

## 상세: S-06 소유자 검증 대상

- PUT /tournaments/:id (tournaments.ts:107)
- DELETE /tournaments/:id (tournaments.ts:126)
- POST /tournaments/:id/generate-matches (tournamentMatches.ts:9)
- DELETE /tournaments/:id/matches (tournamentMatches.ts:120)
- POST /tournaments/:id/generate-bracket (tournamentStandings.ts:79)
- POST /tournaments/:id/notices (tournamentNotices.ts:23)
- DELETE /tournaments/notices/:id (tournamentNotices.ts:40) — 부모 대회 소유자 확인 필요

공통 헬퍼: requireTournamentOwner(c, db, tournamentId) → 요청자 org.id vs tournaments.organizerId 비교, 불일치 시 403.

## 상세: S-07 무인증 쓰기 API 목록

| 라우트 파일 | 무인증 쓰기 엔드포인트 |
|---|---|
| groups.ts | POST /groups, PUT/DELETE /groups/:id |
| groupAssignments.ts | POST /group-assignments/run |
| groupAssignmentCrud.ts | POST/PUT/DELETE /group-assignments |
| teams.ts | POST/PUT/DELETE /teams |
| participants.ts | PUT/DELETE /participants/:id (POST는 비회원 플로우라 유지 검토) |
| matchResults.ts | POST/PUT/DELETE /match-results |
| scoringRules.ts | POST/PUT/DELETE /scoring-rules |
| rankingSnapshots.ts | POST/PUT/DELETE /ranking-snapshots |
| registrationRequests.ts | approve/reject/delete는 인증 있음 (POST 신청은 비회원 허용 → 유지) |

원칙: 쓰기(POST/PUT/DELETE)는 requireOrganizer 필수. 단, 참가신청 POST·참가자 POST는 비회원 플로우이므로 제외.

## 상세: S-08 스코어 입력 인가

PUT /matches/:id (matches.ts:39-84) — body.submittedBy가 organizer일 때 c.get(role)이 organizer인지 검증 추가. 참가자 제출(participant1/2)은 현행 유지.

## 검증 방법 (각 항목 완료 시)

1. npx tsc --noEmit 통과
2. curl 검증: S-06는 organizer B 토큰으로 A 대회 PUT → 403 기대 / S-07은 무토큰 POST /groups → 401 기대 / S-08은 무토큰 + submittedBy:organizer PUT /matches/:id → 401 기대
3. wrangler deploy 후 E2E (로그인→대회생성→조편성→매치생성→스코어→리셋) 정상 확인
4. 본 문서 상태 미조치→완료 갱신 + 커밋

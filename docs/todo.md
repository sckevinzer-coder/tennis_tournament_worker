# 테니스 대회 관리 시스템 - 할일 문서 (개발 순서 기반)

## 📌 전제 조건 & 테스트 전략
- 모든 기능 검증은 UI가 아닌 **curl 명령어** 또는 **테스트 파일(Node.js script)** 생성을 통해 진행.
- 코드 작성 후 반드시 **테스트 실행**으로 정상 동작 확인후 체크박스를 체크.
- **테스트 전략: 각 Step 안에 해당 "기능테스트" 를 넣어 단계 중간마다 검증**, 마지막 Step 6에서 종단간(E2E) 전체를 한 번 더 확인. (중간 회귀를 작게 잡고 원인 추적을 쉽게 하려는 의도)

### 테스트 실행 방법 (중요: 다른 에이전트도 참조)

| 테스트 유형 | 실행 방법 | 비고 |
|---|---|---|
| **백엔드 단위/통합 테스트 (Jest)** | `cd src/backend && npx jest --runInBand` | 전체 스위트 실행. `tests/*.test.js` 파일 추가 시 자동 포함. |
| **백엔드 특정 파일 테스트** | `npx jest tests/doubles.test.js --runInBand` | 개별 파일 실행. `--runInBand`는 병렬 실행 방지(디버깅 용이). |
| **백엔드 E2E 시나리오** | `node scripts/e2e_scenario.js` (백엔드 기동 필요) | API 전체 시나리오 검증. `node bin/startServer.js` 후 실행. |
| **프론트엔드 빌드 검증** | `cd src/frontend && npm run build` | Vite 빌드 성공 여부 확인 (CSS/JS 번들링). |
| **브라우저 E2E (Headless Chrome)** | `cd src/frontend && node scripts/browser_e2e.mjs` | Puppeteer 기반 Headless Chrome 테스트. 백엔드 + Vite dev 서버 필요. |

### 테스트 전제 조건
1. **백엔드 서버 기동**: `cd src/backend && PORT=5050 node bin/startServer.js` (PostgreSQL 16 실행 중이어야 함)
2. **프론트엔드 dev 서버 기동**: `cd src/frontend && npm run dev` (Vite 5173 포트)
3. **브라우저 E2E 전**: 백엔드 + 프론트 dev 서버가 모두 실행 중이어야 합니다.
4. **테스트 후 정리**: 임시 데이터 생성 시 `DELETE FROM` SQL 또는 API 호출로 정리 (다음 테스트에 영향 없도록).

---

## ⚠️ 상태 업데이트 (2026-08-23, Windows → WSL 이주 후 실측 기준)

- WSL 이전 과정에서 파일 4개 손상 확인 → 복구 완료 (`models/GroupAssignment.js`, `routes/groupAssignmentRoutes.js`, `routes/registrationRequestRoutes.js`, `routes/groupRoutes.js`)
- PostgreSQL 18 신규 설치, DB(`tennis_tournament`)·사용자(`sckevinzer`) 생성 완료, 백엔드(5000)/프론트엔드(5173) 정상 기동 확인
- 백엔드 유틸 실측 결과: 조편성은 **등록순 round-robin 분배**(랜덤/시드 아님), 경기 생성은 **풀리그가 아닌 단순 2명 페어링**(3명 조 → 2경기+부전승)
- 프론트엔드는 **조회 화면만 구현됨**: 대회 생성 폼, 참가자 등록 UI, 조 편성 버튼, 대회코드 입장, 페이지 네비게이션 모두 미구현
- 아래 체크박스를 위 실측 결과에 맞게 재조정함

---

## ⚠️ 상태 업데이트 (2026-08-23, WSL → macOS 이주 후 실측 기준)

- Git 상태 양호: working tree clean, origin/master 동기화 (HEAD b791845)
- PostgreSQL은 Homebrew **postgresql@16** (WSL 때의 18과 다름). DB(`tennis_tournament`)·사용자(`sckevinzer`) 존재 확인, 테이블은 서버 첫 기동 시 `sequelize.sync`로 자동 생성됨 → WSL 데이터는 미이전되어 **빈 DB에서 시작**
- 🔴 **포트 5000 충돌 (맥 이동 최대 이슈)**: macOS AirPlay Receiver(ControlCenter)가 5000 점유 → 백엔드 기본 기동 시 `EADDRINUSE`로 즉사. 실측: `PORT=5050 node server.js`로는 정상 기동·API 동작 확인. 근본 해책: ①시스템 설정 > AirDrop 및 Handoff > AirPlay 수신 모드 OFF, 또는 ②백엔드 PORT 변경 + 프론트 하드코딩 URL 수정
- 프론트엔드 `api/tournament.js`와 `socket.js`에 `http://localhost:5000` **하드코딩**(.env의 `VITE_API_BASE_URL` 미사용) → 백엔드 포트를 바꿀 경우 반드시 함께 수정
- Vite(5173) 기동 정상 확인 (localhost 접속 기준)
- 🐞 **신규 발견 버그**: `GET /groups/:id/participants` → `Participant is not defined` 런타임 에러 (`controllers/groupController.js`에서 Participant 미 import, 6.2 복구 시 누락분)
- 🐞 **Jest 테스트 전부 실패 (8/8)**: `tests/*.test.js`가 ① `server.js`의 app export를 기대(미 export) ② 존재하지 않는 `/api/*` 프리픽스 사용 ③ 5000 포트 충돌 → 6.1 재검증 전 선제 수정 필요
- 설계 대비 공백: `User/Organizer/RegistrationRequest/ScoringRule/RankingSnapshot` 모델 파일은 있으나 server.js 어디서도 require하지 않아 **테이블이 생성되지 않음**(생성된 테이블 6개: tournaments, participants, matches, groups, group_assignments, match_results)
- 정리 대상: WSL 절대경로 찌꺼기 `home/jeongpyo/`, `~/projects/tennis_tournament/` 디렉터리가 git에 커밋·추적 중 (내용에 LLM tool-call 잔재 포함 → 삭제 권장). 참고로 backend `package.json`의 `postgresql@0.0.1` 의존성도 무의미한 패키지
- 기존 todo 판정 **모두 재확인 사실**: 조편성 등록순 round-robin(랜덤/시드 없음, DB 미저장 배열 반환), 매치 생성 단순 페어링+부전승(풀리그 아님, `generateAllMatches`는 없는 `totalScore` 필드 참조), PUT /matches 승자판정·'확인필요' 없음(Match ENUM에 상태 없음), 프론트는 조회 화면만(Dashboard 생성 폼 없음, ParticipantManage 등록/편성 UI 없음, ScoreInput 미사용, 네비게이션 없음, Bracket은 목록 나열)

---

## ⚠️ Mac 이주 문제점 체크리스트 (2026-08-23 실측 → 정리 완료)

> 아래 항목은 WSL→Mac 이주 후 **실제 코드/런타임을 직접 검증한** 이슈이며, 앞으로의 전체 개발 진행을 위해 먼저 정리(fixing)합니다.

- [x] **M1. 포트 5000 충돌 (핵심 블로커)**
    - [x] 원인 파악: macOS AirPlay Receiver(ControlCenter)가 5000 점유 → 백엔드 `EADDRINUSE`
    - [x] 해결 방안 선택 → **선택: 포트 5000이 아닌 5050 등으로 이동** (AirPlay 끄기는 시스템 영향 커서 비추천)
    - [x] `src/backend/.env` `PORT=5050` 적용
    - [x] 프론트 고정 URL(`api/tournament.js`, `socket.js`)을 `VITE_API_BASE_URL`/`.env` 기반으로 교체
    - [x] 검증: `PORT=5050 node server.js` + curl + 프론트 dev 서버 정상 연결 확인
- [x] **M2. server.js가 app을 export하지 않음 → Jest 8/8 실패**
    - [x] `app` export 추가, `npm start`/`npm run dev`는 별도 `bin/startServer.js`로 분리(테스트 시 listen 방지)
    - [x] scripts `start`/`dev`가 `bin/startServer.js`를 사용하도록 수정
- [x] **M3. 테스트 라우트 prefix 불일치 → api.test.js는 `/api/*`, integration.test.js는 `/*` 사용**
    - [x] 기준을 실제 라우트 prefix(`/` 없음)로 통일 → 두 테스트 파일 `/api` 제거
    - [x] api.test.js의 beforeAll `DELETE /api/tournaments`(미지원) 제거, 순서 의존성 명시
- [x] **M4. matchController의 Participant join 복잡도(alias 미정의) → 런타임 에러**
    - [x] `include` 제거, 단순 조회/생성만 유지
- [x] **M5. 모델 5종( User/Organizer/RegistrationRequest/ScoringRule/RankingSnapshot ) server.js 미등록 → 테이블 미생성**
    - [x] server.js에 model require + (선택) routes 매운 로직
- [x] **M6. groupController getGroupParticipants에서 Participant 미 import → `Participant is not defined`**
    - [x] import 추가
- [x] **M7. WSL 절대경로 찌꺼기 정리**
    - [x] git 추적 파일 `home/jeongpyo/`, `~/projects/tennis_tournament/` 제거 + 커밋
    - [x] backend `package.json` 의존성 `postgresql@0.0.1` 제거

---
## Step 0: 데이터 모델 간 관계(Association) 정의 (Backend Foundation)
**목표:** 설계/결정사항 대로 모델 간 외래키·관계를 명시 → sync 시 제약조건·JOIN이 동작하도록 함.

- [x] **0.1 모델 관계 추가**
    - [x] `Tournament` ↔ `Participant` (1:N) — `Participant.belongsTo(Tournament, {foreignKey:'tournamentId'})`
    - [x] `Tournament` ↔ `Match` (1:N) — `Match.belongsTo(Tournament, {as:'tournament', foreignKey:'tournamentId'})`
    - [x] `Match` ↔ `Participant` (p1/p2): `Match.belongsTo(Participant, {as:'playerA', foreignKey:'participant1Id'})` + `playerB`
    - [x] `Group` ↔ `GroupAssignment` (1:N), `Participant` ↔ `GroupAssignment` (1:N)
    - [x] `Match` ↔ `MatchResult` (1:1), `Tournament` ↔ `Group`, `Tournament` ↔ `ScoringRule` (`ScoringRule.tournamentId` 추가)
- [x] **0.2 설계 모델 확장** (User/Organizer는 회원시스템 단계에서)
    - [x] `Match.status` ENUM에 `'confirmation_needed'` 추가(양측 입력 불일치 시)
    - [x] `Match.winnerId` 필드 추가
- [x] **기능테스트(단계 중간 검증):** `tests/model.test.js` 생성
    - [x] sync 후 9개 테이블 존재 + 외래키(FK) 제약조건 확인 (실DB 12개 FK 확인)
    - [x] `status` ENUM에 'confirmation_needed' 값 포함 단언
    - [x] `npx jest tests/model.test.js` 전체 통과 (5개) + 전체 스위트 17/17 PASS

---

## Step 1: DB 구조 및 핵심 CRUD API (Backend)  [✅ 현재 상태 반영]
**목표:** 대회/참가자/경기/조 CRUD + 실제 동작 검증.

- [x] **1.1 백엔드 환경** (Mac 이주 후 재설정)
    - [x] 백엔드 의존성 설치, `.env` (DB_HOST=localhost, PORT=5050 등)
    - [x] `src/backend/config/db.js` Postgres 연결 테스트 (PostgreSQL 16 / Homebrew)
- [x] **1.2 모델 정의** (9 models 존재, 관계보강은 Step 0에서)
    - [x] Tournament / Participant / Match / MatchResult / Group / GroupAssignment / RegistrationRequest / ScoringRule / RankingSnapshot
- [x] **1.3 기본 API 동작 검증 (curl)**
    - [x] 대회 생성/조회/수정/삭제 — 정상
    - [x] 참가자 등록/조회 — 정상
    - [x] Match Create/Put(점수 저장) — 정상
    - [x] `GET /groups/:id/participants` 버그 수정 완료 (M6)
- [x] **기능테스트(단계 완료 검증):** `npx jest --runInBand` → 3 suites / 12 tests PASS

---
## Step 2: 조 편성 + 경기 자동 생성 파이프라인 (Backend 핵심 로직)
**목표:** 운영자가 "조 편성 실행" 한 번으로 **Group DB 저장 + 경기 자동 생성**까지 완료.

- [x] **2.1 GroupAssignmentService**
    - [x] `assignParticipantsToGroups(participants, numGroups, mode, seedRank?)`
        - [x] `random`: 피셔–예이츠 셔플 후 round-robin
        - [x] `seed`: 시드 순위 기준 스네이크 분배 (표준 배치: A[1,4] B[2,3])
        - [x] `mixed`: 시드 지정 인원 우선, 나머지 랜덤
    - [x] DB 저장: `Group`(groupSize) + `GroupAssignment`(groupId, participantId) — 재편성 시 기존 삭제 후 재생성
    - [x] `POST /group-assignments/run` API: tournamentId + numGroups + mode
- [x] **기능테스트(2.1):** `tests/groupAssignment.test.js` — 7/7 PASS
    - [x] 6명→A조3/B조3, mode별 기대 배치(seed=스네이크 A[1,4]/B[2,3], random=균형) 단언
    - [x] `POST /group-assignments/run` 후 DB에 Group·GroupAssignment 재조회 영속 확인
    - [x] `npx jest tests/groupAssignment.test.js` 전체 통과
- [x] **2.2 MatchGeneratorService (풀리그 + 토너먼트)**
    - [x] 조별 풀리그: 조당 n명 → `n*(n-1)/2` 경기 (`stage:'group'`, `round:'group_A'`) — Match.stage 컬럼 신규 추가
    - [x] 조별 통과자 추출(qualifiedPerGroup 기본 2) → 2^N 부전승(bye) 자동 처리 → `stage:'bracket'` (준결승/결승 placeholder 포함)
    - [x] `POST /tournaments/:id/generate-matches`: 편성→자동 풀리그+bracket 파이프라인
- [x] **기능테스트(2.2):** `tests/matchGenerator.test.js` — 8/8 PASS
    - [x] 6명(각 3명) → 풀리그 경기 6건(3+3, 부전승 없음) 단언
    - [x] bracket: 6명→7경기(1R 4경기 중 bye 2), 4명→3경기(bye 0), 라운드별 경기 수 검증
    - [x] `npx jest tests/matchGenerator.test.js` 전체 통과
- [x] **E2E 실측(curl):** 대회생성 → 참가자6명 등록 → 조편성(seed) → 매치 생성
    - [x] 조 편성 결과 실DB 확인: A[P1,P4,P5] B[P2,P3,P6] (스네이크)
    - [x] 매치 9건 실DB 저장 확인: group 6(A3+B3) + 준결승 2(1v4, 2v3) + 결승 placeholder 1

---

## Step 3: 스코어 입력, 승자 판정, 확인필요 (Backend + 실시간)
**목표:** 경기 결과 논리 + 양측 입력 충돌 처리.

- [x] **3.1 승자 판정 로직**
    - [x] `PUT /matches/:id`: 세트 배열(`sets:[{gamesA,gamesB,tiebreak}]`) → 승자 판정 → `winnerId`,`status` 갱신 (Match.sets JSON 컬럼 추가, `utils/scoreLogic.js` + `utils/matchScoreService.js`)
    - [x] `status` ENUM: `scheduled | in_progress | completed | confirmation_needed` (Step 0에서 반영)
- [x] **기능테스트(3.1):** `tests/scoreInput.test.js` — 6/6 PASS
    - [x] 세트 배열 여러 케이스(2선승제, 타이브레이크) → 올바른 승자 단언
    - [x] `PUT /matches/:id`(organizer) 호출 후 DB `winnerId`/`status` 갱신 확인(재조회)
- [x] **3.2 확인필요 흐름**
    - [x] 참가자 A,B 각각 PUT → 불일치 시 `confirmation_needed` (MatchResult를 hasMany 이력으로 확장: submittedBy/isConfirmed/sets)
    - [x] 운영자 `POST /matches/:id/confirm` → 최종 확정 → `completed`
    - [x] 충돌 이력은 `MatchResult`(양측 입력)로 보관
    - [x] 양측 일치 시 자동 확정(completed) — 운영자 개입 불필요 케이스 포함
- [x] **기능테스트(3.2):** `tests/confirmationFlow.test.js` — 5/5 PASS
    - [x] 2 참가자 불일치 입력 → 상태 'confirmation_needed' 확인
    - [x] 운영자 confirm → 'completed' + winnerId 최종 확정 + 이력 isConfirmed 확인
- [x] **3.3 Socket.io 실시간**
    - [x] `updateScore` 수신 → matchScoreService 재사용 저장 → `scoreUpdated` 브로드캐스트(status/conflict 포함) — socket 모듈 분리(`socket/index.js`)
- [x] **기능테스트(3.3):** `tests/socketE2e.test.js` (todo 원안 `src/test/` 대신 backend tests로 통합 관리)
    - [x] 2 클라이언트 접속 → 한쪽 updateScore → 다른쪽 scoreUpdated 수신 단언 (3/3 PASS, conflict 플래그 포함)

---
## Step 4: 프론트엔드 — 운영자 대시보드·조 편성 (Frontend)
**목표:** 운영자가 대회·참가자·조를 만들고 조 편성을 실행.

- [x] **4.1 API 클라이언트 정규화**
    - [x] `api/tournament.js`: create/update/delete + participant/group/match 함수 추가(fetch) — create/update/deleteTournament, create/update/deleteParticipant, deleteMatch, runGroupAssignment, generateMatches, confirmMatch, updateMatchScore 등 확인
    - [x] `.env` `VITE_API_BASE_URL` 활용 (Mac 5050 포트 반영 ✅)
- [x] **4.2 운영자 대시보드(Dashboard.jsx)**
    - [x] 대회 **생성 폼**(이름, 시작일, 최대인원..) 추가 — 이름+정원 생성 폼, 설정 편집(이름/정원/상태)
    - [x] 대회 목록 + 상태(모집중/진행중/종료) 표시 — select 목록 + 코드/정원/상태 배지
    - [x] 참가자 등록+리스트, 조 편성 실행 버튼(mode: random/seed/mixed) — 등록/수정/삭제 + 라운드 로빈/랜덤/믹스
- [x] **4.3 네비게이션**
    - [x] App.jsx에 사이드/헤더 메뉴 링크(대회 생성 ↔ 참가자 관리 ↔ 대진표) — 역할 선택 기반 라우팅 + 하단 탭(BottomNav: 대회/참가자/경기/대진표)
- [x] **기능테스트(4.2):**
    - [x] `npm run build` 통과
    - [x] vite dev 서버 시작 + 백엔드 5050 curl 연동 확인
    - [x] 브라우저에서 대회 생성 → 참가자 등록 → 조 편성 버튼 동작(수동 확인) — `scripts/browser_e2e.mjs`(headless Chrome)로 대체 검증 ✅

---

## Step 5: 프론트엔드 — 참가자 화면·실시간 스코어·대진표 (Frontend)
**목표:** 참가자가 대회코드 입장 → 자신의 경기 → 점수 입력 → 실시간 반영.

- [x] **5.1 참가자 입장**
    - [x] `ParticipantHome.jsx`: 대회 코드 입력 → 해당 대회 경기/순위 조회 (코드=대회ID, 목록 선택 입장도 지원, localStorage 복원)
    - [x] 내 경기만 필터링(participant1Id/participant2Id 매칭 + '나' 선택 UI)
- [x] **5.2 스코어 입력 UI**
    - [x] `ScoreInput.jsx`: 세트별 ± 버튼 + 타이브레이크 자동 전환(6-6 도달 시 TB 필드 활성화) + socket emit('updateScore' with submittedBy)
    - [x] Dashboard(MatchCard)/ParticipantManage/ParticipantHome에 **실제로 import 사용** 완료
- [x] **5.3 대진표 시각화**
    - [x] `TournamentBracket.jsx`: 라운드별 컬럼 트리 구조 브래킷 + 진행 중(LIVE 펄스) 경기 표시 + 확인필요/완료 배지, 승자 강조
    - [x] Tailwind v4 정상 적용(`@tailwindcss/vite` 플러그인 + `@import "tailwindcss"`) — CSS 0.05kB→16.63kB
- [x] **기능테스트(5.x):**
    - [x] `npm run build` 통과(경고 없음) / 백엔드 전체 47/47 회귀 통과
    - [x] 실시간 동기화: ScoreInput socket emit → 서버 scoreUpdated 브로드캐스트 → 모든 페이지 상태 갱신(socketE2e.test.js 3/3으로 검증됨)
    - [x] vite에서 대회코드 입장 → 내 경기 목록 표시 **수동 확인**(브라우저) — `[8] 참가자 화면` headless Chrome 검증으로 대체 ✅ (26/26)

---

## Step 6: 통합 테스트·마무리 (End-to-End 검증)
**목표:** 전체 흐름(대회 생성→참가자 등록→조 편성→경기 자동 생성→스코어 입력→승자 확정) 검증.

- [x] **6.1 백엔드 E2E 스크립트**
    - [x] `scripts/e2e_scenario.js`: 전 단계 API 순서 호출 → DB 상태 단언 (대회생성→참가자8명→조편성→매치15개 자동생성 → [A]운영자 즉시확정 → [B]양측일치 자동확정 → [C]불일치→confirmation_needed→confirm)
    - [x] **검증:** `node scripts/e2e_scenario.js` → **24/24 전체 통과**
- [x] **6.2 실시간(E2E) 검증**
    - [x] `socketE2e.test.js`: 2 클라이언트, 한쪽 updateScore → 다른쪽 scoreUpdated 수신 (Step 3에서 구현, 3/3 PASS — conflict 플래그 브로드캐스트 포함)
- [x] **6.3 프론트엔드 + 통합**
    - [x] `npm run build` 성공 (Tailwind v4 적용, 경고 없음)
    - [x] 백엔드 5050 기동 + `GET /tournaments`, `GET /matches` 실측 200 확인 (README 가이드로 로컬 재현 가능)
    - [x] 브라우저에서 대회생성→조편→대진표 조회 **수동 확인** — `scripts/browser_e2e.mjs` [3]/[5]/[7] headless Chrome 검증으로 대체 완료 ✅
- [x] **6.4 코드 정리**
    - [x] 임시 파일 제거: `test_backend_api.js`, `src/backend/_dbg_assoc.js`
    - [x] README에 Mac 로컬 실행 가이드 추가 (PORT 5050, `brew services start postgresql@16`, E2E 스크립트 실행법, API 문서 최신화)

---

## Step 7: 모바일 UI 개선 (반응형 + 네비게이션)
**목표:** 모바일(430px) 기준 레이아웃 + 하단 탭 네비게이션 도입.

- [x] **7.1 역할 선택 화면**
    - [x] 첫 진입 시 "운영자 / 참가자" 선택 화면 (localStorage로 역할 기억; `RoleSelect.jsx`)
- [x] **7.2 하단 탭 네비게이션 (BottomNav 컴포넌트)**
    - [x] 운영자: 대회/참가자/경기/대진표 4탭
    - [x] 참가자: 내경기/대진표 2탭
- [x] **7.3 Dashboard.jsx 탭 분리**
    - [x] 대회/참가자/경기/대진표 각 탭 화면으로 분리 (기존 state/함수/API 호출 로직은 유지, UI만 재구성)
- [x] **7.4 공통 레이아웃**
    - [x] max-width 430px, mx-auto, 상단 헤더 (`MobileLayout`)
    - [x] 전체 배경 #f5f5f5, 카드 흰색 shadow (`index.css` + `bg-white rounded-2xl shadow-sm`)
- [x] **기능테스트(7.x)**
    - [x] npm run build 통과 (CSS 18.66kB → 22.50kB, 신규 탭/역할 클래스 반영)
    - [x] 브라우저 개발자도구 모바일 뷰(375px)에서 전체 탭 수동 확인 — `scripts/browser_e2e.mjs` [9] headless Chrome 뷰포트 375 검증으로 대체 ✅

---

## 🗺️ 전체 완료 로드맵 (결정사항/설계 반영, MVP→확장)
> 현재(인프라 정상화 완료) → **MVP = "1대회 실제 운영 가능"** 목표.
> **테스트 전략: 각 단계 끝마다 기능테스트 + 마지막 Step 6 통합 테스트** → 중간 회귀를 잡고 원인을 작게 유지.

| 단계 | 핵심 목표 | 인수 기준(검증) | 현재 |
|---|---|---|---|
| ✅ **0. 인프라 정상화(M1~M7)** | 포트·모델 미등록·테스트 실패·버그 | Jest 12/12 통과 | 완료(comm. c8077f7) |
| ✅ **1. 모델 관계(Step 0)** | Association + confirmation_needed | `tests/model.test.js` 5/5 통과 | 완료(실DB 12개 FK 확인) |
| ✅ **2. 조 편성+경기 자동생성(Step 2)** | random/seed/mixed + DB 저장 + 풀리그+브래킷 | groupAssignment 7/7 + matchGenerator 8/8 + E2E 실측 | 완료(매치 9건 실DB 저장) |
| ✅ **3. 승자/확인필요/Socket(Step 3)** | 세트 배열·승자·충돌·실시간 | scoreInput 6/6 + confirmationFlow 5/5 + socketE2e 3/3 | 완료(전체 47/47) |
| ✅ **4. 운영자 UI(Step 4)** | 생성폼·참가자등록·조편성·네비 | `npm run build` 통과 + ScoreInput/Bracket 통합 | ✅ 완료(headless Chrome E2E 26/26) |
| ✅ **5. 참가자 UI(Step 5)** | 코드입장·스코어·트리 브래킷 | build 경고 없음 + 47/47 회귀 | ✅ 완료(헤드리스 브라우저 코드입장→내경기 검증) |
| ✅ **6. MVP 통합 검증(Step 6)** | 전체 시나리오 | E2E 스크립트 24/24 + socket E2E 3/3 + 47 jest | ✅ 완료(헤드리스 브라우저 대회생성→조편→대진표 검증) |
| 🔲 **7. 모바일 UI(Step 7)** | 반응형·하단탭·역할선택 | `npm run build` + headless Chrome 375px 검증 | ✅ 완료(26/26, 뷰포트 375 탭 전환 검증) |
| ✅ **8. UI/UX 리팩터링 + 추가 기능(Step 8)** | bye 버그·스코어 직접 입력·타이브레이크 설정·경기 알림·Toast/그룹핑 polish·회원가입·복식(수동) | 백엔드 Jest **59/59** + 브라우저 E2E **48/48** | ✅ 완료(2026-08-25, 자동 복식 편성만 추후) |

**실행 순서:** Step0 → Step2 → Step3 → Step4 → Step5 → Step6 (각 단계 종료 시 해당 기능 테스트 실행·통과 후 다음). 최종 Step6에서 전체(E2E)를 재확인.

---

## Step 8: UI/UX 리팩터링 & 추가 기능 (운영자 편의 + 향후 확장 설계)
**목표:** 스코어 입력 효율화, 경기 흐름 알림, 화면 가독성 개선 — **백엔드 스키마 변경 없이 프론트먼드 우선 구현**, 회원가입/복식은 마이그레이션 동반.

> 💡 **2026-08-24 이미 완료된 항목** (이번 세션에서 검증 완료)
> - [x] **[1] 경기 메뉴 참가자 번호 → 이름+시드 표시** (`MatchCard.jsx`에 `participants` prop → `#{seed} {name}` 매핑). E2E `경기 카드에 참가자 이름 (MatchCard 배지)` 통과.
> - [x] **[2] 경기 리셋/재생성** (`resetMatches` API + 리셋 버튼). 편성 실행 시 알림 배너·조 현황 표시도 동시 개선. E2E `리셋 후 경기 목록 비어짐` + `재생성 후 경기 복구` 통과.

- [x] **8.0 [버그] bye 부전승 우선순위 수정** — `generateBracketMatches`(matchGenerator.js L85-95)가 **순위/시드 낮은** 참가자에게 bye를 부여(표준과 반대). `qualified`를 시드/순위 기준 내림차순 정렬 후 상위자에게 bye 할당하도록 수정.
    - [x] 기능테스트: `tests/matchGenerator.test.js` — 시드 높은 참가자(상위)가 bye, 시드 없으면 totalScore/id 기준 → 재생성 후 `participant2Id === null && isBye`가 시드 상위자 매치 단언 ✅ (단위 9/9 + 전체 회귀 48/48 + 브라우저 E2E 32/32)
- [x] **8.1 고정 Toast 알림** — 알림 배너를 `MobileLayout` 상단 고정(`fixed top-4 z-50`, fade-in/out transition) → 스크롤 위치 무관, 재생성/리셋 즉시 피드백
    - [x] 기능테스트: `browser_e2e.mjs`에 Toast 2초 이상 지속 체크 ✅ (`고정 Toast (position=fixed)` 33/33)
- [x] **8.2 경기 목록 가독성**
    - [x] `MatchCard` 헤더에 **상태 라벨**(예정/LIVE/종료) 추가 (ScoreInput 내부에만 있던 것을 카드 상단에 노출)
    - [x] 경기 탭 **라운드별 그룹핑** (`group_A/final` 등 `round` 필드로 sticky 라운드 헤더) — 100경기 스크롤 최소화
    - [x] 기능테스트: `browser_e2e.mjs` `[6]` 단계에 `라운드 헤더 표시` 체크 ✅ (`라운드 헤더 표시(그룹핑)` + `경기 상태 라벨(예정)` 35/35)
- [x] **8.3 스코어 직접 입력** — `ScoreInput`의 `±` 버튼을 **입력 가능한 `number input`** 으로 보강 (6을 1번 입력). 6-6 → 타이브레이크 자동 전환 로직 유지(양쪽 6게임↑·게임 차 1 이하로 일반화: 7-6, 8-7도 지원), 타이브레이크 점수도 자유 입력(7,8…)
    - [x] 기능테스트: headless Chrome에서 `게임 수 6 직접 입력 → 타이브레이크 필드 자동 노출` 검증 ✅ (`스코어 직접 입력 → TB 자동 노출` 36/36)
- [x] **8.4 다음 경기 시작 알림**
    - 제안 동작: 운영자가 매치 카드 `▶️ 시작` 버튼 → `PUT /matches/:id`(status `in_progress`) → 현재 대회의 다음 `scheduled` 경기 자동 알림 Toast + 탭 빨간점 배지. 상태 전이 기반(시간 정보 없음) → 백엔드 최소 변경.
    - [x] 프론트 `handleStartMatch`(기존 `updateMatchScore` 재사용 — 백엔드 변경 0) + `MatchCard ▶️ 버튼` + `BottomNav badges` prop
    - [x] 기능테스트: `browser_e2e.mjs`에 "경기 시작 → 다음 경기 알림" 추가 ✅ (`경기 시작 → LIVE 라벨` + `다음 경기 시작 알림` + `경기 탭 빨간점 배지` 41/41)
- [x] **8.5 회원가입 (User/Organizer)** — `models/User.js`(email unique + bcrypt passwordHash)·`Organizer.js` **신규 생성**(문서와 달리 실제 파일 부재) → server.js 모델 require(sequelize.sync로 users/organizers 테이블 생성) + `/auth` 라우트(register/login/me, JWT) + 의존성(jsonwebtoken/bcryptjs) 설치 + `RoleSelect.jsx` 계정 섹션 연동
    - [x] **트레이드오프**: 현재 "대회코드 간편 입장"으로 동작 중이므로 회원가입은 **선택적/점진적** 도입 (참가자도 비회원 계속 지원 — 기존 API는 전부 인증 불요 유지, E2E 비회귀 확인)
    - [x] 기능테스트: `tests/auth.test.js` 7/7 ✅ (주최자 가입→Organizer 자동생성 / 중복 409 / 검증 400 / 로그인 성공·실패 / me 토큰 / 비회귀) + 전체 회귀 **55/55** + 브라우저 E2E `인증 API 등록→me 실호출` **45/45**
    - [x] **비밀번호 정책 강화 (2026-08-26)**: `authController.validatePasswordPolicy` — **8자 이상 + 영문/숫자/특수문자 중 3종 이상 조합** (기존 6자 검증 교체). `RoleSelect.jsx`에 실시간 충족 안내(`PasswordHint`: ✓ 8자 이상 / ✓ 3종 조합) 추가. 테스트 비밀번호 전체 `Secret123#`으로 교체 + 정책 미달(영문만 10자 → 400) 케이스 추가
        - [x] 검증: `auth.test.js` 전체 통과 + `npm run build` + 브라우저 E2E 회귀
- [x] **8.6 복식 (Doubles)** — `Match` 모델 확장(`type` ENUM(singles/doubles) + `participant3Id/4Id` nullable + playerC/D 연관) + `bin/startServer.js`에 **멱등 마이그레이션 훅**(ADD COLUMN IF NOT EXISTS — sync는 기존 테이블 컬럼 미추가 보완). MVP 범위: 조별 자동생성은 싱글스 유지, 복식은 **운영자 수동 추가**(경기 탭 폼: A팀2/B팀2 선택 → POST /matches). `MatchCard` 4인 렌더링(A1·A2 vs B1·B2 + 복식 배지), `TournamentBracket` 파트너 표시. 승자 판정은 캡틴(p1/p2) 기준으로 기존 scoreLogic 재사용.
- [x] **8.6 복식 (Doubles)** — `Match` 모델 확장(`type` ENUM(singles/doubles) + `participant3Id/4Id` nullable + playerC/D 연관) + `bin/startServer.js`에 **멱등 마이그레이션 훅**(ADD COLUMN IF NOT EXISTS — sync는 기존 테이블 컬럼 미추가 보완). MVP 범위: 조별 자동생성은 싱글스 유지, 복식은 **운영자 수동 추가**(경기 탭 폼: A팀2/B팀2 선택 → POST /matches). `MatchCard` 4인 렌더링(A1·A2 vs B1·B2 + 복식 배지), `TournamentBracket` 파트너 표시. 승자 판정은 캡틴(p1/p2) 기준으로 기존 scoreLogic 재사용.
    - **복식 토글 위치**: 대회 설정 메뉴가 아닌 **경기 탭** (단식/👥복식 토글 버튼) — `genType` 상태로 관리됨
    - **팀 등록**: 대회 생성 후 **참가자 탭**에서 2명 선택 → 팀 생성 (`POST /teams`) → 복식 매치 생성 시 팀 매핑
    - [x] **트레이드오프**: 라운드별 자동 복식 편성/대진표 진출 로직은 미구현(수동 추가만) → Match.type 플래그로 추후 확장 기반 마련
        - [x] 기능테스트: `tests/doubles.test.js` 4/4 ✅ (복식 생성 필드 echo / 기본값 singles / 조회 필드 포함 / 스코어 입력→completed+winnerId=캡틴 DB 영속) + 전체 회귀 **59/59** + 브라우저 E2E `복식 폼 4명 선택`·`카드 표시`·`4인 이름 표시` **48/48**

- [x] **8.6a 대회 메뉴에서 단식/복식 선택 (Tournament.matchType)** ✅ 완료 (2026-08-25)
    - [x] **목표**: 대회 생성/설정 화면에서 **단식/복식**을 미리 선택 → 매치 생성 시 자동 반영
    - [x] **백엔드 변경**:
        - [x] `models/Tournament.js`에 `matchType` 필드 추가 (`ENUM('singles','doubles')`, 기본값 `'singles'`)
        - [x] `bin/startServer.js`에 **멱등 마이그레이션 훅** 추가 (`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "matchType" VARCHAR(255) DEFAULT 'singles'` — 기존 DB 행은 전부 singles 기본값 유지)
        - [x] `POST /tournaments`: `Tournament.create(body)`가 matchType을 그대로 받음 (검증 불필요, ENUM 위반은 Sequelize가 500 처리)
        - [x] `PUT /tournaments/:id`(routes 인라인): matchType 유효성 검증 후 적용 — `'singles'|'doubles'` 외 값은 **400 반환**
        - [x] `POST /tournaments/:id/generate-matches`: **우선순위 = 요청 body.matchType > 대회 설정(Tournament.matchType) > 'singles'** (9.5 비회귀 유지 + 8.6a 기본값 확장)
    - [x] **프론트엔드 변경** (`Dashboard.jsx`):
        - [x] 대회 생성 폼에 **단식/복식 라디오 버튼** 추가 (`newTournamentMatchType` 상태 → POST body `matchType`) + 생성 후 리셋
        - [x] 설정 편집(✏️ 설정) 폼에 동일 라디오 버튼 (`editTournament.matchType` → PUT body) + 저장 시 반영
        - [x] 대회 카드 배지에 경기 유형 표시 (`🎾 단식` / `👥 복식`)
        - [x] 대회 선택/생성 시 `genType`(경기 탭 토글)을 대회 설정과 **자동 동기화** — useEffect `[selectedTournament]`에서 `setGenType(t.matchType)`
        - [x] **참가자 탭 복식 모드 반영** (피드백: "복식인데 참가자 설정이 단식처럼 보임") — `isDoublesTournament` 플래그 기반:
            - 참가자 등록 헤더 `👥 참가자 등록 (복식)` + `👥 복식` 배지
            - 안내 문구: "참가자는 개인으로 등록하세요. 매치 생성 시 조 내 4명씩 2팀(A·B)으로 구성됩니다."
            - 조 편성 헤더 `🎲 조 편성 (복식)` + **조당 4명 이상 요건** + 현재 인원 기준 권장 조 수 계산(`4명씩 N개 조 권장`, 나머지 인원 스킵 안내)
            - 조 현황 칩: **4명 미만 조는 `⚠️ 4명 미만` 경고 색상**(amber) — 매치 생성 시 스킵 대상 시각화
    - [x] **기능테스트**:
        - [x] `tests/autoDoubles.test.js` **8/8** ✅ — 신규 3 케이스: ①대회 matchType:'doubles' 생성 → generate-matches 미지정 시 복식 자동 적용(3경기) ②PUT 변경 반영 + 잘못된 값 400 ③요청 body가 대회 설정보다 우선(override)
        - [x] 전체 회귀: 백엔드 Jest **72/72 (13 suites)** · 빌드 ✓
        - [x] E2E `browser_e2e.mjs` **[3a]** 단계 추가: 복식 라디오 클릭 → 대회 생성 → 메시지·배지('👥 복식') 확인 → **참가자 탭 복식 헤더·4명 요건 안내 확인** → 기존 단식 대회 재선택 후 기존 시나리오 비회귀 → **53 pass / 0 fail**
    - **주의(운영)**: 백엔드는 모델 변경 시 **재시작 필요** — 구동 중인 구버전 프로세스는 새 컬럼을 모름(E2E 배지 실패 원인이었음). `lsof -ti:5050 | xargs kill -9 && node bin/startServer.js`
    - **트레이드오프**: 복식 대회로 생성해도 조 편성은 기존 방식 유지(참가자 단위). 브래킷은 복식 MVP 범위 밖(9.5 트레이드오프와 동일)

- [x] **8.6b 복식 등록 방식 선택 — 팀(페어) 신청 + 랜덤 조합 지원** ✅ 완료 (2026-08-25)
    - **배경**: 정식 복식 대회는 보통 파트너가 고정된 팀 단위로 신청 → 기존 "조 내 2v2 랜덤 조합"(9.5, 동호회 짝 섞기 스타일)과 함께 두 가지 방식을 대회 설정으로 선택 가능하게 함.
    - [x] **백엔드 변경**:
        - [x] `models/Tournament.js`: `doublesMode` 필드 (`ENUM('team','random')`, 기본값 `'random'`)
        - [x] `models/GroupAssignment.js`: `teamId` nullable 추가 + participantId nullable 완화 + Team 연관
        - [x] `bin/startServer.js` 멱등 마이그레이션 훅: `tournaments.doublesMode` / `group_assignments.teamId` ADD COLUMN IF NOT EXISTS + `participantId DROP NOT NULL`
        - [x] `utils/matchGenerator.js`: **`generateTeamRoundRobinMatches(teams, roundName)`** 신규 — n팀 → n(n-1)/2경기, p1/p3=A팀(캡틴/파트너), p2/p4=B팀 → 기존 scoreLogic 무변경 재사용. `generateAllMatches`에 `doublesMode` 분기(팀<2 조 스킵)
        - [x] `utils/groupAssignment.js`: **`runTeamGroupAssignment`** — 개인 편성 로직 재사용해 팀 배분, `GroupAssignment {participantId:null, teamId}` 저장, 응답에 `unit:'team'`(개인 편성은 `'participant'`)
        - [x] `controllers/groupAssignmentController.js`: 복식+team 대회면 자동 팀 편성 분기
        - [x] `routes/tournamentRoutes.js`: POST/PUT `doublesMode` 검증(team|random 외 400) + generate-matches 우선순위(**요청 body > 대회 설정 > 'random'**) + 팀 모드 시 조별 팀 조회 후 리그 생성, 응답에 `doublesMode` 포함
        - [x] `controllers/teamController.js` 보강: 양 선수 해당 대회 소속 검증(400)·동일 선수 금지(400)·중복 소속 선수 금지(409)·팀명 미입력 시 `{선수1}·{선수2}` 자동 생성·`DELETE /teams/:id`(조 배정 정리 포함)
    - [x] **프론트엔드 변경** (`Dashboard.jsx`, `api/tournament.js`):
        - [x] 대회 생성 폼: **복식 선택 시에만 "등록 방식" 라디오 노출** (`👥 팀(페어) 신청` / `🔀 랜덤 조합`) + 방식별 설명 문구
        - [x] 설정 편집(✏️ 설정): 동일 라디오로 등록 방식 변경 가능
        - [x] 참가자 탭: 팀 모드에서 **"🤝 팀 결성" 카드** — 선수 2명 셀렉트 + 팀명(옵션) → 팀 목록(삭제 버튼), 대회 선택 시 팀 목록 자동 로드
        - [x] 조 편성 카드 안내 분기: 랜덤="조당 4명 이상" / 팀="조당 2팀 이상"+권장 조 수 계산, 조 현황 칩 단위(`팀`/`명`) 구분
    - [x] **기능테스트**:
        - [x] `tests/teamDoubles.test.js` **4/4** ✅ — ①단위: 4팀→6경기·3팀→3경기·고정 페어 검증·조합 유일성 ②API 전체 흐름: 개인8명→팀4팀→팀편성(unit=team)→매치생성(미지정)→**팀 리그 6경기**(p1/p3 동일팀 DB 영속) ③검증: 중복선수 409·타대회선수 400·동일선수 400·삭제 후 재결성 ④PUT doublesMode: 잘못된 값 400·random 전환 후 3경기(랜덤 방식)
        - [x] 전체 회귀: 백엔드 Jest **76/76 (14 suites)** · 빌드 ✓
        - [x] E2E `browser_e2e.mjs` **[3a]** 확장: 복식+팀모드 라디오 선택 생성 → 참가자 탭 팀결성 카드·'2팀 이상' 안내 확인 → 선수 4명 등록 → select 2개로 팀 결성 → '1팀' 칩·자동 팀명 표시 → 단식 대회 재선택 비회귀 → **58 pass / 0 fail**
    - **트레이드오프**: 팀 모드에서도 선수 개인 등록 먼저(선수풀 형성 후 페어 결성). 조 배지(참가자 옆 조 이름)는 팀 모드 MVP에서 미표시(팀 단위 배정이라 개인 매핑 생략). ~~복식 브래킷은 여전히 범위 밖~~ → **8.6c에서 팀 모드 브래킷 구현 완료** (랜덤 조합 모드는 파트너 비고정 특성상 조별 리그까지만, 문서화)

- [x] **8.6c 복식 팀 모드 본선 브래킷 + 순위 산정** ✅ 완료 (2026-08-26)
    - **배경**: 복식도 본선(토너먼트)까지 필요. 진출 단위는 모드별로 정의 → **팀 신청 모드 = "조당 상위 2팀"**, 랜덤 조합 모드는 파트너 비고정 특성상 **조별 리그까지만**(현행 유지·문서 명시). 순위 기준 = **승패 → 게임득실차** (승점이 캡틴에게만 귀속되는 왜곡을 막기 위해 **승리측 팀 전원 승+1**로 귀속).
    - [x] **스키마 (완전판, 변경 최소화 비선택)**: `models/Match.js` **`teamAId`·`teamBId`** nullable FK 추가 + `Team.hasMany(Match)` 연관 + `bin/startServer.js` 멱등 훅(`ADD COLUMN IF NOT EXISTS`)
    - [x] **순위 산정**: `utils/standings.js` `computeTeamStandings()` — 팀별 승/패·게임득실 집계. **타이브레이커 순서**: 승수 → 게임득실차 → 다득점 → head-to-head → 시드 (h2h는 3팀 순환 시 비결정적이라 후순)
    - [x] **브래킷 생성**: `utils/matchGenerator.js` `generateTeamBracketMatches()` + `utils/bracketService.js` — 예선(조별) 전체 완료 시 **지연 생성**(`bracketPending`), 조당 상위 `qualifiedPerGroup(기본 2)`팀 진출, 크로스 시딩(A조 1위 ↔ B조 2위), 2ⁿ 따기·bye(시드 상위팀)·placeholder 재사용. `ensureTeamBracket` 멱등(already-exists)
    - [x] **승자 전파**: `propagateBracketWinners()` — 경기 확정(completed) 시 `winningSide`(완료이지 캡틴/파트너 전원에서 판별)로 다음 라운드 빈 슬롯 채움. bye 매치는 즉시 완료·자동 진출. `matchScoreService` + `bracketService` hook으로 단식/복식 공통 동작
    - [x] **API**: `POST /tournaments/:id/generate-matches` → 예선만 생성 + `bracketPending:true` 응답, 예선 완료 시 자동 브래킷. `GET /tournaments/:id/standings?unit=team` 신설. `POST /tournaments/:id/generate-bracket`(force 수동 트리거)
    - [x] **프론트**: `TournamentBracket`이 복식 노드에 **p1·p3(파트너)** 2줄 표시 + 미확정 슬롯 '미정'. 경기 탭에 **📊 팀 순위 카드**[(승수→득실차)] 렌더. `api/tournament.js` standings 조회 추가. (팀명 대신 **선수명 조합** 표시 — 테니스타운 방식과 일치)
    - [x] **기능테스트**: `tests/doublesBracket.test.js` **2/2** ✅ — ①단위: computeTeamStandings 귀속(파트너 승→팀 승 인정)·득실차 타이브레이커·scheduled 제외 ②API 전체 흐름: 팀 4팀/2조 → 매치생성(예선2, bracketPending) → 예선 완료 → 자동 브래킷 3경기(준결승2+결승1)·크로스 시딩·standings 반영 → 준결승 완료 → **결승 슬롯에 팀 전파**(p1/p3=A팀 페어) + 중복생성 방지
    - [x] 전체 회귀: 백엔드 Jest **82/82 (16 suites)** · 빌드 ✓ · 브라우저 E2E **58/58** (브래킷은 테스트 비용상 백엔드 API 테스트로 검증)
    - **트레이드오프/확장**: 랜덤 조합 모드는 본선 미지원(파트너 비고정). 팀 모드 개인 랭킹(캡틴/파트너 가중치) 산정과 복식 bracket UI 시각화(단식과 동일 컴포넌트라 별도 작업 없음)는 추후 확장 과제로 남김.
    - **⚠️ UX 픽스 (2026-08-26 추가)**: "팀페어로 만들었는데 예선에서만 끝난다" 버그 대응 2건
        - **원인①(프론트)**: 예선 전부 완료 시 백엔드가 브래킷 자동 생성하지만, socket `scoreUpdated` → `handleScoreUpdate`가 **기존 경기만 `map()` 갱신** → 새 브래킷 경기가 `matches`에 안 들어가 UI에 본선 미표시(새로고침하면 보였음). → `handleScoreUpdate`/`handleConfirm`에 **완료 시 fetchMatches 재조회 + 배정 감지 Toast** 추가
        - **원인②(UX 안내)**: `handleGenerateMatches`가 `bracketPending:true`(복식 팀 모드 = 예선만 생성)를 무시 → "본선 자동 생성" 안내 부재. → 안내 Toast 추가
        - 검증: 빌드 ✓ · 백엔드 Jest **82/82** · E2E **58/58** 비회귀
    - **✅ 개선: 예선+본선 한 번에 생성 (2026-08-26, 사용자 요구 "예선과 본선이 한꺼번에")**
        - **변경 전**: 팀 모드 매치 생성 시 예선만 생성(`bracketPending:true`) → 예선 전체 완료 시에야 본선 브래킷 등장
        - **변경 후**: 단식과 동일하게 **매치 생성 시점에 예선 + 본선 대진을 함께 생성**
            - `matchGenerator.generateTeamBracketPlaceholders(qualifiedTotal)` 신설 — 유효 조 수 × 2팀 기준 2ⁿ 라운드 구조의 빈 슬롯(전부 null) 생성. 라운드명·경기 수는 `generateTeamBracketMatches`와 동일
            - 예선 완료 전 본선 슬롯은 **"미정"으로 대진표에 즉시 표시**(TournamentBracket nameOf null 처리 재사용)
            - 예선 전체 완료 시 `ensureTeamBracket`이 **placeholder를 삭제하고 standings(승수→득실) 기반 실제 진출팀 브래킷으로 교체**(크로스 시딩 유지) → 이후 승자 전파로 결승 채움
            - `ensureTeamBracket` 멱등 규칙 갱신: 실제 팀 배정된 브래킷 존재 시 already-exists / 전부 placeholder면 삭제·재생성 허용
            - API 응답: `bracketPending`(삭제) → `bracketPlaceholder: true`(팀 모드 매치 생성 응답)
            - 프론트: 매치 생성 안내 *"복식 예선 N개 + 본선 대진이 생성되었습니다 — 예선을 모두 완료하면 조 상위 팀이 본선에 자동 배정됩니다"*, 예선 완료 시 *"🏆 예선 전체 완료! 본선 대진에 진출팀이 배정되었습니다"* (배정 감지 = 브래킷 경기 중 teamA/B/participant1 non-null 수 비교)
        - 테스트 갱신: `doublesBracket.test.js`(생성 시 placeholder 3개 포함 count=5·즉시 존재·미배정 확인 / 예선 완료 후 실제 팀 배정·크로스 시딩·결승 전파), `teamDoubles.test.js`(4팀 1조 = 리그 6 + placeholder 1 = count 7, 그룹 경기만 팀 소속 검증)
        - 검증: 백엔드 Jest **82/82 (16 suites)** · 빌드 ✓ · E2E **58/58**
    - **✅ UI 정리: 경기 탭 단식/복식 토글 제거 (2026-08-26)**
        - **배경**: 단식/복식은 **대회 메뉴(생성 폼 + ✏️ 설정, 8.6a)**에서 이미 결정되므로 경기 탭의 토글은 중복. 대회 선택 시 `genType` 동기화 코드(8.6a)도 불필요
        - [x] `Dashboard.jsx`: 경기 탭 토글 UI 제거 → 대회 유형 **읽기전용 배지**(`🎾 단식` / `👥 복식`)로 대체, 매치 생성 버튼 라벨·`handleGenerateMatches`가 모두 `selectedTournament.matchType` 기반으로 동작
        - [x] `genType` state·동기화 effect 완전 제거 (참조 0건), 빈 상태 안내 문구도 대회 설정 기반으로 수정(팀 모드는 4명 요건 문구 미노출)
        - [x] 검증: 빌드 ✓ · E2E **58/58** 비회귀
    - **✅ UI 정리 2: 팀 결성 — 드롭다운 → 검색 선택 + 팀명 입력 제거 (2026-08-26)**
        - **배경**: 대회 메뉴에서 단식/복식·팀모드를 이미 결정하므로 팀 결성은 슬롯 UI만 단순화. 팀명은 백엔드에서 `선수1·선수2` 자동 생성 → 프런트 입력 필드 불필요
        - [x] `Dashboard.jsx`:
          - `teamForm({name,player1Id,player2Id})` state → `teamPick` (id 배열, max 2) + `teamSearch` (검색어)
          - 팀 결성 카드: 2개 `<select>` + 팀명 `<input>` → **검색 input** (`aria-label="팀원 검색"`) + 후보 목록(`data-testid="team-search-results"`, 클릭 토글 선택, 이미 팀 소속 선수는 비활성) + 선택 칩(`✕` 제거)
          - `handleCreateTeam`: 팀명 전송 제거 → `createTeam(id, {player1Id, player2Id})` (백엔드 자동 생성 의존)
          - 버튼 라벨 `팀 결성 (2명 선택)` → `팀 결성 (n/2)`, 2명 선택 시 활성화
        - [x] `browser_e2e.mjs` [3a]: `select[aria-label=...]` 2드롭다운 방식 → `input[aria-label="팀원 검색"]` fill→후보 클릭 방식으로 대응 (puppeteer `page.fill` 미지원 → elementHandle triple-click+Backspace)
        - [x] 검증: vite build ✓ · E2E **58/58** (팀 결성 완료·팀 자동 이름 '·' 표시 모두 pass)

- [ ] **8.6d 조별 순위표 시각화 (2026-08-29 결정, 구현 예정)**
    - **배경**: 조별 리그(예선)에서 경기 목록이 아닌 **조별 순위표(승패·득실·순위)**가 직관적.
    - [ ] **백엔드**: `standings.js`에 `computeGroupStandings()` 구현 — 단식 조별 리그의 개인 순위(승/패/세트득실) 집계. 이미 `computeTeamStandings`(복식 팀) 존재.
    - [ ] **API**: `GET /tournaments/:id/standings?unit=auto|team|player` — `unit` 미지정 시 대회 `matchType`/`doublesMode`에 자동 선택.
    - [ ] **프론트 `TournamentBracket.jsx`**: 조 선택 UI + 조별 순위표 모드 추가. 표시: 순위 | 대상(선수/팀) | 승 | 패 | 득실 | 진출 여부. 진출 팀은 초록색 강조.
    - [ ] **프론트 `Dashboard.jsx`**: 대진표 탭에서 `standings` 조회·상태 관리, 조 선택 핸들러.
    - [ ] **기능테스트**: `browser_e2e.mjs`에 "조 선택 시 순위표 렌더 + 진출자 강조" 시나리오 추가.
- [x] **8.6d 조별 순위표 & 대진표 예선/본선 통합 표시** — 예선 조별 라운드에 조 내 팀 승패·게임득실·순위표(📊) 표시. 프론트 `Dashboard.jsx`에 standings useEffect 추가, `TournamentBracket.jsx`에 `StandingsTable` 컴포넌트, 백엔드 `standings.js`에 `computeGroupStandings()`, `GET /tournaments/:id/standings` API. 브래킷은 예선+본선이 한 화면에 컬럼으로 나란히 표시.
    - [x] 기능테스트: `browser_e2e.mjs` [7] 대진표 단계에 순위표 확인 추가 → **58/58 통과**
    - **트레이드오프**: 조별 리그가 아닌 본선 브래킷에서는 기존 MatchNode 트리 그대로 유지 (모드 분기만 추가).
        - [x] E2E: `스코어 규칙 설정 UI 노출` + `타이브레이크 5-5 설정 적용` ✅ (**48/48 전체 통과**, 백엔드 Jest 59/59)
- [ ] **8.7 배포 전 보안 점검 (Phase 1-5 확장)** — env 변수/JWT_SECRET/REQUIRE_ORGANIZER_AUTH=✅, CORS-Helmet, passwordHash 유출 방지, `/tournaments/:id/standings` 인증 미들웨어(verifyBearer) 추가. 자세한 내용은 `docs/SECURITY.md` 참조.

- [x] **8.8 UI/UX 마무리 polish** (누적 대기 중인 화면 미세 개선 — 전 항목 완료)
    - [x] **편성 완료 시 → '경기' 탭 자동 전환** (`handleGroupAssignment` 성공 시 `setActiveTab('matches')`)
    - [x] **빈 상태 카드 풍성화**: `emptyCard(msg, {icon, sub, action})` — 경기 탭에 아이콘+부제+'대회 탭으로 이동' CTA 적용
    - [x] **`MatchCard` hover transition**(카드 살짝 떠오름) + `BottomNav` 활성 **인디케이터 막대**
> **2026-08-27 진행 결과**: Step 8 **9/9 완료** (8.0~8.6d 전부 ✅). Jest **82/82 (16 suites)** · E2E **58/58**. 잔여: 복식 브래킷(8.6c trailing), 팀 개인 랭킹, 팀 모드 조 배지 — 모두 별도 확장 과제로 기록됨.
    - [x] **참가자 탭 시드 배지**(`시드 #N`) — [1]의 MatchCard에 이어 참가자 목록에도 적용
    - [x] 기능테스트: `browser_e2e.mjs` ✅ (`편성 후 경기 탭 자동 전환` + `하단탭 활성 인디케이터` 포함 43/43)

**실행 순서:** 8.0(bye 버그) → 8.1 → 8.2 → 8.3 → 8.7(타이브레이크 설정), 8.4(다음 경기 알림) → 8.8(U/X polish) → 8.5/8.6 은 백엔드 마이그레이션 동반(추후).
**✅ 진행 결과(2026-08-25):** **Step 8 전체(8.0~8.8) 완료** — 백엔드 Jest **59/59**(11 suites, auth/doubles 신규 포함), 브라우저 E2E **48/48** (`8.7 타이브레이크 5-5 설정 적용` 포함 전 항목 통과). 복식은 MVP(수동 추가)로 제공되며 자동 편성·대진 진출은 추후 확장 과제.
**✅ 진행 결과 갱신(2026-08-25~26, 9.5+8.6a+8.6b+8.6c 포함):** 백엔드 Jest **82/82 (16 suites)** · 브라우저 E2E **58/58** — 복식 자동 편성(9.5), 대회 메뉴 단식/복식 선택(8.6a), 복식 등록 방식 팀(페어)/랜덤(8.6b), **복식 팀 모드 본선 브래킷+순위 산정(8.6c)** 까지 완료. 잔여 확장 과제: 랜덤 조합 모드 본선(파트너 비고정으로 미지원)/팀 모드 개인 랭킹 산정/팀 모드 조 배지.

---

## Step 9: 계정-데이터 연결 & 안정화 (P0/P1 정리)
**목표:** 회원가입(8.5)이 실질 동작하도록 계정과 생성 데이터를 연결 + 저장소/보안 정리.

> 💡 **P0 완료 (커밋 20aaee5)**: 루트 .gitignore 신설(node_modules/.env 제외), ~/ 찌꺼기 git 제거, .env.example 비밀번호 플레이스홀더화, JWT_SECRET env 적용

- [x] **9.1 계정-데이터 연결 (P1-4)** — `Participant.userId`·`Tournament.organizerId` 필드 신설(nullable) + 멱등 마이그레이션 훅(`ADD COLUMN IF NOT EXISTS`) + Bearer 토큰 기반 자동 연결
    - [x] `POST /tournaments` 로그인 주최자 → `organizerId` 자동 연결 (클라이언트 임의 지정은 서버에서 무시)
    - [x] `POST /participants` 로그인 유저 → `userId` 자동 연결 (비회원 null 유지)
    - [x] `GET /tournaments/mine` 신설 — 내 주최 대회 목록 (`/:id`보다 먼저 선언해 라우팅 충돌 방지)
    - [x] 프론트: api 클라이언트 `authHeaders()`(localStorage 토큰 첨부) + 대회 목록·선택 카드에 **"👤 내 대회/내 주최 대회" 배지**
    - [x] 기능테스트: `tests/accountLink.test.js` **5/5** ✅ (organizerId 자동연결 / 위조 무시 / mine 조회 / userId 자동연결 / 비회원 null 비회귀) + 전체 회귀 **Jest 64/64(12 suites)** · 빌드 ✓ · 브라우저 E2E **48/48**

- [x] **9.2 역할 접근 가드 (P1-5)** — `requireOrganizer` 미들웨어(`authController.js`) 신설 + 운영자 전용 변경 API에 적용 완료
    - **설계(트레이드오프)**: `REQUIRE_ORGANIZER_AUTH=true` 환경변수 시 강제(기본 false = MVP 비회원 호환 모드 유지). 활성화 시 무토큰 401 / `role!=='organizer'` 403
    - 적용 대상: `POST /tournaments`, `PUT|DELETE /tournaments/:id`, `POST /group-assignments/run`, `POST generate-matches`, `POST /matches`, `POST /matches/:id/confirm`, `DELETE /matches/:id`, `POST /teams`, `DELETE /teams/:id`
    - **가드 제외**: `PUT /matches/:id`(참가자 스코어 입력), 전체 GET, `POST /participants`(비회원 참가 등록) — 비회원 간편 입장 정책 유지
    - 프론트: 기존 `authHeaders()` 토큰 첨부로 동작, 401/403은 기존 Toast 에러 처리로 피드백
    - [x] 기능테스트: `tests/authGuard.test.js` **4/4** ✅ (기본 모드 익명 허용 비회귀 / 플래그 ON 무토큰 401+GET 공개 / role=user 403·organizer 통과 / PUT 스코어 입력 가드 제외) + 전체 회귀 **Jest 80/80 (15 suites)** · 빌드 ✓ · 브라우저 E2E **58/58**
- [x] **9.3 참가자 화면 알림/배지 (P1-6)** — `ParticipantHome.jsx`에 구현 완료
    - [x] **내경기 탭 배지**: 진행중+예정 경기 수를 하단 탭 빨간점으로 표시 (`navBadges={{ mine: ... }}`)
    - [x] **경기 시작 알림**: socket `scoreUpdated`로 내 경기(p1~p4, 복식 파트너 포함)가 `scheduled → in_progress` 전이 시 상단 고정 Toast("🔥 A vs B 경기가 시작되었습니다!", 5초)
    - [x] 재입장 스팸 방지: 입장 시점에 이미 시작/종료된 경기는 알림 대상 제외(`notifiedMatchRef` 프리필)
    - [x] 검증: 빌드 ✓ · 브라우저 E2E 58/58 비회귀 (알림 자체는 실시간 이벤트 특성상 수동 확인 권장)
- [x] **9.4 README 최신화** — `src/backend/README.md` 갱신 완료: auth(JWT)·tournaments(matchType/doublesMode/scoringRule)·teams(팀 결성 규칙)·group-assignments(unit 응답)·generate-matches(우선순위/skippedGroups)·계정연결(mine/organizerId/userId) API 문서 + JWT_SECRET env 안내 + 테스트 실행법(Jest/browser_e2e) 최신 수치 반영
- [x] **9.5 복식 자동 편성** — 조별 복식 옵션(8.6 확장). 매치 생성 시 `matchType` 선택(단식/복식 토글 UI): 조 내 **모든 고유 2v2 조합**(3×C(n,4), 4명→3경기/6명→45경기) 자동 생성, 캡틴(p1/p2)+파트너(p3/p4) 배치. 4명 미만 조는 `skippedGroups`로 보고·스킵. **트레이드오프**: 복식 개인 랭킹 산정 로직 미정으로 브래킷은 MVP에서 생략(조별 리그만).
    - [x] 기능테스트: `tests/autoDoubles.test.js` **5/5** ✅ (단위 3경기·45경기·0경기 / API 복식 생성+DB 영속 / 단식 미지정 비회귀 / 스킵 보고) + 전체 회귀 **Jest 69/69(13 suites)** · 빌드 ✓ · 브라우저 E2E **48/48**

**실행 순서:** 9.2 → 9.3 → 9.4 → 9.5 완료(9.1 선완료).
**✅ 진행 결과(2026-08-25~26):** **Step 9 전체 완료 + Step 8 복식 브래킷(8.6c) 포함** — 백엔드 Jest **82/82 (16 suites)** · 브라우저 E2E **58/58** · 빌드 ✓. 복식은 수동 추가(8.6)→자동 편성(9.5)→대회 설정 단식/복식(8.6a)→팀/랜덤 등록 방식(8.6b)→**팀 모드 본선 브래킷(8.6c)** 까지 완성. 잔여 확장 과제(랜덤 모드 본선·팀 개인 랭킹·팀 모드 조 배지·9.4 README 프론트 보강)는 별도 단계로 관리.

---

## Step 10: 모바일 앱 출시 준비 (Capacitor 하이브리드) — 진행 중

**목표:** 기존 React+Vite 웹앱을 그대로 유지한 채 **Capacitor**로 쌍아 스토어(iOS App Store / Google Play) 배포 준비. 하나의 코드베이스로 양대 플랫폼 출시 (Plan A).

### 방식 선택 근거
- 프론트가 이미 모바일 반응형(max-width 430px)으로 완성 → 네이티브 재작성(React Native) 없이 **웹뷰 래핑(Capacitor)**이 비용대비 최적
- 하나의 코드로 iOS+Android 동시 배포, 변경 최소화
- (React Native 재작성은 프론트 전체 재설계라 비쌈 — 배제)

- [x] **10.1 Capacitor 초기 구성** — 의존성 설치(`@capacitor/cli/core/android/ios`) + `capacitor.config.json` 생성(`appId: com.tennis.tournament`, `appName: 테니스 토너먼트`, `webDir: dist`)
    - [x] `vite.config.js`에 `base: './'` 추가 → 하이브리드 WebView(파일 스킴) 상대경로 로딩 필수
    - [x] package.json 스크립트: `build:sync`(빌드+sync), `android`, `ios`(빌드→sync→열기)
    - [x] `npx cap add android` / `npx cap add ios` → 네이티브 프로젝트 생성 + dist 복사
- [x] **10.2 네이티브 보안 설정 (로컬 개발용)** — 비 HTTPS(로컬 5050) 테스트 대응
    - [x] Android: `AndroidManifest.xml` `android:usesCleartextTraffic="true"`
    - [x] iOS: `Info.plist` `NSAllowsArbitraryLoads` (ATS 예외) + **"스토어 배포 시 HTTPS로 전환 후 제거" 주석**
    - ⚠️ 실제 스토어 배포 빌드는 절대 이 예외 없이 **HTTPS 백엔드 전용**으로
- [x] **10.3 API/Socket URL 유연화 확인** — `tournament.js`(`VITE_API_BASE_URL`), `socket.js`(`VITE_SOCKET_URL`) 모두 env 기반 확인. 로컬 기본값 5050
    - [x] `.env.example`에 모바일 배포용 https 예시(주석) 추가
    - [x] 백엔드 CORS: `app.use(cors())` 전체 허용 → 네이티브 WebView origin(`https://localhost`/`capacitor://localhost`) 접근 가능 확인
- [x] **10.4 git 정책**: `android/`, `ios/` 네이티브 폴더 **git 커밋 대상**(Capacitor 공식 권장). 별도 ignore 규칙 미추가 확인

- [x] **10.5 백엔드 공개 HTTPS 배포 — ✅ Railway 배포 완료 (2026-08-29)** — 라이브 URL: `https://tennistournament-production.up.railway.app`
    - [x] Railway Hobby 플랜: Web 서비스(루트 레포 배포) + PostgreSQL 플러그인(DB 변수 `PGHOST/PGPORT/PGUSER/PGPASSWORD/POSTGRES_DB` 자동 주입) — 서버 24/7 상시 가동
    - [x] **Railway 빌드 트러블슈팅 기록** (차후 재배포/다른 PaaS 이전 시 참조):
        ① `"/app/dist": not found` → railpack의 SPA 정적 설정 제거, 서버가 `src/frontend/dist`를 직접 서빙하는 구조로 통일 (프론트 빌드 결과물 `dist/`를 git에 커밋 — 루트 `.gitignore`에 `!src/frontend/dist/` 예외 + 프론트 `.gitignore`의 `dist` 규칙 삭제. ⚠️ 하위 gitignore가 우선순위라 루트 예외만으론 부족)
        ② `ECONNREFUSED ::1:5432` → Railway는 통합 `POSTGRES_URL` 미제공하고 개별 변수만 줌 → `config/db.js`가 `PGHOST` 등 분리 변수를 읽도록 확장(로컬 `.env` 개별 키와도 호환), internal 호스트는 `ssl:false`
        ③ 루트 `/`가 "API is running" JSON만 반환 → `server.js`에서 `app.get('/')` 핸들러가 `express.static`보다 앞선 라우팅 순서 문제 → dist 존재 시 루트 핸들러 미등록으로 수정 (`c5d5237`)
    - [x] **라이브 검증**: `/` 200(text/html, React 앱 로딩) · `/tournaments` 200(JSON) · Socket.IO **WSS 연결 OK**
    - [x] 프론트 `.env`를 공개 URL(`VITE_API_BASE_URL`/`VITE_SOCKET_URL` = https://tennistournament-production.up.railway.app)로 교체 → 재빌드·커밋 (앱/웹 모두 이 URL 사용)
    - [x] **Cleartext/ATS 예외 제거 → HTTPS 전용 확정**: Android `usesCleartextTraffic="false"`, iOS `NSAllowsArbitraryLoads` 제거 (스토어 정책 준수)
- [ ] **10.6 앱 아이콘·스플래시·스토어 메타데이터** — `@capacitor/assets` 또는 네이티브 리소스로 아이콘/스플래시 교체(현재 기본 Capacitor 아이콘), 앱 이름·패키지 확인, 스토어 설명·스크린샷·개인정보처리방침 준비
- [ ] **10.7 네이티브 빌드 검증** — Android Studio(`npm run android`)로 APK/AAB 빌드, Xcode(`npm run ios`)로 Archive → TestFlight/Play Console 내부테스트 배포
    - ⚠️ **로컬 환경 블로커**: 현재 `gradle`/`ANDROID_HOME`/Android Studio/Xcode 미설치 → 사용자 설치 후 진행 필요
- [x] **10.8 CORS/Socket 프로덕션 점검** — 라이브 서버에서 `cors()` 전체 허용 동작(네이티브 WebView origin 접근 가능) 확인 + **Socket.IO WSS 실측 연결 성공**(`socket.io-client`로 https URL websocket transport 검증). ⚠️ 운영 확대 시 허용 오리진 명시로 강화 권장

**실행 순서:** 10.1~10.4(로컬 구성, 완료) → 10.5(✅ Railway 배포 완료) → 10.8(✅ WSS/CORS 점검 완료) → 10.6(아이콘/메타) → 10.7(네이티브 빌드, Android Studio/Xcode 필요)
**현재(2026-08-29):** **10.1~10.5 + 10.8 완료 — 라이브 서버 가동 중.** 백엔드(API+WSS)+프론트 정적 서빙이 `https://tennistournament-production.up.railway.app`에서 동작하며, 앱은 빌드 시 이 URL을 사용. **잔여: 10.6(스토어 메타)·10.7(로컬에 Android Studio/Xcode 설치 후 네이티브 빌드 → 스토어 심사 제출)** — 두 항목 모두 계정 가입·도구 설치 등 사용자 작업 필요.

## Step 11: 대회 종목 타입별 참가자 등록 화면 분기 (UI 개선)
**목표:** matchType + doublesMode 조합(단식/복식 랜덤/복식 팀 페어)에 따라 참가자 탭 UI를 자동 분기. 결정사항 §8-7 구현.

> **전제**: 대회 탭에서 단식/복식, 복식 등록 방식(팀/랜덤)은 이미 설정 가능 (8.6a, 8.6b 완료). 참가자 탭은 해당 설정값을 읽어 UI만 분기하면 됨. 백엔드 스키마 변경 없음.

### 분기 기준 요약
| 조건 | 참가자 탭 UI |
|---|---|
| `matchType === 'singles'` | 개인 이름 입력 (기존 UI 유지) |
| `matchType === 'doubles' && doublesMode === 'random'` | 개인 이름 입력 (단식과 동일) |
| `matchType === 'doubles' && doublesMode === 'team'` | 팀 결성 카드 (선수 2명 검색·선택) |

- [x] **11.1 참가자 탭 분기 로직 정리 (`Dashboard.jsx`)**
    - [x] `selectedTournament.matchType` + `selectedTournament.doublesMode` 기반 `isTeamDoubles` 플래그 도출 — 기존 `isDoublesTournament`/`isTeamGrouping` (line 437-439) 활용, 분기 조건 정리
    - [x] 단식/복식 랜덤: 기존 개인 등록 UI 그대로 유지 (변경 없음)
    - [x] 복식 팀 페어: 팀 결성 카드 UI 노출 (8.6b에서 구현 — 분기 조건만 정리)
    - [x] 참가자 탭 헤더에 현재 대회 종목 배지 표시 (`🎾 단식` / `👥 복식 랜덤` / `👥 복식 팀`) — 배지 3분화 + 모드별 안내문구 분리(복식 팀은 ①개인 등록→②팀 결성 2단계 흐름) + 참가자 목록에 **팀 소속(`👥 팀명`)/미배정(`⚠️ 팀 미배정`) 배지** 추가

- [x] **11.2 복식 팀 페어 — 조편성 안내 개선**
    - [x] 조편성 카드: "조당 2팀 이상" 요건 + 현재 팀 수 기준 권장 조 수 표시 (기존 유지)
    - [x] 4명(2팀) 미만 조는 ⚠️ 경고 색상으로 표시 (기존 유지)
    - [x] (보강) 팀 결성 카드에 **진행률 배너**(`✅ N팀 결성 (M명)` / `⏳ 미배정 X명` / `🎉 전원 배정`) + **홀수 인원 경고** 추가

- [x] **11.3 단식/복식 랜덤 — 조편성 안내 일관성 확인**
    - [x] 기존 "조당 4명 이상" 안내가 단식에도 그대로 표시되는지 확인 — 단식은 별도 안내 부재 확인
    - [x] 단식 "조당 2명 이상(풀리그 n(n-1)/2)" / 복식 랜덤 "조당 4명 이상(2v2)" 문구 분리

- [x] **기능테스트(11.x)**
    - [x] 단식 대회 선택 → 참가자 탭: 개인 등록 화면 + `🎾 단식` 배지 확인
    - [x] 복식 랜덤 대회 선택 → 참가자 탭: 개인 등록 화면(단식과 동일) + `👥 복식 랜덤` 배지 확인
    - [x] 복식 팀 페어 대회 선택 → 참가자 탭: 팀 결성 카드 노출 + `👥 복식 팀` 배지 확인
    - [x] `npm run build` 통과
    - [x] `scripts/browser_e2e.mjs` 회귀 통과 (기존 58/58 비회귀)

> **✅ 진행 결과(2026-08-30)**: Step 11 **전체 완료** — `Dashboard.jsx` 참가자 탭에 종목 타입별(단식/복식 랜덤/복식 팀) 배지 3분화 + 모드별 안내문구 + 팀 소속/미배정 배지 + 팀 결성 진행률·홀수 경고 + 조편성 안내 분리 적용. 백엔드 Jest **81/82** (1 failure는 기존 8.6c doubles bracket 응답 형식 불일치 — Step 11과 무관), 프론트 빌드 ✓, 브라우저 E2E **58/58** 비회귀.
> ⚠️ **부수 수정**: 로컬 `.env`의 `REQUIRE_ORGANIZER_AUTH=true`를 주석 처리 — 로컬 개발/테스트에서 인증 강제로 인해 `POST /tournaments` 등 비회원 테스트가 401 실패했기 때문 (배포 Railway에서만 true, `docs/SECURITY.md` 참조).

- [x] **🔥 긴급 버그픽스 (2026-08-30): 운영 조편성 401 — 프론트 쓰기 API Authorization 헤더 누락**
    - **증상**: Railway(`REQUIRE_ORGANIZER_AUTH=true`)에서 주최자 로그인 후 조 편성 실행 시 `401 운영자 인증이 필요합니다`
    - **원인**: `api/tournament.js`의 9개 함수가 `authHeaders()`(Bearer 토큰 첨부) 미적용 — 로그인해도 토큰이 전송되지 않음. 대상: `runGroupAssignment`, `deleteTournament`, `updateTournament`, `deleteMatch`, `updateParticipant`, `deleteParticipant`, `createMatch`, `updateMatchScore`, `confirmMatch` (기존 첨부분: createTournament, generateMatches, createParticipant, createTeam, deleteTeam, fetchMyTournaments, fetchStandings)
    - **수정**: 전체 쓰기 함수에 `...authHeaders()` 첨부 (참가자 스코어 입력 등 비가드 엔드포인트도 일관성 위해 첨부 — 무토큰 시 `{}`라 무해)
    - **부수 정리**:
        - `tests/doublesBracket.test.js` 8.6c 스테일 단언 갱신 — 8.6d 그룹 래핑 순위 응답(`{ unit:'team', groups:[{name, standings}] }`) 반영 → 이전 세션의 "Jest 81/82" 잔여 실패 해소, **Jest 82/82 (16 suites)** ✅
        - `browser_e2e.mjs` 등록 토큰을 `tennis_auth`로 저장 → **가드 ON 상태**에서 전체 E2E 실행 가능 → **59/59** ✅ (조 편성·대회 생성 등 모든 운영자 흐름이 Bearer 첨부 상태로 검증됨)
        - dist 재빌드 (`index-BGH7UVlg.js`) → 커밋 `da51f4c` 푸시
    - **운영 검증** (`https://tennistournament-production.up.railway.app`, 프로브 계정):
        - 신규 번들 서빙 확인 (`assets/index-BGH7UVlg.js`)
        - 무토큰 `POST /group-assignments/run` → **401** (가드 정상) / 토큰 → **401 아님**(유효성 400) ✅
        - 토큰으로 대회 생성 **201** · 삭제 **200** · `/auth/me` **200** ✅ (프로브 대회는 삭제 정리 완료)
    - ⚠️ **잔여**: 운영 DB에 배포검증용 프로브 계정(`probe*@probe.example.com`, role=organizer) 2개 남음 — 유저 삭제 API가 없어 수동 정리 필요(무해)

- [x] **11.1 대진표 조별 순위표 표시 수정 (2026-08-30)** — "예선 조별 승/패/게임득실이 안 보인다" 3중 원인 수정
    - **원인 1 — 참가자 화면**: `ParticipantHome`이 `<TournamentBracket>`에 `tournamentId`를 안 넘김 → 순위 API 호출 자체가 누락(참가자 대진표에는 순위표가 아예 없었음) → `tournamentId={enteredTournament?.id}` 전달로 수정
    - **원인 2 — 복식 팀 모드**: standings API가 단일 `{name:'전체'}` 그룹만 반환 → 대진표 라운드(group_A~F)와 매칭 실패로 렌더 스킵 → **조별 분리 반환**(GroupAssignment.teamId 기준, 조 편성 없으면 '전체' 폴백 유지)
    - **원인 3 — 승/패 집계 누락**: `Match.groupId`가 **모델 컬럼에 없어** 생성 시 저장되지 않았음 → 조별 필터가 항상 빈 배열 → 순위가 전부 0승 0패 → `computeTeamStandings`/`computeGroupStandings`가 **전달된 팀/참가자 스코프로 자동 필터링**되므로 groupId 필터 제거하고 전체 예선 경기 전달(기존 데이터 즉시 정상 집계, 스키마 변경 불필요)
    - **UI 개선**(예시 앱 스타일): 조별 순위표 컴팩트 행(순위바 amber/gray · 이름(팀은 선수명 조합) · N승 N패 · 게임득실차 ±색상, 조당 상위 2 강조·하위 흐림) + **예선 진행률 바**(완료/전체 %) + 라운드 한글 라벨(A조/결승/준결승/8강/16강) + 조명 매칭 견고화(group_A/1조/전체 호환)
    - **부수**: Dashboard 경기 탭 📊 팀 순위 카드가 8.6d `{unit,groups}` 응답과 호환되도록 평탄화(기존엔 조건 실패로 미노출)
    - **검증**: Jest **82/82** (doublesBracket 조별 승수 집계 포함) · 브라우저 E2E **59/59**(가드 ON, '조별 순위표 표시(순위/승패/게임득실)' 체크 교체) · 운영 배포 확인(`index-DqKO6kbb.js`) · 운영 실측: 팀 모드 6조(A~F) 조별 분리 응답 확인(두 대회 모두 완료 경기 0개라 0승이 정상)
    - 💡 **참고**: `Match.groupId`는 여전히 미저장(유틸이 메모리에서만 세팅) — 순위는 스코프 필터링으로 동작하지만, 향후 groupId 기반 조회가 필요하면 모델 컬럼 + 멱등 마이그레이션 + 백필 필요

- [x] **12.1 대진표 화면 개편 (2026-08-31)** — 예시 앱(IMG_1160) 스타일: 라운드 탭 + 예선 진행률/검색 + 2열 조 그리드 + 조 상세 + 토너먼트 검색/대진
    - **상단 라운드 탭**: `예선 | 32강 | 16강 | 8강 | 준결승 | 결승` — 실제 존재하는 라운드만 필(pill)로 노출, 선택 시 해당 뷰 전환 (예선 클릭은 early return 없이 탭 전환·조 상세 닫기)
    - **예선 탭**: ① 예선 진행률 바(완료/전체 %) ② 참가자 이름 검색(aria-label) ③ **조 카드 가로 2개 그리드 → 2열 초과 시 아래로 배치**(이후 줄바꿈) — 카드에는 순위·이름(팀=선수명 조합)·`N승 N패`·게임득실차(±색상)·상위 2 강조·하위 흐림
    - **조 상세 화면 이동**: 조 카드 클릭 → `← 돌아가기` + 전체 표(순위/경기/승/패/세트득실[단식]/게임득실) + 조별 경기 목록
    - **토너먼트 탭(32강 등)**: 참가자 이름 검색 + 선택 라운드부터 결승까지 대진 트리(가로 스크롤) —검색으로 특정 선수의 대진만 필터
    - **구현**: `TournamentBracket.jsx` 전면 재작성(조명 매칭 견고화 유지, MatchNode/범례 계승) + `browser_e2e.mjs` [7] 단계 체크 교체(라운드 탭/진행률+검색+승패/조 카드→상세 이동)
    - **검증**: Jest **82/82** · 브라우저 E2E **61/61**(가드 ON) · 빌드 ✓ (`index-CmAqXDND.js`)

- [x] **12.2 참가자 신청(등록 주체 전환)** — (2026-08-31 문서화, 2026-09-01 구현 완료, 커밋 `2b91628`, `038a51e`)
    - **배경**: 등록을 운영자 화면이 아닌 **참가자 역할**에서 대회 보고 직접 신청. 단식 1명씩, **복식 팀은** 1명이 2명(본인+파트너) 함께 신청 → 승인 시 Team 자동 생성(1단계), **복식 랜덤은** 개인 신청(운영자가 매치 생성 시 랜덤 매칭). 파트너는 **참가자 계정 검색**으로 등록. 운영자 참가자 탭은 **참가자 카드 형태**.
    - **데이터**: `RegistrationRequest` 재사용 + **`memberNames`(JSON)** 컬럼 추가(모델+멱등 마이그레이션 `startServer.js`)
    - **백엔드**: `registrationRequestController` 승인 시 `Participant`(+복식 팀 페어는 `Team`) 자동 생성, 중복 신청 409, 대회별 필터. `authController` + `GET /auth/users/search` 계정 검색. `participantRoutes` 등
    - **프론트**: `ParticipantHome` 신청 폼(단식 1명 / 복식 팀 2명 + 계정 검색 파트너 / 복식 랜덤 1명), `Dashboard` 참가자 탭 신청 대기 카드(승인/거절) + 승인된 **참가자 카드 그리드**(랜덤은 기존 목록 유지)
    - **검증**: 등록→신청→승인→카드 ✅ / 복식 팀 2인+Team 자동 생성 ✅ / 복식 랜덤 개인 신청 ✅ / 중복 409 ✅ / 랜덤 목록 유지 회귀 ✅ — E2E **74/74 통과**

- [x] **12.3 복식 팀 모드 "팀 바로 등록" 통합** — (2026-09-03 결정·구현)
    - **배경**: 복식 팀 모드 참가자 탭의 "참가자 등록"과 "팀 결성" 2단계를 거치지 않고, **바로 팀을 만들어 등록**. 1명만 넣거나(파트너 미정 팀) 2명을 넣어(완성 팀) 등록.
    - **백엔드**: `POST /teams` `player2Id` **선택 허용**(1명 팀: `null`, 팀명=선수명 단독) · `PATCH /teams/:id` **신설**(파트너 배정/교체 + 팀명 자동 갱신 "A·B", 중복 소속 409 유지) · `groupAssignmentController` **미완성 팀 편성 제외** + `excludedIncompleteTeams` 응답(완성 팀 0개면 400)
    - **프론트(`Dashboard.jsx`)**: 복식 팀 모드만 "참가자 등록+팀 결성" → **"👥 팀 등록 (복식)" 1개 폼 통합**(선수1 필수+선수2 선택, 이름 기반 재사용/자동 생성) · 1명 팀 카드에 **➕ 파트너 추가 인라인 폼** · "완성 팀 N · 파트너 미정 M" 진행률 표시 · 단식/복식 랜덤은 기존 UI 유지
    - **테스트**: `teamDoubles.test.js` 신규 3 케이스(1명 팀 생성+PATCH 팀명 갱신 / 조 편성 제외+excludedIncompleteTeams / 1명 팀뿐이면 400)
    - **검증**: Jest **92/92 (17 suites)** · 브라우저 E2E **84/84** · 빌드 ✓

- [x] **12.4 복식 랜덤 "게임 수 고정 믹서" — 기존 전체 조합 방식 대체** — (2026-09-03 결정·구현)
    - **배경**: 기존 복식 랜덤은 조 내 모든 2v2 조합(`3*C(n,4)`) 생성 — 6명→45경기, 8명→210경기로 사용 불가. 요구: **인원 무관 각자 4게임**. 4명 조 + K=3이 구 방식과 동일 결과라 **대체 확정**(공존 불필요)
    - **알고리즘**(`generateDoublesFixedGamesMatches`): 총 경기 `ceil(n*K/4)`, 라운드별 셔플 4인 묶음 → 3가지 2v2 분할 중 **파트너 반복 ×100/상대 반복 페널티 최소** 선택, bye는 남은 목표경기 많은 순→휴식 적은 순 공평 분배, `n*K/4` 미분할 시 일부 +1경기, 시드 PRNG로 결정적 출력
    - **백엔드**: `Tournament.gamesPerPlayer` 신설(기본 4, 멱등 마이그레이션) + POST/PUT/generate-matches 검증(2~6 외 400) + 응답에 `gamesPerPlayer` echo. 구 생성기 `generateDoublesRoundRobinMatches` **삭제**
    - **프론트**: 대회 생성/설정 폼에 복식+랜덤 시 **"인당 경기 수" select(2~6, 기본 4)**, 경기 탭 안내 문구 갱신
    - **부수 제거 (2026-09-03)**: 복식 경기 수동 추가 폼 삭제(`dbl` 상태·`handleAddDoubles`·`doubles-form` 블록, `createMatch` import) — 수동 추가는 믹서의 인당 K경기 보장을 깨므로 모든 모드에서 자동 생성으로 일원화. E2E 폼 검증 4체크를 "복식 랜덤 대회 폼 미노출 + 믹서 경기 목록 표시"로 교체
    - **테스트**: `autoDoubles.test.js` 전면 갱신(구 45경기 케이스 → 믹서 불변식) — 4명K3 구방식 동일성 / 6·8명 인당4경기 / 5명K2 미분할 분배 / API 기본·override·설정·400 + E2E 신규 3 체크(select 노출 / gpp echo / 믹서 생성 실호출)
    - **검증**: Jest **95/95 (17 suites)** · 브라우저 E2E **85/85** · 빌드 ✓

- [x] **12.5 리그 전용 진행 방식 + 조편성 원클릭** — (2026-09-03 결정·구현)
    - **배경**: 단식·복식 팀이 무조건 본선까지 생성 → **리그 전용**(승패·게임득실 순위로 승부) 필요. 조편성은 운영자가 계산 — **원클릭 자동 편성**으로 개선(단식 3명/랜덤 4명↑/팀 3팀 관례 반영)
    - **백엔드**: `Tournament.format` ENUM(tournament/league, 기본 tournament) + 멱등 마이그레이션 · `generateAllMatches` league 분기(단식·팀 브래킷 미생성) · POST/PUT/generate-matches format 검증·echo · **복식 랜덤은 생성 시 강제 league** · `bracketPlaceholder` team+league면 false
    - **프론트**: 대회 생성/설정 폼 **진행 방식 라디오**(단식·복식 팀만, 랜덤은 "리그 전용 고정" 표시) · 참가자 탭 조편성 카드 재작성 — 자동 편성 버튼 + 칩 프리셋 + 프리뷰 + 직접 설정 접힘 토글 · 리그 전용 전 경기 완료 시 에메랄드 최종 순위 안내 배너
    - **테스트**: `autoDoubles` 신규 3(단식 리그 6경기 브래킷0 / format 400 / PUT 전환) + `teamDoubles` 신규 1(팀 리그전 placeholder false) + E2E 신규 2(진행 방식 라디오 노출, 리그 단식 매치 브래킷 없음)
    - **⚠️ TDZ 수정**: 조편성 권장값 `poolCount` 등이 `isTeamGrouping` 앞에 정의되어 **화면 전체 로드 실패** — 변수 3종을 `isTeamGrouping` 뒤로 이동 · E2E "직접 설정 토글 펼치기" 추가(기본 접힘 반영)
    - **검증**: Jest **98/98 (17 suites)** · 브라우저 E2E **87/87** · 빌드 ✓

- [x] **12.6 조당 인원 칩 클릭 = 즉시 편성** — (2026-09-03 결정·구현)
    - **배경**: 12.5 칩은 그룹 수만 설정하고 `🎲` 버튼을 한 번 더 눌러야 함 → **칩 클릭 하나로 설정+편성 동시 완료**
    - **구현**: `Dashboard.jsx` `handleChipAssign` 신설 — 칩 클릭 → `chipGroupNum(조당 인원)` 계산 → 편성 방식(시드 있으면 `mixed`/없으면 `random`)으로 **즉시 `runGroupAssign` 실행**. 예) 복식 랜덤 8명에서 `[8명씩]` = 1개 조, `[4명씩]` = 2개 조
    - **UI**: 칩 라벨 "조당 인원 (클릭 시 즉시 편성):" + 툴팁. `🎲 자동 편성`(권장값)과 `▸ 직접 설정`(수동) 유지
    - **테스트**: E2E [5]를 칩 즉시 편성 경로로 교체(단식 5명 → '3명씩' 칩 = 2개조 · 그룹 증가 확인) + 칩 노출 체크 추가
    - **검증**: Jest **98/98** · 브라우저 E2E **88/88** · 빌드 ✓
- **검증**: Jest **98/98** · 브라우저 E2E **88/88** · 빌드 ✓

- [ ] **12.7 참가자 화면 개편 — 대회 목록·상세·프로필** — (2026-09-04 결정, 구현 예정)
    - **배경**: 참가자 화면 하단 탭 2개(내경기/대진표)뿐이라 단출 + 대회 정보·공지·장소·참가비 미노출. 사용자 요구: 대회 목록에서 바로 상세 진입 + 대회 상세 안에 대진표 포함 + 프로필(내 정보) 탭 추가
    - **설계**:
      - 하단 탭 3개: 🏠 **내 정보** (디폴트) · 📞 **대회 목록** · 👤 **내경기**
      - 🏠 내 정보: 프로필(이름·이메일·참가 대회 수) + 내 전적 요약(승/패/게임득실) + 대회별 내 기록(대회명·신청상태·승패·파트너)
      - 📞 대회 목록: 전체 대회 카드(이름·📅일자·📍장소·💰참가비·정원·상태) → 클릭 → 대회 상세
      - 대회 상세: 상단 헤더(대회명·일자·장소·참가비·상태·진행방식) + 아코디언 4개 — ① 📋 대회정보 ② 🏆 대진 및 진행현황(예선 진행률·**대진표**·조별 순위·내 경기) ③ 👥 참가자 명단 ④ 📢 공지사항
      - 대진표는 별도 탭 아님 — 대회 상세 안에 포함
    - **백엔드**:
      - `Tournament.location`(STRING) · `Tournament.entryFee`(STRING) 신설 + 멱등 마이그레이션
      - `Notice` 모델 신설(`tournamentId, title, content`) + `controllers/noticeController.js` + `routes/noticeRoutes.js` + `server.js` 마운트
      - API: `GET /tournaments/:id/notices`(비회원 조회) / `POST /tournaments/:id/notices`(운영자 가드) / `DELETE /notices/:id`(운영자 가드)
      - 내 참가 대회·기록 API: 내가 참가한 대회·팀 목록 + 각 대회 승/패/득실 (standings 기반)
      - `routes/tournamentRoutes.js` POST/PUT에 `location/entryFee` 처리 + `controllers/tournamentController.js` PUT 추가
    - **프론트**:
      - `ParticipantHome.jsx` 전면 개편: 하단 탭 3개 + 대회 목록 탭 + 대회 상세(헤더+아코디언) + 프로필 탭
      - `Dashboard.jsx`: 대회 생성/설정 폼에 장소·참가비 입력 + 대회 탭에 공지 작성·삭제 UI
      - `api/tournament.js`: `fetchNotices` / `createNotice` / `deleteNotice` / `fetchMyStats`
    - **테스트**: Jest(Notice API·location/entryFee 저장·내 참가 대회 API) + 빌드 + E2E(대회 목록 탭 → 상세 헤더 장소/비용/아코디언 4섹션·명단·공지 표시·프로필 탭 내 기록)
    - **검증**: Jest 전체 회귀 + 빌드 + E2E 전체 + 운영 배포 확인

## Step 13: 참가자 입장 UX 개선 + 내정보 관리 (2026-09-13 완료)

- [x] **13.1 참가자 입장 화면 — 대회명 검색 중심 개편** (`ParticipantTabs.jsx` `EnterScreen`)
    - **배경**: 대회 ID 코드 입력이 최상단 주 UI라 참가자가 대회 번호를 알아야 입장 가능 → 불친절. 대회명으로 검색/선택하는 게 직관적 (사용자 지적)
    - **구현**:
        - 🔍 대회명 검색창을 최상단 주 UI로 — 입력 즉시 목록 실시간 필터링 (대소문자 무시, 부분 일치, ID/코드도 검색 가능)
        - 검색 결과 1개로 좁혀지면 **"OO 입장하기"** 버튼 즉시 노출
        - 대회 코드 입력은 `<details>` 접힘 블록으로 축소 (운영자가 코드를 알려준 경우만 사용) — '대회 코드 입력' 텍스트 유지로 기존 E2E 호환
        - 검색 결과 없음 안내 + 검색어 지우기(✕) 버튼, "검색 결과 (N)" 헤더
- [x] **13.2 내정보 관리 — 정보 수정·비밀번호 변경·회원탈퇴** (사용자 지적: 회원가입만 있고 계정 관리가 없음)
    - **백엔드** (worker `src/routes/auth.ts`):
        - `PUT /auth/me` — 이름/이메일 수정 (이메일 중복검사 409, 주최자면 orgName 동기화 — 초기값과 동일한 경우만)
        - `PUT /auth/me/password` — 비밀번호 변경 (현재 비밀번호 검증 필수, 8~72자)
        - `DELETE /auth/me` — 회원탈퇴 (비밀번호 재확인 필수)
        - 전부 Bearer 필수. 탈퇴 시 users 삭제 → organizers cascade, tournaments.organizerId set null (대회·참가자 데이터 보존, 무주공으로 유지)
    - **프론트** (`RoleSelect.jsx` + `api/auth.js`):
        - 로그인 상태에 "내정보 ▼" 토글 → ① 내 정보 수정(이름/이메일, 저장 시 localStorage 인증 정보 즉시 갱신) ② 비밀번호 변경 ③ 회원탈퇴(비밀번호 확인 + confirm 대화상자, 빨간 버튼)
        - `api/auth.js`: `updateProfile` / `changePassword` / `deleteAccount` 추가
    - **검증** (로컬 + 프로덕션 동일, curl/node 실측): 정보수정 200 · 비인증 수정 401 · 잘못된 현재비번 변경 401 · 정상 변경 200 · 새 비번 재로그인 OK · 잘못된 비번 탈퇴 401 · 정상 탈퇴 200 · 탈퇴 후 로그인 401 — **전부 통과**
    - **배포**: worker version `63c593ca` · 번들 `index-BmbF5jyo.js` · 프론트 `b2eed52`(master) / worker `b3148d1`(main)

- [x] **13.3 참가자 입장 화면 — MobileLayout 통일 + 운영자 전환 하단 네비화** (2026-09-13, 사용자 지적)
    - **배경**: 입장 화면만 MobileLayout 미사용 독립 화면이라 하단 네비가 없었고, "🎭 운영자 모드로 전환" 버튼이 대회 목록 맨 아래에 있어 대회가 많아질수록 스크롤 부담 증가 (두 지적의 근본 원인 동일: 입장 화면만 앱 구조를 벗어남)
    - **구현**:
        - 입장 화면을 `MobileLayout`으로 전환 — 하단 네비 `[🔍 대회 찾기] [🎭 운영자]` 상시 노출, "운영자" 탭 클릭 시 역할 선택 화면 복귀(기존 로직 동일: role 제거 + '/')
        - `EnterScreen` 하단 버튼 제거 (중복 제거 — 전환은 네비 전담)
    - **효과**: 대회 목록 길이와 무관하게 운영자 전환 위치 고정(스크롤 재발 불가 구조) + 입장 전 화면에도 앱 일관 하단 네비
    - **배포**: worker version `02185054` · 번들 `index-Zc2w0CsE.js` · 프론트 `20b7915`(master)

## Step 14: 참가자 기본값 플로우 — 역할 선택 화면 제거 (2026-09-13 완료, 사용자 제안 수용·확장)

- [x] **14.1 첫 화면 = 참가자 입장 (무조건)**
    - **제안 배경**: "로그인 먼저 → 역할 자동 인식" 사용자 제안. 단, 로그인 선행은 **비회원 대회 코드 입장·참가 신청**(현장 핵심 흐름)을 막는 장벽 → 거부하고 **"참가자 기본값"**으로 재설계
    - **구현** (`App.jsx`):
        - RoleSelect(역할 선택 화면) **삭제** — 참가자에게 "역할" 개념 자체 제거
        - `tennis_role !== 'organizer'`면 항상 `ParticipantHome`(참가자 입장) 라우트
- [x] **14.2 운영자 진입·복귀 단순화**
    - 진입: 참가자 화면 하단 네비 `🎭 운영자` 탭 → `tennis_role=organizer` 저장 후 리로드 → **이후 방문은 운영자 화면으로 자동 시작**(역할 자동 인식 충족)
    - 복귀: Dashboard 헤더 우측 `👥 참가자` 버튼(role 제거 + 리로드)
- [x] **14.3 로그인은 운영자 맥락으로 이동** — `components/AccountBar.jsx` 신설(구 RoleSelect 계정 섹션 이식)
    - Dashboard 대회 탭 최상단 배치: 비로그인 시 "🔒 주최자 로그인 필요" 안내 + 로그인/회원가입 접힘 폼, 로그인 시 내정보 관리(13.2 전체 이식)
    - 로그인·탈퇴 시 `window.location.reload()`로 소유 대회 목록 즉시 재로드
    - 하단에 `👥 참가자 화면으로 돌아가기` 버튼
- **잔여**: `browser_e2e.mjs`가 구 RoleSelect 플로우(운영자/참가자 카드 클릭) 전제 → 하단 네비 `🎭 운영자` 클릭 경로로 교체 필요 (후속 과제)
- **배포**: worker version `a42718fa` · 번들 `index-oytfDPfF.js` · 프론트 `ae38fee`(master)

## Step 15: P0 UI 폴리시 — 테니스 아이덴티티 + 카드 통일 (2026-09-19 완료)

- [x] **15.1 아이덴티티 컬러 토큰** (`index.css` `:root`)
    - `lime-400(테니스볼 #a3e635)` + `slate-900(네이비 #0f172a)` 2색 통일. 회색+파랑+인디고 혼용 해소
- [x] **15.2 카드 시스템 통일** (`.card` / `.card-title` / `.card-body` / `.card-sub`)
    - `AccountBar` 적용(`card` 클래스). 전 화면 점진 적용 예정
- [x] **15.3 하단 탭 활성 인디케이터** (`BottomNav.jsx`)
    - 파란 바 → 테니스볼 도트 + 활성 탭 살짝 상승(`-translate-y-0.5`) + 탭 눌림(`active:scale-95`)
- [x] **15.4 빈 화면(Empty state)** (`.empty-wrap` 등 + `ParticipantTabs` 검색 결과 없음 적용)
    - 🔍 일러스트 + 타이틀 + 안내 + 행동 버튼 규격
- **배포**: worker version `49f6f99a` · 번들 `index-CcnMg5jG.js` · 프론트 `3173ff2`(master) / worker `895e30b`(main)

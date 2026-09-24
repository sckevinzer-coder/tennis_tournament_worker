

## Step 22: 참가자 프로필 고도화 + 12.7 최종 검증 (2026-09-24 완료)

참가자 **내 정보**를 단순 계정 정보 화면에서 개인 전적 화면으로 확장하고, Step 12.7 전체 흐름을 현재 Workers + D1 구조에서 재검증함.

- **백엔드**: `GET /me/tournaments` 신규 — 계정 정보, 참가/주최 대회 수, 전체 경기 수·승률·승패·게임 득실, 대회별 기록, 복식 파트너 반환
- **프론트**: `ParticipantTabs.jsx` 프로필 요약·대회별 기록·복식 파트너·로딩/오류/재시도 UI
- **대회 상세**: 장소·참가비 및 공지 작성/삭제 운영자 UI
- **테스트 보정**: 장소 생성 폼은 `LocationPicker`를 사용하므로 `smoke_12_7.mjs` selector를 `placeholder="장소명을 입력하세요"` 기준으로 수정
- **재검증**: 12.7 UI/API 스모크 **27/27 PASS**, 프로필 E2E **9/9 PASS**, 전체 브라우저 E2E **89/89 PASS**, 프론트 빌드 PASS
- **운영 확인**: `/health` 200, 비인증 `/auth/me` 401
- **최신 배포**: 아래 커밋/푸시 및 `wrangler deploy` 완료 후 운영 URL에서 정적 자산·헬스체크·인증 경계 최종 확인
- **운영 배포**: Worker version `000d8450-3da6-4e3a-9237-ac34dfdd4654`, 프론트 번들 `index-D0CKLXIN.js` / `index-cn0OwPtj.css`
- **운영 최종 확인**: 루트 HTML 신규 번들 참조 확인, JS/CSS 200, `/health` 200, 비인증 `/auth/me` 401, Worker `tsc --noEmit` 및 dry-run 통과


## Step 21: 최고관리자 계정 (2026-09-21 완료)

특정 계정을 최고관리자로 지정해 **모든 대회를 관리·삭제**할 수 있게 함.

- 지정: Secret `SUPERADMIN_IDS` (콤마 구분 user id, 예 `6,15`) — `wrangler.toml` 미사용, DB 변경 없음
- 백엔드: `isSuperAdmin()` / `hasOrganizerAccess()` 신설, `requireTournamentOwner`에 `env` 전달 + 최고관리자 우회, 라우트 역할 가드 37곳 치환
- 프론트: `isSuperAdmin` 배지 + 모든 대회 관리 탭·삭제 버튼 노출
- 검증: superadmin_check 9/9, roleuser_check 5/5, E2E 72 pass / 17 fail (회귀 없음)
- 배포: worker `e98e7b0` / 프론트 `37e86b8`, worker version `63edd89b`
- ✅ `SUPERADMIN_IDS` Secret 등록 완료 — `sckevinzer`(id 18) 최고관리자 동작 확인 (완료)

## Step 20: UI 개선 2차 (완료) — B·C·D·E·F·A 전부

우선순위 (Plan 모드 합의):
1. **B 로딩 스피너 통일** — 운영자 `Dashboard.jsx` 616행 `로딩 중...` → 참가자 화면과 동일한 스피너 (`role="status"`, 테니스볼 lime 보더)
2. **C 승인 버튼 중복 방지** — `handleApproveRequest`(301행)에 busy 가드. 거절은 `confirm`이 사실상 차단하므로 제외. `handleAddParticipant`의 `addingParticipantRef` 패턴 재사용
3. **D 터치 타겟 확대** — `MatchCard.jsx` `▶️`/`🗑` 버튼 `px-2 py-1` → 44px 이상. 시작 버튼에 "시작" 텍스트 병기 검토
4. **F 경기 탭 진행 요약** — `🎾 경기 (N개)` → `예정 N · LIVE N · 종료 N` breakdown 추가
5. **E 미배정 요약/필터** — 코트 탭 상단에 "미배정 N경기" 배지 + 필터 토글
6. **A 확인 모달** — `window.confirm` 7곳 → 공통 `ConfirmDialog` 교체. E2E `dialog` 핸들러 수정 동반이므로 별도 Step으로 분리 검토

상태: B·C·D·F·E·A 전부 완료 (2026-09-21) — Step 20 종료

## STEP 19: UX 개선 — 화면별 작은 개선 (완료)

### 적용 완료
- 1번 참가자 입장 화면: 검색 전에 "뭐 하는 화면인지" 바로 보이도록 서브타이틀/안내 문구 정리 (2026-09-21 반영) — `ParticipantTabs.jsx` `EnterScreen`에 안내 문구 추가
- 2번 날짜 표기 정렬 (2026-09-21 반영): 입장 화면 날짜 `MM/DD` 0패딩 통일 (`ParticipantTabs.jsx` `formatDate`) — 대회상세 `MM/DD (요일)`은 유지. 숫자 자릿수만 맞춰 화면 간 어색함 완화
- 3번 대진 볼드: 코드 확인 결과 이미 충족 — 라운드 헤더·그룹 헤더·순위/득실·승자 행에 `font-bold`/`font-semibold` 적용됨 (`TournamentBracket.jsx`) → 추가 변경 없음
- 4번 대기열 테이블 full-width: 코드 확인 결과 유일한 `<table>`인 조별 상세 순위표가 이미 `w-full` (`TournamentBracket.jsx:232`, 카드 내 `overflow-hidden`) → 추가 변경 없음
- 5번 제안사항 손질: 코드에 "제안" 관련 텍스트 없음, 참가 신청 흐름은 `ParticipantHome.jsx` `ApplyForm`·신청 버튼 문구로 이미 정리됨 → 추가 변경 없음
- 각 변경 후 vite + puppeteer로 최소 회귀 확인, 푸시·배포·문서화

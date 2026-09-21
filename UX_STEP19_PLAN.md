

## Step 20: UI 개선 2차 (2026-09-21 계획)

우선순위 (Plan 모드 합의):
1. **B 로딩 스피너 통일** — 운영자 `Dashboard.jsx` 616행 `로딩 중...` → 참가자 화면과 동일한 스피너 (`role="status"`, 테니스볼 lime 보더)
2. **C 승인 버튼 중복 방지** — `handleApproveRequest`(301행)에 busy 가드. 거절은 `confirm`이 사실상 차단하므로 제외. `handleAddParticipant`의 `addingParticipantRef` 패턴 재사용
3. **D 터치 타겟 확대** — `MatchCard.jsx` `▶️`/`🗑` 버튼 `px-2 py-1` → 44px 이상. 시작 버튼에 "시작" 텍스트 병기 검토
4. **F 경기 탭 진행 요약** — `🎾 경기 (N개)` → `예정 N · LIVE N · 종료 N` breakdown 추가
5. **E 미배정 요약/필터** — 코트 탭 상단에 "미배정 N경기" 배지 + 필터 토글
6. **A 확인 모달** — `window.confirm` 7곳 → 공통 `ConfirmDialog` 교체. E2E `dialog` 핸들러 수정 동반이므로 별도 Step으로 분리 검토

상태: B·C·D·F·E 완료 (2026-09-21) — A(확인 모달)는 별도 Step으로 분리

## STEP 19: UX 개선 — 화면별 작은 개선 (완료)

### 적용 완료
- 1번 참가자 입장 화면: 검색 전에 "뭐 하는 화면인지" 바로 보이도록 서브타이틀/안내 문구 정리 (2026-09-21 반영) — `ParticipantTabs.jsx` `EnterScreen`에 안내 문구 추가
- 2번 날짜 표기 정렬 (2026-09-21 반영): 입장 화면 날짜 `MM/DD` 0패딩 통일 (`ParticipantTabs.jsx` `formatDate`) — 대회상세 `MM/DD (요일)`은 유지. 숫자 자릿수만 맞춰 화면 간 어색함 완화
- 3번 대진 볼드: 코드 확인 결과 이미 충족 — 라운드 헤더·그룹 헤더·순위/득실·승자 행에 `font-bold`/`font-semibold` 적용됨 (`TournamentBracket.jsx`) → 추가 변경 없음
- 4번 대기열 테이블 full-width: 코드 확인 결과 유일한 `<table>`인 조별 상세 순위표가 이미 `w-full` (`TournamentBracket.jsx:232`, 카드 내 `overflow-hidden`) → 추가 변경 없음
- 5번 제안사항 손질: 코드에 "제안" 관련 텍스트 없음, 참가 신청 흐름은 `ParticipantHome.jsx` `ApplyForm`·신청 버튼 문구로 이미 정리됨 → 추가 변경 없음
- 각 변경 후 vite + puppeteer로 최소 회귀 확인, 푸시·배포·문서화

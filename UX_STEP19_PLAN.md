
## STEP 19: UX 개선 — 화면별 작은 개선 (진행 중)

### 적용 완료
- 1번 참가자 입장 화면: 검색 전에 "뭐 하는 화면인지" 바로 보이도록 서브타이틀/안내 문구 정리 (2026-09-21 반영) — `ParticipantTabs.jsx` `EnterScreen`에 안내 문구 추가
- 2번 날짜 표기 정렬 (2026-09-21 반영): 입장 화면 날짜 `MM/DD` 0패딩 통일 (`ParticipantTabs.jsx` `formatDate`) — 대회상세 `MM/DD (요일)`은 유지. 숫자 자릿수만 맞춰 화면 간 어색함 완화
- 3번 대진 볼드: 코드 확인 결과 이미 충족 — 라운드 헤더·그룹 헤더·순위/득실·승자 행에 `font-bold`/`font-semibold` 적용됨 (`TournamentBracket.jsx`) → 추가 변경 없음
- 4번 대기열 테이블 full-width: 코드 확인 결과 유일한 `<table>`인 조별 상세 순위표가 이미 `w-full` (`TournamentBracket.jsx:232`, 카드 내 `overflow-hidden`) → 추가 변경 없음
- 5번 제안사항 손질: 코드에 "제안" 관련 텍스트 없음, 참가 신청 흐름은 `ParticipantHome.jsx` `ApplyForm`·신청 버튼 문구로 이미 정리됨 → 추가 변경 없음
- 각 변경 후 vite + puppeteer로 최소 회귀 확인, 푸시·배포·문서화

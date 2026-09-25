# D1 데이터베이스 백업 · 복구 (Step 26.3)

> 대상: 운영 D1 `tennis_db` (database_id `14e9c01c-a2ea-4227-ace1-6039fa3b94f6`)
> 계정·대회·참가자·경기·신청·감사 로그가 모두 이 DB에만 있으므로, **백업이 유일한 복구 수단**이다.

## 1. 백업 (Export)

```bash
cd /Users/chris/workspace/tennis_tournament_worker
npm run db:export        # → backups/tennis_db_YYYYmmdd_HHMMSS.sql
```

동일한 명령을 직접 실행할 수도 있다.

```bash
mkdir -p backups
npx wrangler d1 export tennis_db --remote --output "backups/tennis_db_$(date +%Y%m%d_%H%M%S).sql"
```

- `--remote` 를 빼면 **로컬** D1만 내보내므로 운영 백업이 아니다. 반드시 `--remote` 사용.
- 결과는 `CREATE TABLE` + `INSERT` 형태의 SQL 텍스트다. 텍스트로 읽히므로 파일 자체에 개인정보(이름·이메일·비밀번호 해시)가 포함된다 → **외부 공유·커밋 금지**.
- `backups/` 는 `.gitignore` 에 포함되어 있다.

### 권장 주기

| 시점 | 시점 | 비고 |
|---|---|---|
| 대회 직전 | 필수 | 참가자 등록 마감 후 |
| 대회 종료 후 | 필수 | 결과 확정 후 |
| 정기 | 주 1회 | 대회가 없는 주에도 1회 |
| 스키마 변경(마이그레이션) 직전 | 필수 | 되돌릴 수 없는 변경 대비 |

보관은 **최근 4주 + 주요 대회 시점** 스냅샷을 유지하고, 그보다 오래된 파일은 별도 저장소(개인 클라우드/외장)로 옮긴 뒤 삭제한다.

## 2. 복구 (Import)

복구는 **되돌릴 수 없는 작업**이므로 반드시 순서대로 진행한다.

1. 현재 상태를 먼저 백업한다(위 1번). 실패 시 이 파일로 되돌린다.
2. 필요한 경우에만 실행하고, 실행 전 스키마 상태를 확인한다.

```bash
# (a) 스키마만 재적용이 필요한 경우 — 마이그레이션 기준
npm run db:migrate:remote

# (b) 백업 SQL 을 그대로 재적용 (동일 스키마에 데이터 복원)
npx wrangler d1 execute tennis_db --remote --file backups/tennis_db_20260925_120000.sql
```

3. 복구 후 반드시 확인한다.

```bash
npx wrangler d1 execute tennis_db --remote --command \
  "select 'users' k, count(*) c from users union all select 'tournaments', count(*) from tournaments union all select 'participants', count(*) from participants union all select 'matches', count(*) from matches"
curl -fsS https://tennis-tournament.jplee.workers.dev/health
```

### 부분 복구 (특정 테이블만)

백업 SQL 에서 필요한 `INSERT` 문만 추려 `--command` 또는 임시 `.sql` 파일로 실행한다. 외래키 순서(부모 → 자식)를 지켜야 하며, 삭제가 필요하면 자식 테이블부터 지운다.

- 삭제 순서 예: `registration_requests` → `matches`/`groups`/`teams`/`participants`/`notices`/`scoring_rules` → `tournaments` → `organizers` → `users`
- `registration_requests.tournamentId` 는 `ON DELETE NO ACTION` 이므로 대회 삭제 전에 반드시 먼저 지운다.

## 3. 주의사항

- **시크릿은 백업 대상이 아니다.** `JWT_SECRET`, `SUPERADMIN_IDS` 등은 Cloudflare Secret 이므로 별도로 보관해야 한다. 시크릿을 분실하면 기존 토큰이 모두 무효화되고 재설정이 필요하다.
- 백업 파일에는 `passwordHash`(PBKDF2)가 들어 있다. 평문은 아니지만 **유출 시 위험**하므로 취급에 주의한다.
- `wrangler d1 export` 는 대용량에서 시간이 걸릴 수 있으며, 실행 중 쓰기(경기 입력)가 있으면 시점 차이가 생긴다. 대회 진행 중에는 가급적 피한다.
- 복구는 가능하면 **비수기(대회 없음)에** 수행한다.

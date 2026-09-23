/**
 * 비밀번호 재설정 도구 (로컬 운영자 전용)
 *
 * 로그인 비밀번호를 잊었을 때, DB에 저장된 PBKDF2 해시를 직접 새로 만들어 넣는다.
 * 해시 형식은 worker의 lib/auth.ts hashPassword()와 동일해야 한다:
 *   pbkdf2$<iterations>$<saltHex>$<hashHex>  (PBKDF2-SHA256, 100000회, 256비트, salt 16바이트)
 *
 * 사용법:
 *   node scripts/reset_password.mjs <email> <newPassword>              # 로컬 D1
 *   node scripts/reset_password.mjs <email> <newPassword> --remote     # 운영 D1
 */
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const PBKDF2_ITERATIONS = 100_000;

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const [emailArg, passwordArg, ...flags] = process.argv.slice(2);
const remote = flags.includes('--remote');

if (!emailArg || !passwordArg) {
  console.error('사용법: node scripts/reset_password.mjs <email> <newPassword> [--remote]');
  process.exit(1);
}
if (passwordArg.length < 8) {
  console.error('비밀번호는 8자 이상이어야 합니다 (서버 검증 규칙과 동일)');
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const passwordHash = hashPassword(passwordArg);

const d1Args = ['wrangler', 'd1', 'execute', 'tennis_db', remote ? '--remote' : '--local'];

// 1) 대상 계정 확인
const findSql = `select id, name, email, role from users where email = '${email.replace(/'/g, "''")}'`;
const found = JSON.parse(
  execFileSync('npx', [...d1Args, '--json', '--command', findSql], { encoding: 'utf8' })
)[0].results;

if (found.length === 0) {
  console.error(`계정을 찾을 수 없습니다: ${email}`);
  process.exit(1);
}
const user = found[0];
console.log(`대상 계정: id=${user.id} name=${user.name} role=${user.role} (${remote ? '운영' : '로컬'} DB)`);

// 2) 해시 교체
const updateSql = `update users set passwordHash = '${passwordHash}', updatedAt = datetime('now') where id = ${user.id}`;
execFileSync('npx', [...d1Args, '--command', updateSql], { encoding: 'utf8' });
console.log(`✅ ${email} 비밀번호를 재설정했습니다. 새 비밀번호로 로그인하세요.`);

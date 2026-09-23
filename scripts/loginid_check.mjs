const API = 'http://127.0.0.1:8787';
const ts = Date.now();
const post = async (p, body) => {
  const r = await fetch(API + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK  ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' ' + extra); }
};

// S-27: 짧은 ID 가입/로그인 + 기존 이메일 흐름 회귀 확인
// 1) 짧은 ID 가입 성공
const reg = await post('/auth/register', { name: '짧은ID', email: `chris${ts % 100000}`, password: 'Secret123#', role: 'organizer' });
check('짧은 ID 가입 201', reg.status === 201, 'status=' + reg.status + ' ' + JSON.stringify(reg.body));
const sid = reg.body?.user?.email;
console.log('  가입된 식별자:', sid);

// 2) 짧은 ID 로그인 성공
const login = await post('/auth/login', { email: sid, password: 'Secret123#' });
check('짧은 ID 로그인 200', login.status === 200 && !!login.body?.token, 'status=' + login.status);
const token = login.body?.token;

// 3) 비밀번호 재설정 API 성공 (이름+식별자 일치)
const reset = await post('/auth/reset-password', { name: '짧은ID', email: sid, newPassword: 'NewPass456#' });
check('비밀번호 재설정 200', reset.status === 200, 'status=' + reset.status + ' ' + JSON.stringify(reset.body));

// 4) 새 비밀번호로 로그인 성공 / 기존 비밀번호 실패
const relogin = await post('/auth/login', { email: sid, password: 'NewPass456#' });
check('새 비밀번호 로그인 200', relogin.status === 200, 'status=' + relogin.status);
const oldlogin = await post('/auth/login', { email: sid, password: 'Secret123#' });
check('기존 비밀번호 로그인 401', oldlogin.status === 401, 'status=' + oldlogin.status);

// 5) 이름 불일치 → 404
const badname = await post('/auth/reset-password', { name: '틀린이름', email: sid, newPassword: 'Xyz12345#' });
check('이름 불일치 재설정 404', badname.status === 404, 'status=' + badname.status);

// 6) 이메일 형식 깨짐(@ 포함인데 도메인 없음) → 400, DB 조회 없음
const badfmt = await post('/auth/login', { email: 'not-an-email@', password: 'x' });
check('깨진 이메일 로그인 400', badfmt.status === 400, 'status=' + badfmt.status);

// 7) 공백/한 글자 ID 가입 거부
const badid = await post('/auth/register', { name: 'X', email: 'a', password: 'Secret123#', role: 'organizer' });
check('한 글자 ID 가입 400', badid.status === 400, 'status=' + badid.status);

// 8) 기존 이메일 흐름 회귀 확인 (가입→로그인)
const emailUser = `regress_${ts}@test.com`;
const r2 = await post('/auth/register', { name: '회귀', email: emailUser, password: 'Secret123#', role: 'organizer' });
check('이메일 가입 201', r2.status === 201);
check('이메일 소문자 정규화', r2.body?.user?.email === emailUser.toLowerCase());
const l2 = await post('/auth/login', { email: emailUser.toUpperCase(), password: 'Secret123#' });
check('이메일 대문자 로그인 200', l2.status === 200, 'status=' + l2.status);
const dup = await post('/auth/register', { name: '중복', email: emailUser, password: 'Secret123#', role: 'organizer' });
check('이메일 중복 409', dup.status === 409, 'status=' + dup.status);

console.log(`\n===== 결과: ${pass} pass / ${fail} fail =====`);
process.exit(fail ? 1 : 0);

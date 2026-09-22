const API = process.env.API || 'http://127.0.0.1:8787';
const post = async (p, body, token) => {
  const r = await fetch(API + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const del = async (p, token) => {
  const r = await fetch(API + p, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK  ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' ' + extra); }
};

// role='user' 계정이 SUPERADMIN_IDS에 포함되면 운영자 권한까지 얻는지 검증
const email = process.env.SUPER_ADMIN_EMAIL;
const login = await post('/auth/login', { email, password: process.env.SUPER_ADMIN_PW || 'Secret123#' });
check('role=user 최고관리자 로그인', login.status === 200 && login.body?.user?.role === 'user', JSON.stringify(login.body?.user));
check('isSuperAdmin=true 반환', login.body?.user?.isSuperAdmin === true, JSON.stringify(login.body?.user));

const token = login.body?.token;
if (token) {
  // role=user 이지만 최고관리자 → 대회 생성(운영자 전용) 통과해야 함
  const created = await post('/tournaments', { name: `일반역할최고관리자_${Date.now()}`, maxParticipants: 8 }, token);
  check('role=user 최고관리자 대회 생성 통과', created.status === 201, 'status=' + created.status + ' ' + JSON.stringify(created.body));
  if (created.body?.id) {
    const removed = await del(`/tournaments/${created.body.id}`, token);
    check('생성한 대회 정리 삭제', removed.status === 200);
  }
  // 소유자 아님 대회 삭제도 가능해야 함 (기존 85가 만든 대회 대신, 새로 만든 타 대회)
  const other = await post('/auth/register', { name: '타주최', email: `other_${Date.now()}@test.com`, password: 'Secret123#', role: 'organizer' });
  const otherT = await post('/tournaments', { name: `타대회_${Date.now()}`, maxParticipants: 8 }, other.body?.token);
  const otherDel = await del(`/tournaments/${otherT.body?.id}`, token);
  check('타 주최 대회 삭제 성공', otherDel.status === 200, 'status=' + otherDel.status);
}

console.log(`\n===== 결과: ${pass} pass / ${fail} fail =====`);
process.exit(fail ? 1 : 0);

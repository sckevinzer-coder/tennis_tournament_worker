const API = process.env.API || 'http://127.0.0.1:8787';
const ts = Date.now();
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
const reg = (name, email, role = 'organizer') =>
  post('/auth/register', { name, email, password: 'Secret123#', role });

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK  ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' ' + extra); }
};

// 1) 주최자 A 등록 → 대회 생성
const a = await reg('검증A', `sup_a_${ts}@test.com`);
check('주최자 A 등록', a.status === 201, JSON.stringify(a.body));
const aToken = a.body.token;
const created = await post('/tournaments', { name: `검증대회_${ts}`, maxParticipants: 8 }, aToken);
check('A가 대회 생성', created.status === 201, JSON.stringify(created.body));
const tId = created.body?.id;

// 2) 비소유 주최자 B 삭제 시도 → 403 기대 (최고관리자 아님)
const b = await reg('검증B', `sup_b_${ts}@test.com`);
check('주최자 B 등록', b.status === 201);
const bToken = b.body.token;
const bDel = await del(`/tournaments/${tId}`, bToken);
check('비소유 주최자 삭제 차단(403)', bDel.status === 403, 'status=' + bDel.status);

// 3) 최고관리자 계정 로그인 → isSuperAdmin 확인 → 타 주최 대회 삭제 성공 기대
const supEmail = process.env.SUPER_ADMIN_EMAIL;
const supPw = process.env.SUPER_ADMIN_PW || 'Secret123#';
if (supEmail) {
  const loginRes = await post('/auth/login', { email: supEmail, password: supPw });
  check('최고관리자 로그인 + isSuperAdmin=true', loginRes.status === 200 && loginRes.body?.user?.isSuperAdmin === true,
    'status=' + loginRes.status + ' user=' + JSON.stringify(loginRes.body?.user));
  const supToken = loginRes.body?.token;
  if (supToken) {
    // 최고관리자도 자기 대회가 아닌 대회를 관리(참가자 추가)할 수 있어야 함
    const addP = await post('/participants', { name: '최고관리자등록선수', tournamentId: tId }, supToken);
    check('최고관리자가 타 주최 대회에 참가자 등록', addP.status === 201, 'status=' + addP.status + ' ' + JSON.stringify(addP.body));
    // 매치 생성(조 편성 없음) → 400 이지만 403이 아니어야 소유권 통과
    const gen = await post(`/tournaments/${tId}/generate-matches`, {}, supToken);
    check('최고관리자 매치 생성 권한 통과(403 아님)', gen.status !== 403, 'status=' + gen.status);
    const supDel = await del(`/tournaments/${tId}`, supToken);
    check('최고관리자가 타 주최 대회 삭제 성공', supDel.status === 200, 'status=' + supDel.status + ' ' + JSON.stringify(supDel.body));
  }
  // 4) 비최고관리자는 여전히 차단 (삭제 이후 404 가능하므로 별도 대회로 확인)
  const t2 = await post('/tournaments', { name: `검증대회2_${ts}`, maxParticipants: 8 }, aToken);
  const cDel = await del(`/tournaments/${t2.body?.id}`, bToken);
  check('일반 주최자 차단 유지(403)', cDel.status === 403, 'status=' + cDel.status);
}

console.log(`\n===== 결과: ${pass} pass / ${fail} fail =====`);
process.exit(fail ? 1 : 0);

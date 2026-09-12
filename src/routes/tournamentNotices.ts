// 공지사항 — 기존 noticeController 이전
// - GET /tournaments/:id/notices (비회원 조회 허용)
// - POST /tournaments/:id/notices (운영자)
// - DELETE /notices/:id (운영자) — 원본은 /tournaments 라우터에 '/notices/:id'로 마운트
import { eq, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import { tournaments, notices } from '../db/schema'
import { tournamentApi } from './tournaments'
import { requireTournamentOwner } from '../lib/ownership'

// GET /tournaments/:id/notices — 목록
tournamentApi.get('/:id/notices', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id)).limit(1)
  if (!t) return c.json({ message: 'Tournament not found' }, 404)
  const list = await db.select().from(notices)
    .where(eq(notices.tournamentId, id))
    .orderBy(desc(notices.createdAt))
  return c.json(list)
})

// POST /tournaments/:id/notices — 작성 (운영자)
tournamentApi.post('/:id/notices', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) return c.json({ message: '유효하지 않은 대회 ID' }, 400)
  // S-06: 본인 대회에만 공지 작성 가능 (IDOR 방지)
  const ownNotice = await requireTournamentOwner(db, c.get('userId'), id)
  if (!ownNotice.ok) return c.json({ message: ownNotice.message }, ownNotice.status)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  if (!body.title || !String(body.title).trim()) return c.json({ message: 'title is required' }, 400)
  const [n] = await db.insert(notices).values({
    tournamentId: id,
    title: String(body.title).trim(),
    content: body.content != null ? String(body.content) : null,
  } as never).returning()
  return c.json(n, 201)
})

// DELETE /tournaments/notices/:id — 삭제 (운영자, 원본 마운트 경로 유지)
tournamentApi.delete('/notices/:id', async (c) => {
  if (c.get('role') !== 'organizer') return c.json({ message: '운영자 인증이 필요합니다' }, 401)
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const [n] = await db.select().from(notices).where(eq(notices.id, id)).limit(1)
  if (!n) return c.json({ message: 'Notice not found' }, 404)
  // S-06: 부모 대회의 소유자만 삭제 가능 (IDOR 방지)
  const ownNoticeDel = await requireTournamentOwner(db, c.get('userId'), n.tournamentId)
  if (!ownNoticeDel.ok) return c.json({ message: ownNoticeDel.message }, ownNoticeDel.status)
  await db.delete(notices).where(eq(notices.id, id))
  return c.json({ message: 'Notice deleted' })
})

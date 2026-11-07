import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { ACTIONABLE_COMMENT_STATUSES, countActionableComments } from '../src/queries/inbox';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * FR-005 "số cần xử lý" của bộ chuyển workspace: bình luận chưa xóa/chưa gộp ở trạng thái new, processing,
 * pending_review, needs_human, send_failed — đếm trong `withActor` của từng workspace (RLS: chỉ thành viên đang hoạt động).
 */
let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let member: string;
let stranger: string;
let channelA: string;
let postA: string;

async function comment(status: string): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, text, status)
     VALUES ('webhook', $1, $2, $3, $4, 'u1', 'nội dung', $5) RETURNING id`,
    [wsA, channelA, postA, `cm-${randomUUID()}`, status],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  member = await seedUser(admin, 'count-member');
  stranger = await seedUser(admin, 'count-stranger');
  await seedMember(admin, wsA, member, 'staff');
  const ch = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [wsA, `ext-${randomUUID()}`],
  );
  channelA = ch.rows[0].id;
  const p = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
    [wsA, channelA, `post-${randomUUID()}`],
  );
  postA = p.rows[0].id;
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

const count = (who: string, ws: string, asWs: string = ws) =>
  db.withActor(asWs, who, (tx) => countActionableComments(tx, ws));

describe('FR-005 số cần xử lý theo workspace', () => {
  it('FR-005 workspace chưa có bình luận → 0', async () => {
    expect(await count(member, wsA)).toBe(0);
  });

  it('FR-005 chỉ đếm new/processing/pending_review/needs_human/send_failed', async () => {
    expect([...ACTIONABLE_COMMENT_STATUSES].sort()).toEqual(
      ['needs_human', 'new', 'pending_review', 'processing', 'send_failed'].sort(),
    );
    for (const status of ACTIONABLE_COMMENT_STATUSES) await comment(status);
    for (const status of [
      'scheduled_auto',
      'sending',
      'auto_replied',
      'spam_suspected',
      'replied',
      'hidden',
      'skipped',
    ]) {
      await comment(status);
    }
    expect(await count(member, wsA)).toBe(ACTIONABLE_COMMENT_STATUSES.length);
  });

  it('FR-005 không đếm bình luận đã xóa (deleted_at) hoặc đã gộp (merged_into_id)', async () => {
    const before = await count(member, wsA);
    const deleted = await comment('pending_review');
    await admin.query('UPDATE cf.comments SET deleted_at = now() WHERE id = $1', [deleted]);
    const target = await comment('replied');
    const merged = await comment('new');
    await admin.query('UPDATE cf.comments SET merged_into_id = $2 WHERE id = $1', [merged, target]);
    expect(await count(member, wsA)).toBe(before);
  });

  it('FR-005 người không phải thành viên → 0; workspace khác trong ngữ cảnh → 0 (RLS)', async () => {
    expect(await count(stranger, wsA)).toBe(0);
    expect(await count(member, wsA, wsB)).toBe(0);
  });
});

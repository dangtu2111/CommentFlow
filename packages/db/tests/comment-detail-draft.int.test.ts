import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { getCommentDetail } from '../src/queries/comment-detail';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * PIPE-ORCHESTRATOR lát F (FR-043, Q-POR11): chi tiết bình luận hiện bản nháp AI MỚI NHẤT (bản cũ, kể cả "Cần nhân viên", giữ làm lịch sử),
 * tên nguồn của bản nháp, trạng thái khóa lượt; cô lập workspace.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let staff: string;
let channel: string;
let post: string;
let productId: string;

async function comment(over: { status?: string } = {}): Promise<string> {
  return (
    await admin.query(
      `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source)
       VALUES ($1, $2, $3, $4, 'u1', 'giá bao nhiêu', $5, 'webhook') RETURNING id`,
      [ws, channel, post, `cm-${randomUUID()}`, over.status ?? 'new'],
    )
  ).rows[0].id as string;
}

async function draft(
  commentId: string,
  d: {
    text: string;
    action: string;
    needsHuman?: boolean;
    reason?: string;
    sources?: string[];
    at: Date;
  },
) {
  await admin.query(
    `INSERT INTO cf.drafts (workspace_id, target_type, target_id, text, lang, action, needs_human, reason, sources, created_at)
     VALUES ($1, 'comment', $2, $3, 'vi', $4, $5, $6, $7::jsonb, $8)`,
    [
      ws,
      commentId,
      d.text,
      d.action,
      d.needsHuman ?? false,
      d.reason ?? null,
      JSON.stringify(d.sources ?? []),
      d.at,
    ],
  );
}

const detail = (id: string, workspace = ws) =>
  db.withActor(workspace, staff, (tx) => getCommentDetail(tx, workspace, id, staff));

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  staff = await seedUser(admin, 'detailStaff');
  await seedMember(admin, ws, staff, 'staff');
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [ws, channel, `post-${randomUUID()}`],
    )
  ).rows[0].id;
  productId = (
    await admin.query(
      "INSERT INTO cf.products (workspace_id, name, search_text) VALUES ($1, 'Áo thun basic', 'ao thun basic') RETURNING id",
      [ws],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('chi tiết bình luận — bản nháp AI mới nhất', () => {
  it('chưa có bản nháp → suggestion/aiDraft/aiTurnState đều null', async () => {
    const d = await detail(await comment());
    expect(d).toMatchObject({ suggestion: null, aiDraft: null, aiTurnState: null });
  });

  it('có nhiều bản nháp → chỉ hiện bản MỚI NHẤT; bản cũ "Cần nhân viên" vẫn nằm trong DB làm lịch sử (Q-POR11)', async () => {
    const id = await comment({ status: 'needs_human' });
    await draft(id, {
      text: 'Cần nhân viên xem câu này.',
      action: 'handoff',
      needsHuman: true,
      reason: 'quota_exhausted',
      at: new Date(Date.now() - 3600_000),
    });
    await draft(id, {
      text: 'Dạ áo thun basic giá 150.000đ ạ',
      action: 'answer',
      sources: [productId],
      at: new Date(),
    });
    const d = await detail(id);
    expect(d?.suggestion).toMatchObject({
      text: 'Dạ áo thun basic giá 150.000đ ạ',
      needsHuman: false,
      sourceIds: [productId],
      sourceTitles: { [productId]: 'Áo thun basic' },
    });
    expect(d?.aiDraft).toMatchObject({ action: 'answer', reason: null });
    const history = await admin.query('SELECT count(*) n FROM cf.drafts WHERE target_id = $1', [
      id,
    ]);
    expect(Number(history.rows[0].n)).toBe(2);
  });

  it('bản nháp "Cần nhân viên" mới nhất → không phải câu gợi ý, vẫn có lý do + trạng thái khóa lượt', async () => {
    const id = await comment({ status: 'needs_human' });
    await draft(id, {
      text: 'Cần nhân viên xem câu này.',
      action: 'handoff',
      needsHuman: true,
      reason: 'customer_post_reply_cap',
      at: new Date(),
    });
    await admin.query(
      "INSERT INTO cf.pipeline_turns (workspace_id, comment_id, state, attempts) VALUES ($1, $2, 'blocked', 1)",
      [ws, id],
    );
    const d = await detail(id);
    // Bản "Cần nhân viên" là chỗ giữ chỗ: KHÔNG thành câu gợi ý (không đưa vào ô soạn); lý do hiện qua aiDraft.
    expect(d?.suggestion).toBeNull();
    expect(d?.aiDraft).toMatchObject({ action: 'handoff', reason: 'customer_post_reply_cap' });
    expect(d?.aiTurnState).toBe('blocked');
  });

  it('nguồn kiểu kb:<uuid> được tra tên đoạn kiến thức; nguồn không tra được không có tên (giao diện dùng nhãn chung)', async () => {
    const src = (
      await admin.query(
        "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'Ship') RETURNING id",
        [ws],
      )
    ).rows[0].id;
    const ver = (
      await admin.query(
        'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
        [ws],
      )
    ).rows[0].id;
    const chunk = (
      await admin.query(
        `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft, context_header)
         VALUES ($1, $2, $3, 'ship', 'Phí ship 20.000đ', 'vi', 'h', false, 'Phí vận chuyển') RETURNING id`,
        [ws, src, ver],
      )
    ).rows[0].id;
    const id = await comment();
    await draft(id, {
      text: 'Ship 20.000đ ạ',
      action: 'answer',
      sources: [`kb:${chunk}`, 'policy.doi-tra'],
      at: new Date(),
    });
    const d = await detail(id);
    expect(d?.suggestion?.sourceTitles).toEqual({ [`kb:${chunk}`]: 'Phí vận chuyển' });
    expect(d?.suggestion?.sourceIds).toEqual([`kb:${chunk}`, 'policy.doi-tra']);
  });

  it('cô lập workspace: bình luận/bản nháp của workspace khác không thấy', async () => {
    const id = await comment();
    await draft(id, { text: 'bí mật', action: 'answer', at: new Date() });
    expect(
      await db.withActor(other, staff, (tx) => getCommentDetail(tx, other, id, staff)),
    ).toBeNull();
  });
});

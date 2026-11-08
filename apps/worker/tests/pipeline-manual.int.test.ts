import { randomUUID } from 'node:crypto';
import { createFixtureDrafter, createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '@flow/ai';
import { createDb, type FlowDb } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type PipelineJobConfig, runPipelineJob } from '../src/jobs/pipeline-job';

/**
 * PIPE-ORCHESTRATOR lát F (Q-POR8, Q-POR11): đường CHẠY LẠI THỦ CÔNG của "Soạn gợi ý" trên DB thật — đưa bình luận về trạng thái xử lý được,
 * vẫn qua cổng dừng khẩn cấp/hạn mức (chưa trừ → trừ, đã trừ → KHÔNG trừ thêm), ghi `action_logs` ai bấm, tạo bản nháp MỚI dù đã có bản
 * "Cần nhân viên" cũ (bản cũ giữ làm lịch sử); đường tự động vẫn idempotent.
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let channel: string;
let post: string;
let staff: string;
let outsider: string;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 6 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 3 });
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

beforeEach(async () => {
  ws = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop thủ công',
    `shop-${ws}`,
  ]);
  const mkUser = async (name: string) =>
    (
      await admin.query('INSERT INTO core.users (email, name) VALUES ($1, $2) RETURNING id', [
        `${name}-${randomUUID()}@example.test`,
        name,
      ])
    ).rows[0].id as string;
  staff = await mkUser('nv');
  outsider = await mkUser('ngoai');
  await admin.query(
    "INSERT INTO core.members (workspace_id, user_id, role, status) VALUES ($1, $2, 'staff', 'active')",
    [ws, staff],
  );
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Trang') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [ws, channel, `post-${randomUUID()}`],
    )
  ).rows[0].id;
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
  await admin.query(
    `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft)
     VALUES ($1, $2, $3, 'ship', 'Phí ship nội thành 20.000đ, giao trong 2 ngày', 'vi', 'h-ship', false)`,
    [ws, src, ver],
  );
});

const config = (limit = 100): PipelineJobConfig => ({
  db,
  llm: {
    extractor: createFixtureExtractor([
      {
        match: /./,
        result: { ...FIXTURE_EXTRACT_DEFAULT, labels: [{ label: 'advice' }], asks: ['phí ship'] },
      },
    ]),
    drafter: createFixtureDrafter([
      {
        match: /./,
        result: {
          reply: 'Phí ship nội thành 20.000đ ạ',
          lang: 'vi',
          sources: [],
          claims: [],
          unanswered_topics: [],
          needs_human: false,
          reason: '',
          variants: [],
        },
      },
    ]),
  },
  pipelineEnabled: async () => true,
  turnLimit: limit,
});

async function addComment(source: 'webhook' | 'backfill', status = 'new'): Promise<string> {
  return (
    await admin.query(
      `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source)
       VALUES ($1, $2, $3, $4, $5, 'ship nội thành bao nhiêu', $6, $7) RETURNING id`,
      [ws, channel, post, `cm-${randomUUID()}`, `u-${randomUUID()}`, status, source],
    )
  ).rows[0].id as string;
}

const manual = (id: string, by = staff, limit = 100) =>
  runPipelineJob(config(limit), {
    workspaceId: ws,
    commentId: id,
    trigger: 'manual',
    requestedBy: by,
  });
const auto = (id: string, limit = 100) =>
  runPipelineJob(config(limit), { workspaceId: ws, commentId: id, trigger: 'auto' });
const drafts = async (id: string) =>
  (
    await admin.query(
      'SELECT action, reason, needs_human FROM cf.drafts WHERE target_id = $1 ORDER BY created_at, id',
      [id],
    )
  ).rows;
const statusOf = async (id: string) =>
  (await admin.query('SELECT status FROM cf.comments WHERE id = $1', [id])).rows[0]
    .status as string;
const used = async () =>
  Number(
    (
      await admin.query(
        'SELECT coalesce(sum(used),0) n FROM core.usage_counters WHERE workspace_id = $1',
        [ws],
      )
    ).rows[0].n,
  );
const logs = async (id: string) =>
  (
    await admin.query(
      "SELECT actor_type, on_behalf_of, after FROM core.action_logs WHERE workspace_id = $1 AND action = 'comment.ai_rerun_requested' AND target_id = $2",
      [ws, id],
    )
  ).rows;

describe('"Soạn gợi ý" — chạy lại thủ công', () => {
  it('bình luận backfill chưa có nháp: nhân viên bấm → ra bản nháp, trừ 1 lượt, ghi action_logs (ai bấm)', async () => {
    const id = await addComment('backfill');
    expect((await auto(id)).kind).toBe('ignored'); // tự động không chạy backfill (FR-011)
    expect((await manual(id)).kind).toBe('written');
    expect(await drafts(id)).toHaveLength(1);
    expect(await used()).toBe(1);
    const [log] = await logs(id);
    expect(log).toMatchObject({ actor_type: 'system', on_behalf_of: staff });
    expect(log.after).toMatchObject({ previous_status: 'new', requested_by: staff });
  });

  it('needs_human do HẾT LƯỢT: sau khi có lượt, bấm lại → bản nháp MỚI, bản "Cần nhân viên" cũ giữ làm lịch sử; chưa trừ thì trừ', async () => {
    const id = await addComment('webhook');
    expect((await auto(id, 0)).kind).toBe('handoff'); // hạn mức 0
    expect(await statusOf(id)).toBe('needs_human');
    expect(await used()).toBe(0);
    expect(await drafts(id)).toEqual([
      { action: 'handoff', reason: 'quota_exhausted', needs_human: true },
    ]);

    expect((await manual(id, staff, 100)).kind).toBe('written');
    const all = await drafts(id);
    expect(all).toHaveLength(2); // cũ giữ nguyên + MỚI
    expect(all[0]).toMatchObject({ action: 'handoff', reason: 'quota_exhausted' });
    expect(all[1]?.action).not.toBe('handoff');
    expect(await statusOf(id)).not.toBe('needs_human');
    expect(await used()).toBe(1); // chưa trừ trước đó nên trừ lần này
    expect((await logs(id))[0]?.after).toMatchObject({
      previous_status: 'needs_human',
      previous_reason: 'quota_exhausted',
    });
  });

  it('ĐÃ TRỪ lượt rồi mà vẫn needs_human (AI lỗi/hết lần thử) → bấm lại KHÔNG trừ thêm', async () => {
    const id = await addComment('webhook');
    expect((await auto(id)).kind).toBe('written');
    expect(await used()).toBe(1);
    // Mô phỏng: bình luận bị chuyển needs_human sau đó (vd. lỗi gửi/nhân viên đặt), khóa lượt đã `charged_at`.
    await admin.query("UPDATE cf.comments SET status = 'needs_human' WHERE id = $1", [id]);
    await admin.query("UPDATE cf.pipeline_turns SET state = 'failed' WHERE comment_id = $1", [id]);
    expect((await manual(id)).kind).toBe('written');
    expect(await used()).toBe(1); // KHÔNG trừ lần hai
    expect(await drafts(id)).toHaveLength(2);
  });

  it('chạy lại thủ công mà lại bị chặn (hết lượt) → vẫn ghi bản "Cần nhân viên" MỚI; chạy lặp lại cùng lượt không nhân đôi', async () => {
    const id = await addComment('webhook');
    await auto(id, 0);
    expect((await manual(id, staff, 0)).kind).toBe('handoff');
    expect(await drafts(id)).toHaveLength(2); // bản cũ + bản mới của lần chạy lại
    // Lượt tự động trùng ngay sau đó (đã rời `new`/đã có bản nháp từ mốc) không tạo thêm.
    await auto(id, 0);
    expect(await drafts(id)).toHaveLength(2);
  });

  it('đường TỰ ĐỘNG vẫn idempotent: cùng bình luận chạy tự động hai lần chỉ một bản nháp', async () => {
    const id = await addComment('webhook');
    await auto(id, 0);
    await auto(id, 0);
    expect(await drafts(id)).toHaveLength(1);
  });

  it('người yêu cầu KHÔNG phải thành viên đang hoạt động → bỏ qua, không đổi gì, không ghi log', async () => {
    const id = await addComment('webhook', 'needs_human');
    expect(await manual(id, outsider)).toEqual({ kind: 'ignored', reason: 'not_member' });
    await admin.query(
      "UPDATE core.members SET status = 'suspended' WHERE workspace_id = $1 AND user_id = $2",
      [ws, staff],
    );
    expect(await manual(id, staff)).toEqual({ kind: 'ignored', reason: 'not_member' });
    expect(await statusOf(id)).toBe('needs_human');
    expect(await logs(id)).toHaveLength(0);
    expect(await drafts(id)).toHaveLength(0);
  });

  it('thiếu requestedBy hoặc bình luận không ở new/needs_human → bỏ qua', async () => {
    const id = await addComment('webhook');
    const out = await runPipelineJob(config(), {
      workspaceId: ws,
      commentId: id,
      trigger: 'manual',
    });
    expect(out).toEqual({ kind: 'ignored', reason: 'missing_requester' });
    const pending = await addComment('webhook', 'pending_review');
    expect(await manual(pending)).toEqual({ kind: 'ignored', reason: 'not_eligible' });
    expect(await statusOf(pending)).toBe('pending_review');
    expect(await used()).toBe(0);
  });

  it('DỪNG KHẨN CẤP: bấm khi workspace đang dừng → vẫn qua cổng: không trừ lượt, không bản nháp; ghi log ai bấm', async () => {
    const id = await addComment('backfill');
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = now() WHERE id = $1', [
      ws,
    ]);
    expect(await manual(id)).toEqual({ kind: 'deferred', reason: 'emergency_stop' });
    expect(await used()).toBe(0);
    expect(await drafts(id)).toHaveLength(0);
    expect(await statusOf(id)).toBe('new');
    expect(await logs(id)).toHaveLength(1);
  });

  it('chống bấm đúp: lượt thứ hai ngay sau khi bình luận đã ra bản nháp thì không đủ điều kiện (không nhân đôi)', async () => {
    const id = await addComment('backfill');
    await manual(id);
    expect(await manual(id)).toEqual({ kind: 'ignored', reason: 'not_eligible' });
    expect(await drafts(id)).toHaveLength(1);
    expect(await used()).toBe(1);
  });
});

import { randomUUID } from 'node:crypto';
import {
  createDemoKnowledge,
  createFixtureDrafter,
  createFixtureExtractor,
  EXTRACT_UNREADABLE_MESSAGE,
  FIXTURE_EXTRACT_DEFAULT,
} from '@flow/ai';
import { createDb, type FlowDb } from '@flow/db';
import { AppError } from '@flow/shared';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type RunCommentConfig, runCommentPipeline } from '../src/jobs/pipeline-run';

/**
 * PIPE-ORCHESTRATOR lát D: chạy TRỌN một bình luận (cổng → pipeline → ghi) trên DB thật; mọi kết cục (Q-POR6/Q-POR7).
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let channel: string;
let post: string;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 8 });
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
    'Shop chạy',
    `shop-${ws}`,
  ]);
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'P') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [ws, channel, `post-${randomUUID()}`],
    )
  ).rows[0].id;
});

async function addComment(): Promise<string> {
  return (
    await admin.query(
      `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source)
       VALUES ($1, $2, $3, $4, 'u1', 'x', 'new', 'webhook') RETURNING id`,
      [ws, channel, post, `cm-${randomUUID()}`],
    )
  ).rows[0].id as string;
}

const REPLY = {
  reply: 'Phí ship nội thành 20.000đ ạ',
  lang: 'vi' as const,
  sources: ['demo-kb-ship'],
  claims: [{ text: 'Phí ship 20.000đ', source_ids: ['demo-kb-ship'], kind: 'fact' as const }],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
};

type Over = {
  text?: string;
  limit?: number;
  maxAttempts?: number;
  extractThrows?: Error;
  beforeDraft?: () => Promise<void>;
  afterExtract?: () => Promise<void>;
  consumeThrows?: boolean;
};

function config(commentId: string, over: Over = {}): RunCommentConfig {
  const extractor = createFixtureExtractor([
    {
      match: /./,
      result: { ...FIXTURE_EXTRACT_DEFAULT, labels: [{ label: 'advice' }], asks: ['phí ship'] },
    },
  ]);
  const drafter = createFixtureDrafter([{ match: /./, result: REPLY }]);
  return {
    db,
    workspaceId: ws,
    commentId,
    turn: {
      limit: over.limit ?? 100,
      timeZone: 'Asia/Ho_Chi_Minh',
      leaseSeconds: 5,
      ...(over.maxAttempts === undefined ? {} : { maxAttempts: over.maxAttempts }),
      ...(over.consumeThrows
        ? {
            consume: async () => {
              throw new Error('hạ tầng lỗi');
            },
          }
        : {}),
    },
    input: {
      workspaceId: ws,
      text: over.text ?? 'ship về Hà Nội bao nhiêu',
      kbVersion: 'v1',
      voice: { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' },
      autoSendEnabled: false,
    },
    deps: {
      extractor: {
        extract: async (i) => {
          if (over.extractThrows) throw over.extractThrows;
          const r = await extractor.extract(i);
          await over.afterExtract?.();
          return r;
        },
      },
      drafter: {
        draft: async (i) => {
          await over.beforeDraft?.();
          return drafter.draft(i);
        },
      },
      knowledge: createDemoKnowledge(),
    },
    persist: {
      commentId,
      kbVersionNumber: null,
      model: 'cf-draft',
      promptVersion: 'draft@4',
      traceId: null,
    },
  };
}

const statusOf = async (id: string) =>
  (await admin.query('SELECT status FROM cf.comments WHERE id = $1', [id])).rows[0]
    .status as string;
const drafts = async (id: string) =>
  (await admin.query('SELECT * FROM cf.drafts WHERE target_id = $1', [id])).rows;
const used = async () => {
  const r = await admin.query(
    "SELECT used FROM core.usage_counters WHERE workspace_id = $1 AND meter = 'ai_turns'",
    [ws],
  );
  return r.rows[0] ? Number(r.rows[0].used) : 0;
};

describe('runCommentPipeline — mọi kết cục', () => {
  it('đường vàng: ghi bản nháp, trừ ĐÚNG 1 lượt, bình luận ra khỏi processing', async () => {
    const id = await addComment();
    const out = await runCommentPipeline(config(id));
    expect(out.kind).toBe('written');
    expect(['pending_review', 'needs_human']).toContain(await statusOf(id));
    expect(await drafts(id)).toHaveLength(1);
    expect(await used()).toBe(1);
  });

  it('chạy TRÙNG sau khi đã xong → không bản nháp thứ hai, không trừ thêm', async () => {
    const id = await addComment();
    await runCommentPipeline(config(id));
    const again = await runCommentPipeline(config(id));
    expect(again.kind).toBe('deferred');
    expect(await drafts(id)).toHaveLength(1);
    expect(await used()).toBe(1);
  });

  it('hết hạn mức → "Cần nhân viên" lý do quota_exhausted, không trừ lượt, không gọi LLM', async () => {
    const id = await addComment();
    const out = await runCommentPipeline(config(id, { limit: 0 }));
    expect(out).toEqual({ kind: 'handoff', reason: 'quota_exhausted' });
    expect(await statusOf(id)).toBe('needs_human');
    const d = await drafts(id);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ needs_human: true, reason: 'quota_exhausted', action: 'handoff' });
    expect(await used()).toBe(0);
  });

  it('hết số lần thử → "Cần nhân viên" lý do attempts_exhausted', async () => {
    const id = await addComment();
    await admin.query("UPDATE cf.comments SET status = 'processing' WHERE id = $1", [id]);
    await admin.query(
      "INSERT INTO cf.pipeline_turns (workspace_id, comment_id, state, attempts, charged_at) VALUES ($1, $2, 'processing', 3, now())",
      [ws, id],
    );
    const out = await runCommentPipeline(config(id, { maxAttempts: 3 }));
    expect(out).toEqual({ kind: 'handoff', reason: 'attempts_exhausted' });
    expect(await statusOf(id)).toBe('needs_human');
    expect(await drafts(id)).toHaveLength(1);
  });

  it('AI trả đầu ra KHÔNG đọc được → "Cần nhân viên" ai_invalid_output, khóa failed (không kẹt, không ném vô hạn)', async () => {
    const id = await addComment();
    const out = await runCommentPipeline(
      config(id, { extractThrows: new AppError('LLM_UNAVAILABLE', EXTRACT_UNREADABLE_MESSAGE) }),
    );
    expect(out).toEqual({ kind: 'handoff', reason: 'ai_invalid_output' });
    expect(await statusOf(id)).toBe('needs_human');
    expect(await drafts(id)).toHaveLength(1);
    expect(
      (await admin.query('SELECT state FROM cf.pipeline_turns WHERE comment_id = $1', [id])).rows[0]
        .state,
    ).toBe('failed');
  });

  it('DỪNG KHẨN CẤP → không ghi gì, KHÔNG trừ lượt, bình luận GIỮ new (Q-POR7); bỏ dừng → xử lý tiếp', async () => {
    const id = await addComment();
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = now() WHERE id = $1', [
      ws,
    ]);
    expect(await runCommentPipeline(config(id))).toEqual({
      kind: 'deferred',
      reason: 'emergency_stop',
    });
    expect(await statusOf(id)).toBe('new');
    expect(await drafts(id)).toHaveLength(0);
    expect(await used()).toBe(0);
    expect(
      Number(
        (await admin.query('SELECT count(*) n FROM cf.pipeline_turns WHERE comment_id = $1', [id]))
          .rows[0].n,
      ),
    ).toBe(0);
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = NULL WHERE id = $1', [ws]);
    expect((await runCommentPipeline(config(id))).kind).toBe('written');
  });

  it('job khác đang giữ thuê → busy: không ghi, không trừ, không tăng lần thử', async () => {
    const id = await addComment();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let entered: () => void = () => {};
    const inDraft = new Promise<void>((r) => {
      entered = r;
    });
    const first = runCommentPipeline(
      config(id, {
        beforeDraft: async () => {
          entered();
          await gate;
        },
      }),
    );
    await inDraft;
    const second = await runCommentPipeline(config(id));
    expect(second).toEqual({ kind: 'deferred', reason: 'busy' });
    release();
    expect((await first).kind).toBe('written');
    expect(await drafts(id)).toHaveLength(1);
    expect(await used()).toBe(1);
  });

  it('bình luận chỉ có emoji → skipped: không giành quyền, không trừ lượt (FR-024)', async () => {
    const id = await addComment();
    const out = await runCommentPipeline(config(id, { text: '😍😍😍' }));
    expect(out.kind).toBe('skipped');
    expect(await statusOf(id)).toBe('new');
    expect(await used()).toBe(0);
  });

  it('cổng lỗi hạ tầng → NÉM để pg-boss thử lại (không nuốt lỗi), bình luận không bị đẩy sang needs_human', async () => {
    const id = await addComment();
    await expect(runCommentPipeline(config(id, { consumeThrows: true }))).rejects.toThrow();
    expect(await statusOf(id)).not.toBe('needs_human');
    expect(await drafts(id)).toHaveLength(0);
  });

  it('GIA HẠN THUÊ trước mỗi lời gọi LLM: khi soạn, locked_until còn xa hơn thuê ban đầu 5 giây (Q-POR6)', async () => {
    const id = await addComment();
    let remaining = 0;
    await runCommentPipeline(
      config(id, {
        beforeDraft: async () => {
          const r = await admin.query(
            'SELECT extract(epoch FROM (locked_until - now())) AS s FROM cf.pipeline_turns WHERE comment_id = $1',
            [id],
          );
          remaining = Number(r.rows[0].s);
        },
      }),
    );
    expect(remaining).toBeGreaterThan(60);
  });
  it('MẤT THUÊ (job khác giành lại, attempts tăng): job cũ dừng, không kéo dài/không nhả thuê của job mới, không ghi bản nháp (token thuê)', async () => {
    const id = await addComment();
    let lockedBefore = '';
    await expect(
      runCommentPipeline(
        config(id, {
          beforeDraft: async () => {
            // Chưa tới đây: giả lập mất thuê ngay trước bước soạn bằng cách để job khác giành lại.
          },
          afterExtract: async () => {
            await admin.query(
              "UPDATE cf.pipeline_turns SET attempts = attempts + 1, locked_until = now() + interval '90 seconds' WHERE comment_id = $1",
              [id],
            );
            lockedBefore = String(
              (
                await admin.query(
                  'SELECT locked_until FROM cf.pipeline_turns WHERE comment_id = $1',
                  [id],
                )
              ).rows[0].locked_until,
            );
          },
        }),
      ),
    ).rejects.toThrow('Mất thuê');
    const row = (
      await admin.query(
        'SELECT attempts, locked_until FROM cf.pipeline_turns WHERE comment_id = $1',
        [id],
      )
    ).rows[0];
    expect(String(row.locked_until)).toBe(lockedBefore);
    expect(Number(row.attempts)).toBe(2);
    expect(await drafts(id)).toHaveLength(0);
  });
});

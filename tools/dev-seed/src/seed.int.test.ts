import { createDb } from '@flow/db/runtime';
import { hashPassword } from '@flow/saas-core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_EMAILS } from './credentials';
import {
  DEMO_CHANNELS,
  DEMO_COMMENTS,
  DEMO_POSTS,
  DEMO_PRODUCTS,
  DEMO_WORKSPACE_NAME,
} from './demo-data';
import {
  DEMO_ABBREVIATIONS,
  DEMO_ACTION_LOGS,
  DEMO_ALIASES,
  DEMO_AUTOMATION,
  DEMO_CONVERSATIONS,
  DEMO_LEADS,
  DEMO_SIZE_CHARTS,
  DEMO_SPAM_COMMENTS,
  DEMO_SPAM_RULES,
  KB_FAQS,
  KB_POLICIES,
} from './demo-data-v2';
import { assertDemoWorkspace, seedDemo, wipeSeededData } from './seed';

/**
 * Chạy seed THẬT trên DB test (cf_test / cf_test_<làn>) bằng đúng ba role như CLI (cf_owner, cf_app, cf_worker),
 * để lỗi quyền/RLS/CHECK khi ghi (ví dụ GRANT INSERT theo cột của cf.products) bị bắt trước khi lên dev.
 */
const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu ${name}`);
  return v;
};

let admin: pg.Pool;
let appDb: ReturnType<typeof createDb>;
let workerDb: ReturnType<typeof createDb>;

const deps = () => ({
  admin,
  appDb,
  workerDb,
  hashPassword,
  now: new Date(),
  // Khóa lead tạm sinh lúc chạy (không dùng khóa dev thật trong test).
  env: {},
  // Cổng chỉ-cf_dev của CLI không áp cho DB test; chỉ cho cf_test / cf_test_<làn> / cf_ci (DB của job CI), từ chối DB khác.
  assertDatabase: ({ database }: { database: string }) => {
    if (!/^(cf_test(_[a-z0-9]{1,8})?|cf_ci)$/.test(database)) throw new Error(`DB lạ: ${database}`);
  },
});

const OWNER_THU2 = 'owner.thu2.mau@example.test';

/** Đếm dòng theo bảng cho một workspace (đọc bằng pool quản trị, qua RLS-bypass chủ sở hữu bảng). */
async function tableCounts(workspaceId: string): Promise<Record<string, number>> {
  const q = async (text: string) =>
    Number((await admin.query<{ n: string }>(text, [workspaceId])).rows[0]?.n);
  return {
    channels: await q('SELECT count(*) n FROM cf.channels WHERE workspace_id = $1'),
    posts: await q('SELECT count(*) n FROM cf.posts WHERE workspace_id = $1'),
    comments: await q('SELECT count(*) n FROM cf.comments WHERE workspace_id = $1'),
    drafts: await q('SELECT count(*) n FROM cf.drafts WHERE workspace_id = $1'),
    products: await q('SELECT count(*) n FROM cf.products WHERE workspace_id = $1'),
    variants: await q('SELECT count(*) n FROM cf.product_variants WHERE workspace_id = $1'),
    post_products: await q('SELECT count(*) n FROM cf.post_products WHERE workspace_id = $1'),
    aliases: await q('SELECT count(*) n FROM cf.product_aliases WHERE workspace_id = $1'),
    size_charts: await q('SELECT count(*) n FROM cf.size_charts WHERE workspace_id = $1'),
    post_notes: await q('SELECT count(*) n FROM cf.post_notes WHERE workspace_id = $1'),
    faqs: await q('SELECT count(*) n FROM cf.faq_items WHERE workspace_id = $1'),
    policies: await q('SELECT count(*) n FROM cf.policy_items WHERE workspace_id = $1'),
    shop_profiles: await q('SELECT count(*) n FROM cf.shop_profiles WHERE workspace_id = $1'),
    brand_voices: await q('SELECT count(*) n FROM cf.brand_voice WHERE workspace_id = $1'),
    abbreviations: await q('SELECT count(*) n FROM cf.abbreviations WHERE workspace_id = $1'),
    kb_sources: await q('SELECT count(*) n FROM cf.kb_sources WHERE workspace_id = $1'),
    kb_versions: await q('SELECT count(*) n FROM cf.kb_versions WHERE workspace_id = $1'),
    kb_chunks_draft: await q(
      'SELECT count(*) n FROM cf.kb_chunks WHERE workspace_id = $1 AND version_id IS NULL',
    ),
    kb_chunks_published: await q(
      'SELECT count(*) n FROM cf.kb_chunks WHERE workspace_id = $1 AND version_id IS NOT NULL',
    ),
    leads: await q('SELECT count(*) n FROM cf.leads WHERE workspace_id = $1'),
    spam_rules: await q('SELECT count(*) n FROM cf.rules WHERE workspace_id = $1'),
    automation_rules: await q('SELECT count(*) n FROM cf.automation_rules WHERE workspace_id = $1'),
    conversations: await q('SELECT count(*) n FROM cf.conversations WHERE workspace_id = $1'),
    messages: await q('SELECT count(*) n FROM cf.messages WHERE workspace_id = $1'),
    action_logs: await q('SELECT count(*) n FROM core.action_logs WHERE workspace_id = $1'),
    ai_usage: await q('SELECT count(*) n FROM cf.ai_usage WHERE workspace_id = $1'),
    invoices: await q('SELECT count(*) n FROM core.invoices WHERE workspace_id = $1'),
    subscriptions: await q('SELECT count(*) n FROM core.subscriptions WHERE workspace_id = $1'),
    members: await q('SELECT count(*) n FROM core.members WHERE workspace_id = $1'),
  };
}

const stageCounts = async (workspaceId: string) => {
  const r = await admin.query<{ stage: string; n: string }>(
    'SELECT stage, count(*) n FROM cf.leads WHERE workspace_id = $1 GROUP BY stage',
    [workspaceId],
  );
  return Object.fromEntries(r.rows.map((x) => [x.stage, Number(x.n)]));
};

const sum = <T>(items: readonly T[], f: (t: T) => number) => items.reduce((n, x) => n + f(x), 0);

describe('seedDemo v2 trên DB test', () => {
  let workspaceId = '';
  let ownerHashBefore = '';
  let counts: Record<string, number> = {};

  beforeAll(() => {
    admin = new pg.Pool({ connectionString: need('TEST_DATABASE_ADMIN_URL'), max: 2 });
    appDb = createDb({ connectionString: need('TEST_DATABASE_URL'), max: 2 });
    workerDb = createDb({ connectionString: need('TEST_DATABASE_WORKER_URL'), max: 2 });
  });
  afterAll(async () => {
    await Promise.all([admin.end(), appDb.close(), workerDb.close()]);
  });

  it('--reset tạo workspace mẫu với số lượng đúng từng bảng', async () => {
    const result = await seedDemo(deps(), { reset: true });
    expect(result.status).toBe('created');
    if (result.status !== 'created') return;
    workspaceId = result.workspaceId;
    // Tạo mới: in cả ba tài khoản (owner + 2 nhân viên).
    expect(result.credentials.map((c) => c.role).sort()).toEqual(['owner', 'staff', 'staff2']);

    counts = await tableCounts(workspaceId);
    expect(counts.channels).toBe(DEMO_CHANNELS.length);
    expect(counts.posts).toBe(DEMO_POSTS.length);
    expect(counts.comments).toBe(result.counts.comments);
    expect(counts.comments).toBeGreaterThanOrEqual(
      DEMO_COMMENTS.length + DEMO_SPAM_COMMENTS.length + 150,
    );
    expect(counts.drafts).toBe(DEMO_COMMENTS.filter((c) => c.draft).length);
    expect(counts.products).toBe(DEMO_PRODUCTS.length);
    expect(counts.variants).toBe(sum(DEMO_PRODUCTS, (p) => p.variants.length));
    expect(counts.post_products).toBe(DEMO_POSTS.length);
    expect(counts.aliases).toBe(sum(Object.values(DEMO_ALIASES), (a) => a.length));
    expect(counts.size_charts).toBe(DEMO_SIZE_CHARTS.length);
    expect(counts.post_notes).toBe(4);
    expect(counts.faqs).toBe(KB_FAQS.length);
    expect(counts.policies).toBe(KB_POLICIES.length);
    expect(counts.shop_profiles).toBe(2);
    expect(counts.brand_voices).toBe(2);
    expect(counts.abbreviations).toBe(DEMO_ABBREVIATIONS.length);
    expect(counts.kb_sources).toBe(4);
    expect(counts.kb_versions).toBe(2);
    expect(counts.kb_chunks_draft).toBeGreaterThanOrEqual(KB_FAQS.length + KB_POLICIES.length);
    expect(counts.kb_chunks_published).toBeGreaterThan(counts.kb_chunks_draft ?? 0);
    expect(counts.leads).toBe(DEMO_LEADS.length);
    expect(await stageCounts(workspaceId)).toEqual({ new: 9, contacted: 8, won: 4, lost: 4 });
    expect(counts.spam_rules).toBe(DEMO_SPAM_RULES.length);
    expect(counts.automation_rules).toBe(DEMO_AUTOMATION.matrix.length);
    expect(counts.conversations).toBe(DEMO_CONVERSATIONS.length);
    expect(counts.messages).toBe(sum(DEMO_CONVERSATIONS, (c) => c.turns.length));
    expect(counts.action_logs).toBeGreaterThanOrEqual(DEMO_ACTION_LOGS.length);
    expect(counts.ai_usage).toBeGreaterThanOrEqual(150);
    expect(counts.invoices).toBe(3);
    expect(counts.subscriptions).toBe(1);
    expect(counts.members).toBe(3);

    // Hạn mức AI ~71% và gói Starter.
    const usage = await admin.query<{ used: number; limit_amount: number }>(
      'SELECT used, limit_amount FROM core.usage_counters WHERE workspace_id = $1',
      [workspaceId],
    );
    expect(usage.rows[0]).toMatchObject({ used: 710, limit_amount: 1000 });
    const plan = await admin.query<{ plan_code: string }>(
      'SELECT plan_code FROM core.subscriptions WHERE workspace_id = $1',
      [workspaceId],
    );
    expect(plan.rows[0]?.plan_code).toBe('starter');

    // Báo cáo: đủ bình luận đã trả lời bởi cả hai nhân viên, trải ≥ 14 ngày.
    const rep = await admin.query<{ staff: string; span_days: number }>(
      `SELECT count(DISTINCT replied_by) staff,
              extract(day from max(created_time) - min(created_time))::int span_days
         FROM cf.comments WHERE workspace_id = $1 AND replied_by IS NOT NULL`,
      [workspaceId],
    );
    expect(Number(rep.rows[0]?.staff)).toBe(2);
    expect(Number(rep.rows[0]?.span_days ?? 0)).toBeGreaterThanOrEqual(14);

    // Nhật ký trải ≥ 13 ngày; cửa sổ 24 giờ có đủ cả ba mức.
    const win = await admin.query<{ lt2: string; plenty: string; expired: string }>(
      `SELECT count(*) FILTER (WHERE now() - last_customer_msg_at BETWEEN interval '22 hours' AND interval '24 hours') lt2,
              count(*) FILTER (WHERE now() - last_customer_msg_at < interval '22 hours') plenty,
              count(*) FILTER (WHERE now() - last_customer_msg_at > interval '24 hours') expired
         FROM cf.conversations WHERE workspace_id = $1`,
      [workspaceId],
    );
    expect(Number(win.rows[0]?.lt2)).toBeGreaterThan(0);
    expect(Number(win.rows[0]?.plenty)).toBeGreaterThan(0);
    expect(Number(win.rows[0]?.expired)).toBeGreaterThan(0);

    // Khóa bí mật: không còn SĐT/email thô trong bảng lead.
    const raw = await admin.query<{ n: string }>(
      "SELECT count(*) n FROM cf.leads WHERE workspace_id = $1 AND (name IS NULL OR name NOT LIKE '[MẪU]%')",
      [workspaceId],
    );
    expect(Number(raw.rows[0]?.n)).toBe(0);
  });

  it('chạy lần hai không cờ: đã có, không ghi gì', async () => {
    const before = await tableCounts(workspaceId);
    const result = await seedDemo(deps(), {});
    expect(result.status).toBe('exists');
    expect(await tableCounts(workspaceId)).toEqual(before);
    const ws = await admin.query('SELECT 1 FROM core.workspaces WHERE name = $1', [
      DEMO_WORKSPACE_NAME,
    ]);
    expect(ws.rowCount).toBe(1);
  });

  it('--refresh làm mới dữ liệu, GIỮ NGUYÊN workspace và tài khoản (mật khẩu), số lượng không đổi', async () => {
    const owner = await admin.query<{ id: string; password: string }>(
      `SELECT u.id, a.password FROM core.users u JOIN core.accounts a ON a.user_id = u.id
        WHERE u.email = $1`,
      [DEMO_EMAILS.owner],
    );
    ownerHashBefore = owner.rows[0]?.password ?? '';
    expect(ownerHashBefore).not.toBe('');
    const before = await tableCounts(workspaceId);
    const result = await seedDemo(deps(), { refresh: true });
    expect(result.status).toBe('refreshed');
    if (result.status !== 'refreshed') return;
    expect(result.workspaceId).toBe(workspaceId);
    expect(result.credentials).toEqual([]);
    const after = await tableCounts(workspaceId);
    // Gói/hóa đơn/bộ đếm giữ nguyên; phiên bản kiến thức mẫu cũ bị dọn rồi tạo lại → vẫn 2.
    // Nhật ký là kho chỉ-thêm: các thao tác (lưu cấu hình, tạo quy tắc…) tự ghi thêm dòng kiểm toán nên chỉ được tăng.
    const { action_logs: logsAfter = 0, ...restAfter } = after;
    const { action_logs: logsBefore = 0, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
    expect(logsAfter).toBeGreaterThanOrEqual(logsBefore);
    const ownerAfter = await admin.query<{ id: string; password: string }>(
      `SELECT u.id, a.password FROM core.users u JOIN core.accounts a ON a.user_id = u.id
        WHERE u.email = $1`,
      [DEMO_EMAILS.owner],
    );
    expect(ownerAfter.rows[0]?.password).toBe(ownerHashBefore);
    expect(ownerAfter.rows[0]?.id).toBe(owner.rows[0]?.id);
    expect(await stageCounts(workspaceId)).toEqual({ new: 9, contacted: 8, won: 4, lost: 4 });
  });

  it('seed CHỈ ghi vào workspace [MẪU]: workspace khác (Owner riêng, kênh/sản phẩm/gói thật) không đổi MỘT dòng ở mọi bảng, qua mặc định/--refresh/--reset; tùy chọn `into` cũ bị bỏ qua', async () => {
    await admin.query('DELETE FROM core.workspaces WHERE name = $1', [
      'Shop thật của owner thu hai',
    ]);
    await admin.query('DELETE FROM core.users WHERE email = $1', [OWNER_THU2]);
    const u = await admin.query<{ id: string }>(
      "INSERT INTO core.users (email, name, email_verified) VALUES ($1, 'Owner thu hai', true) RETURNING id",
      [OWNER_THU2],
    );
    const ownerId = u.rows[0]?.id as string;
    await admin.query(
      "INSERT INTO core.accounts (user_id, provider_id, account_id, password) VALUES ($1::uuid, 'credential', $1::text, 'hash-giu-nguyen')",
      [ownerId],
    );
    const { createTenancy } = await import('@flow/saas-core');
    const { id: wsId } = await createTenancy(appDb).createWorkspace({
      userId: ownerId,
      name: 'Shop thật của owner thu hai',
    });
    await workerDb.withJob(wsId, async (tx) => {
      const { createChannel } = await import('@flow/db/runtime');
      await createChannel(tx, {
        platform: 'facebook',
        externalId: 'real_page_1',
        name: 'Trang thật',
      });
    });
    await admin.query(
      `INSERT INTO cf.products (workspace_id, source, name, search_text) VALUES ($1, 'shopify', 'Sản phẩm Shopify thật', 'san pham shopify that')`,
      [wsId],
    );
    const snapshot = async () => ({
      tables: await tableCounts(wsId),
      subscriptions: Number(
        (
          await admin.query('SELECT count(*) n FROM core.subscriptions WHERE workspace_id = $1', [
            wsId,
          ])
        ).rows[0].n,
      ),
      usage: Number(
        (
          await admin.query('SELECT count(*) n FROM core.usage_counters WHERE workspace_id = $1', [
            wsId,
          ])
        ).rows[0].n,
      ),
      invoices: Number(
        (await admin.query('SELECT count(*) n FROM core.invoices WHERE workspace_id = $1', [wsId]))
          .rows[0].n,
      ),
    });
    const before = await snapshot();

    const demo = await admin.query<{ id: string }>(
      'SELECT id FROM core.workspaces WHERE name = $1',
      [DEMO_WORKSPACE_NAME],
    );
    const demoId = demo.rows[0]?.id as string;
    const results = [
      await seedDemo(deps(), {}),
      await seedDemo(deps(), { refresh: true }),
      // Tùy chọn `into` đã bỏ: dù ai truyền vào (mã cũ/ép kiểu) cũng KHÔNG được đổi đích ghi.
      await seedDemo(deps(), { into: OWNER_THU2, refresh: true } as never),
      await seedDemo(deps(), { reset: true }),
    ];
    for (const result of results) {
      expect(result.workspaceId).not.toBe(wsId);
    }
    expect((results[0] as { workspaceId: string }).workspaceId).toBe(demoId);
    expect(await snapshot()).toEqual(before);
    const real = await admin.query(
      "SELECT 1 FROM cf.channels WHERE workspace_id = $1 AND external_id = 'real_page_1'",
      [wsId],
    );
    expect(real.rowCount).toBe(1);
    const pw = await admin.query<{ password: string }>(
      'SELECT password FROM core.accounts WHERE user_id = $1',
      [ownerId],
    );
    expect(pw.rows[0]?.password).toBe('hash-giu-nguyen');
    // Sau --reset workspace mẫu được tạo lại; cập nhật id cho các test sau.
    workspaceId = (results[3] as { workspaceId: string }).workspaceId;
  });

  it('đích của seed LUÔN là workspace [MẪU]: kiểm trước khi ghi, từ chối workspace khác', async () => {
    const other = await admin.query<{ id: string }>(
      "SELECT id FROM core.workspaces WHERE name = 'Shop thật của owner thu hai'",
    );
    await expect(assertDemoWorkspace(admin, other.rows[0]?.id as string)).rejects.toThrow(
      /\[MẪU\]/,
    );
    await expect(assertDemoWorkspace(admin, workspaceId)).resolves.toBeUndefined();
  });

  it('--reset không đi kèm --refresh', async () => {
    await expect(seedDemo(deps(), { reset: true, refresh: true })).rejects.toThrow(/--reset/);
  });
});

describe('wipeSeededData — dọn dữ liệu mẫu trong MỘT giao dịch, báo cáo đếm trước/sau, giữ dữ liệu thật', () => {
  let ws = '';

  beforeAll(async () => {
    // Nhóm kết nối của describe trước đã đóng: dựng lại.
    admin = new pg.Pool({ connectionString: need('TEST_DATABASE_ADMIN_URL'), max: 2 });
    appDb = createDb({ connectionString: need('TEST_DATABASE_URL'), max: 2 });
    workerDb = createDb({ connectionString: need('TEST_DATABASE_WORKER_URL'), max: 2 });
    const result = await seedDemo(deps(), { reset: true });
    if (result.status !== 'created') throw new Error('không tạo được workspace mẫu');
    ws = result.workspaceId;
    // Dữ liệu THẬT do chủ shop nhập/đồng bộ: phải còn nguyên sau khi dọn.
    await admin.query(
      `INSERT INTO cf.products (workspace_id, source, name, search_text) VALUES
         ($1, 'manual', 'Sản phẩm nhập tay', 'san pham nhap tay'),
         ($1, 'shopify', 'Sản phẩm Shopify', 'san pham shopify')`,
      [ws],
    );
    await admin.query(
      `INSERT INTO cf.policy_items (workspace_id, kind, lang, title, content)
       VALUES ($1, 'return', 'vi', 'Chính sách thật của shop', 'Đổi trả trong 7 ngày.')`,
      [ws],
    );
    await admin.query(
      `INSERT INTO cf.faq_items (workspace_id, question, answer, lang)
       VALUES ($1, 'Shop ở đâu?', 'Hà Nội', 'vi')`,
      [ws],
    );
  });

  afterAll(async () => {
    await Promise.all([admin.end(), appDb.close(), workerDb.close()]);
  });

  const real = async () => ({
    manual: Number(
      (
        await admin.query(
          "SELECT count(*) n FROM cf.products WHERE workspace_id = $1 AND source = 'manual' AND name NOT LIKE '[MẪU]%'",
          [ws],
        )
      ).rows[0].n,
    ),
    shopify: Number(
      (
        await admin.query(
          "SELECT count(*) n FROM cf.products WHERE workspace_id = $1 AND source = 'shopify'",
          [ws],
        )
      ).rows[0].n,
    ),
    policy: Number(
      (
        await admin.query(
          "SELECT count(*) n FROM cf.policy_items WHERE workspace_id = $1 AND title NOT LIKE '[MẪU]%'",
          [ws],
        )
      ).rows[0].n,
    ),
    faq: Number(
      (
        await admin.query(
          "SELECT count(*) n FROM cf.faq_items WHERE workspace_id = $1 AND question NOT LIKE '[MẪU]%'",
          [ws],
        )
      ).rows[0].n,
    ),
  });

  it('điểm kiểm lỗi → HOÀN TÁC toàn bộ (không xóa nửa chừng)', async () => {
    const before = await tableCounts(ws);
    await expect(
      wipeSeededData(admin, ws, {
        verify: async () => {
          throw new Error('điểm kiểm thất bại');
        },
      }),
    ).rejects.toThrow('điểm kiểm thất bại');
    expect(await tableCounts(ws)).toEqual(before);
  });

  it('dọn xong: mọi bảng có mẫu về 0, dữ liệu thật còn nguyên; báo cáo có đếm trước/sau từng bảng', async () => {
    const realBefore = await real();
    expect(realBefore).toEqual({ manual: 1, shopify: 1, policy: 1, faq: 1 });
    const report = await wipeSeededData(admin, ws);
    const row = (table: string) => report.cleaned.find((r) => r.table === table);
    expect(row('products')).toMatchObject({ before: 12 + 2 });
    expect(row('products')?.after).toBe(2);
    expect(row('comments')?.after).toBe(0);
    expect(row('drafts')?.after).toBe(0);
    expect(row('kb_chunks')?.after).toBe(0);
    expect(row('faq_items')?.after).toBe(1);
    expect(row('policy_items')?.after).toBe(1);
    expect(row('channels')?.after).toBe(0);
    expect(row('automation_rules')?.after).toBe(0);
    expect(await real()).toEqual(realBefore);
    // Bảng KHÔNG chắc chắn lọc được (thông tin shop, giọng văn, gói, bộ đếm, hóa đơn…) không bị đụng — chỉ báo cáo.
    const names = report.untouched.map((r) => r.table);
    expect(names).toEqual(
      expect.arrayContaining([
        'shop_profiles',
        'brand_voice',
        'automation_settings',
        'subscriptions',
        'invoices',
      ]),
    );
    for (const r of report.untouched) expect(r.before).toBe(r.after);
  });

  it('chạy lại khi đã sạch → không xóa gì, không lỗi', async () => {
    const report = await wipeSeededData(admin, ws);
    for (const r of report.cleaned) expect(r.before).toBe(r.after);
  });
});

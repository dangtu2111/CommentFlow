import { type FlowDb, sql } from '@flow/db/runtime';
import { createTenancy } from '@flow/saas-core';
import { AppError } from '@flow/shared';
import type pg from 'pg';
import { DEMO_EMAILS, generateDemoPassword } from './credentials';
import { DEMO_TAG, DEMO_WORKSPACE_NAME } from './demo-data';
import { DEMO_ABBREVIATIONS } from './demo-data-v2';
import { assertDbMarkerAllowed } from './guard';
import { type SeedCounts, seedContent } from './seed-content';

export type SeedDeps = {
  /** Pool role `cf_owner` — chỉ để tạo tài khoản thử, thêm Staff và dọn dữ liệu mẫu (như `pnpm db:migrate`). */
  admin: pg.Pool;
  /** Pool `cf_app` (web): `withActor`/`withWorkspace`. */
  appDb: FlowDb;
  /** Pool `cf_worker`: `withJob` (đường hệ thống ghi kênh/bài/bình luận/bản nháp/usage). */
  workerDb: FlowDb;
  hashPassword: (password: string) => Promise<string>;
  now: Date;
  /** Chỉ test tích hợp đặt (cho DB `cf_test_<làn>`); CLI KHÔNG đặt nên luôn dùng cổng chỉ-`cf_dev`. */
  assertDatabase?: (row: { database: string; marker: string | null }) => void;
  /** Biến môi trường (khóa lead của dev nếu có); mặc định `process.env`. */
  env?: Record<string, string | undefined>;
};

/**
 * - mặc định: tạo workspace mẫu (đã có → `exists`);
 * - `reset`: xóa workspace + tài khoản mẫu rồi tạo lại (đổi mật khẩu);
 * - `refresh`: làm mới dữ liệu của workspace mẫu ĐANG CÓ, GIỮ NGUYÊN tài khoản (mật khẩu, 2FA);
 * - `into`: email Owner có sẵn — nạp cùng bộ dữ liệu vào workspace của họ (đã có dữ liệu mẫu → `exists`, thêm `refresh`
 *   để làm mới). Không bao giờ tạo workspace mới, không đổi tài khoản Owner.
 */
export type SeedOptions = { reset?: boolean; refresh?: boolean; into?: string };

export type SeedCredential = {
  role: 'owner' | 'staff' | 'staff2';
  email: string;
  password: string;
};

export type SeedResult =
  | { status: 'exists'; workspaceId: string }
  | {
      status: 'created' | 'refreshed' | 'loaded';
      workspaceId: string;
      /** Chỉ tài khoản MỚI tạo lần này (tài khoản có sẵn giữ nguyên mật khẩu nên không in). */
      credentials: SeedCredential[];
      counts: SeedCounts;
    };

const ROW_SQL = "SELECT current_database() AS db, current_setting('cf.env', true) AS marker";
const LIKE_TAG = `${DEMO_TAG}%`;

/** Kiểm lần hai bằng CHÍNH database đang kết nối, trên cả ba pool (không tin tên trong URL). */
export async function verifyConnectedDatabases(deps: SeedDeps): Promise<void> {
  const query = sql`SELECT current_database() AS db, current_setting('cf.env', true) AS marker`;
  type Row = { db: string; marker: string | null };
  const fromAdmin = (await deps.admin.query<Row>(ROW_SQL)).rows[0];
  const fromApp = (await deps.appDb.withSystem((tx) => tx.execute<Row>(query))).rows[0];
  const fromWorker = (await deps.workerDb.withSystem((tx) => tx.execute<Row>(query))).rows[0];
  for (const row of [fromAdmin, fromApp, fromWorker]) {
    if (!row) throw new AppError('FORBIDDEN', 'Không đọc được database đang kết nối.');
    (deps.assertDatabase ?? assertDbMarkerAllowed)({ database: row.db, marker: row.marker });
  }
}

/** Xóa workspace mẫu (cascade) rồi tài khoản mẫu — chỉ đúng tên/email mẫu, không đụng dữ liệu khác. */
export async function resetDemo(admin: pg.Pool): Promise<void> {
  await admin.query('DELETE FROM core.workspaces WHERE name = $1', [DEMO_WORKSPACE_NAME]);
  await admin.query('DELETE FROM core.users WHERE email = ANY($1::text[])', [
    Object.values(DEMO_EMAILS),
  ]);
}

/**
 * Dọn đúng phần dữ liệu mẫu v2 trong MỘT workspace (giữ workspace, tài khoản, thành viên, gói, hóa đơn, bộ đếm).
 * Nhận diện bằng nhãn `[MẪU]`/tiền tố `demo_`, nên dùng được cả cho workspace thật của Owner khác (`--into`).
 * Dùng pool quản trị (cf_owner), giống `resetDemo`; không đổi RLS/GRANT.
 */
export async function wipeSeededData(admin: pg.Pool, workspaceId: string): Promise<void> {
  const demoChannels = `SELECT id FROM cf.channels WHERE workspace_id = $1 AND external_id LIKE 'demo\\_%'`;
  const statements: Array<[string, unknown[]]> = [
    // leads_channel_fk không cascade → xóa lead của kênh mẫu trước.
    [
      `DELETE FROM cf.leads WHERE workspace_id = $1 AND channel_id IN (${demoChannels})`,
      [workspaceId],
    ],
    // Bản nháp trỏ bình luận bằng `target_id` (không khóa ngoại) nên không tự cascade.
    [`DELETE FROM cf.drafts WHERE workspace_id = $1 AND model = 'demo-mock'`, [workspaceId]],
    // Kênh mẫu: cascade bài, bình luận, bản nháp theo bình luận, hội thoại, tin nhắn, ô tự động hóa, liên kết bài↔sản phẩm.
    [
      `DELETE FROM cf.channels WHERE workspace_id = $1 AND external_id LIKE 'demo\\_%'`,
      [workspaceId],
    ],
    // Kiến thức: đoạn → phiên bản mẫu → nguồn mẫu (kb_chunks_version_fk không cascade).
    [
      `DELETE FROM cf.kb_chunks WHERE workspace_id = $1 AND (source_id IN (SELECT id FROM cf.kb_sources WHERE workspace_id = $1 AND title LIKE $2)
         OR version_id IN (SELECT id FROM cf.kb_versions WHERE workspace_id = $1 AND note LIKE $2))`,
      [workspaceId, LIKE_TAG],
    ],
    [
      `DELETE FROM cf.kb_versions WHERE workspace_id = $1 AND note LIKE $2`,
      [workspaceId, LIKE_TAG],
    ],
    [
      `DELETE FROM cf.kb_sources WHERE workspace_id = $1 AND title LIKE $2`,
      [workspaceId, LIKE_TAG],
    ],
    // Sản phẩm mẫu: cascade biến thể, bí danh, bảng size theo sản phẩm, liên kết bài.
    [`DELETE FROM cf.products WHERE workspace_id = $1 AND name LIKE $2`, [workspaceId, LIKE_TAG]],
    [
      `DELETE FROM cf.size_charts WHERE workspace_id = $1 AND note LIKE $2`,
      [workspaceId, LIKE_TAG],
    ],
    [
      `DELETE FROM cf.faq_items WHERE workspace_id = $1 AND question LIKE $2`,
      [workspaceId, LIKE_TAG],
    ],
    [
      `DELETE FROM cf.policy_items WHERE workspace_id = $1 AND title LIKE $2`,
      [workspaceId, LIKE_TAG],
    ],
    [
      `DELETE FROM cf.abbreviations WHERE workspace_id = $1
         AND (short, "full") IN (SELECT * FROM unnest($2::text[], $3::text[]))`,
      [workspaceId, DEMO_ABBREVIATIONS.map((a) => a.short), DEMO_ABBREVIATIONS.map((a) => a.full)],
    ],
    [`DELETE FROM cf.rules WHERE workspace_id = $1 AND name LIKE $2`, [workspaceId, LIKE_TAG]],
    [`DELETE FROM cf.ai_usage WHERE workspace_id = $1 AND model = 'demo-mock'`, [workspaceId]],
    [
      `DELETE FROM core.action_logs WHERE workspace_id = $1 AND after ->> 'note' LIKE $2`,
      [workspaceId, LIKE_TAG],
    ],
  ];
  for (const [text, values] of statements) await admin.query(text, values);
}

type UserRow = { id: string };

async function findUserId(admin: pg.Pool, email: string): Promise<string | null> {
  const r = await admin.query<UserRow>('SELECT id FROM core.users WHERE email = $1', [email]);
  return r.rows[0]?.id ?? null;
}

async function createDemoUser(
  deps: SeedDeps,
  email: string,
  name: string,
): Promise<{ id: string; password: string }> {
  const password = generateDemoPassword();
  const hash = await deps.hashPassword(password);
  const created = await deps.admin.query<UserRow>(
    // Email coi như đã xác minh: tài khoản chỉ dùng trên dev, không có hộp thư thật.
    'INSERT INTO core.users (email, name, email_verified) VALUES ($1, $2, true) RETURNING id',
    [email, name],
  );
  const id = created.rows[0]?.id as string;
  await deps.admin.query(
    "INSERT INTO core.accounts (user_id, provider_id, account_id, password) VALUES ($1, 'credential', $2, $3)",
    [id, id, hash],
  );
  return { id, password };
}

/** Staff mẫu: có rồi thì giữ (không đổi mật khẩu); chưa có thì tạo và trả mật khẩu để in một lần. */
async function ensureStaff(
  deps: SeedDeps,
  workspaceId: string,
  which: 'staff' | 'staff2',
  credentials: SeedCredential[],
): Promise<string> {
  const email = DEMO_EMAILS[which];
  let id = await findUserId(deps.admin, email);
  if (!id) {
    const label = which === 'staff' ? 'Nhân viên 1' : 'Nhân viên 2';
    const created = await createDemoUser(deps, email, `${DEMO_TAG} ${label}`);
    id = created.id;
    credentials.push({ role: which, email, password: created.password });
  }
  // `members` chỉ cho Owner đầu tiên tự thêm (migration 0017); Staff mẫu thêm bằng role chủ sở hữu.
  await deps.admin.query(
    `INSERT INTO core.members (workspace_id, user_id, role) VALUES ($1, $2, 'staff')
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'active', updated_at = now()`,
    [workspaceId, id],
  );
  return id;
}

async function demoChannelCount(admin: pg.Pool, workspaceId: string): Promise<number> {
  const r = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM cf.channels WHERE workspace_id = $1 AND external_id LIKE 'demo\\_%'`,
    [workspaceId],
  );
  return r.rows[0]?.n ?? 0;
}

type Target = {
  workspaceId: string;
  ownerId: string;
  credentials: SeedCredential[];
  status: 'created' | 'refreshed' | 'loaded';
  intoExisting: boolean;
};

/** `--into`: Owner có sẵn + workspace đầu tiên (cũ nhất) mà họ làm Owner. */
async function resolveInto(
  deps: SeedDeps,
  email: string,
  refresh: boolean,
): Promise<Target | { exists: string }> {
  const found = await deps.admin.query<{ user_id: string; workspace_id: string }>(
    `SELECT m.user_id, m.workspace_id
       FROM core.users u
       JOIN core.members m ON m.user_id = u.id AND m.role = 'owner' AND m.status = 'active'
       JOIN core.workspaces w ON w.id = m.workspace_id
      WHERE lower(u.email) = lower($1)
      ORDER BY w.created_at, w.id
      LIMIT 1`,
    [email],
  );
  const row = found.rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy Owner đang hoạt động với email này (--into).');
  }
  if ((await demoChannelCount(deps.admin, row.workspace_id)) > 0) {
    if (!refresh) return { exists: row.workspace_id };
    await wipeSeededData(deps.admin, row.workspace_id);
  }
  return {
    workspaceId: row.workspace_id,
    ownerId: row.user_id,
    credentials: [],
    status: 'loaded',
    intoExisting: true,
  };
}

async function resolveDemoWorkspace(
  deps: SeedDeps,
  options: SeedOptions,
): Promise<Target | { exists: string }> {
  if (options.reset) await resetDemo(deps.admin);
  const existing = await deps.admin.query<{ id: string }>(
    'SELECT id FROM core.workspaces WHERE name = $1',
    [DEMO_WORKSPACE_NAME],
  );
  const found = existing.rows[0];
  if (found) {
    if (!options.refresh) return { exists: found.id };
    const ownerId = await deps.admin.query<{ user_id: string }>(
      "SELECT user_id FROM core.members WHERE workspace_id = $1 AND role = 'owner' LIMIT 1",
      [found.id],
    );
    const owner = ownerId.rows[0]?.user_id;
    if (!owner) throw new AppError('NOT_FOUND', 'Workspace mẫu không có Owner — dùng --reset.');
    await wipeSeededData(deps.admin, found.id);
    return {
      workspaceId: found.id,
      ownerId: owner,
      credentials: [],
      status: 'refreshed',
      intoExisting: false,
    };
  }
  // Tài khoản mẫu cũ (workspace đã bị xóa tay) được tạo lại để mật khẩu in ra luôn đúng.
  await deps.admin.query('DELETE FROM core.users WHERE email = ANY($1::text[])', [
    Object.values(DEMO_EMAILS),
  ]);
  const credentials: SeedCredential[] = [];
  const owner = await createDemoUser(deps, DEMO_EMAILS.owner, `${DEMO_TAG} Chủ shop`);
  credentials.push({ role: 'owner', email: DEMO_EMAILS.owner, password: owner.password });
  const { id: workspaceId } = await createTenancy(deps.appDb).createWorkspace({
    userId: owner.id,
    name: DEMO_WORKSPACE_NAME,
  });
  return { workspaceId, ownerId: owner.id, credentials, status: 'created', intoExisting: false };
}

export async function seedDemo(deps: SeedDeps, options: SeedOptions = {}): Promise<SeedResult> {
  if (options.reset && (options.refresh || options.into)) {
    throw new AppError('VALIDATION_FAILED', '--reset không dùng cùng --refresh hoặc --into.');
  }
  await verifyConnectedDatabases(deps);

  const target = options.into
    ? await resolveInto(deps, options.into, options.refresh === true)
    : await resolveDemoWorkspace(deps, options);
  if ('exists' in target) return { status: 'exists', workspaceId: target.exists };

  const staff = await ensureStaff(deps, target.workspaceId, 'staff', target.credentials);
  const staff2 = await ensureStaff(deps, target.workspaceId, 'staff2', target.credentials);
  const counts = await seedContent(
    {
      deps,
      workspaceId: target.workspaceId,
      ownerId: target.ownerId,
      staffIds: { staff, staff2 },
      intoExisting: target.intoExisting,
    },
    { env: deps.env ?? process.env, now: deps.now },
  );
  return {
    status: target.status,
    workspaceId: target.workspaceId,
    credentials: target.credentials,
    counts,
  };
}

import {
  createChannel,
  createFaqItem,
  createPolicyItem,
  type FlowDb,
  insertDraft,
  linkProductsToPosts,
  saveAutomationSettings,
  schema,
  sql,
  upsertShopProfile,
} from '@flow/db/runtime';
import { createTenancy } from '@flow/saas-core';
import {
  AppError,
  normalizeAttrs,
  type PriceSnapshot,
  parseFaqItem,
  parsePolicyItem,
  parseShopProfile,
  productSearchText,
} from '@flow/shared';
import type pg from 'pg';
import { DEMO_EMAILS, generateDemoPassword } from './credentials';
import {
  DEMO_CHANNELS,
  DEMO_COMMENTS,
  DEMO_POSTS,
  DEMO_PRODUCTS,
  DEMO_TAG,
  DEMO_WORKSPACE_NAME,
} from './demo-data';
import { assertDbMarkerAllowed } from './guard';

export type SeedDeps = {
  /** Pool role `cf_owner` — chỉ để tạo tài khoản thử, thêm Staff và xóa dữ liệu mẫu (như `pnpm db:migrate`). */
  admin: pg.Pool;
  /** Pool `cf_app` (web): `withActor`/`withWorkspace`. */
  appDb: FlowDb;
  /** Pool `cf_worker`: `withJob` (đường hệ thống ghi kênh/bài/bình luận/bản nháp/usage). */
  workerDb: FlowDb;
  hashPassword: (password: string) => Promise<string>;
  now: Date;
  /** Chỉ test tích hợp đặt (cho DB `cf_test_<làn>`); CLI KHÔNG đặt nên luôn dùng cổng chỉ-`cf_dev`. */
  assertDatabase?: (row: { database: string; marker: string | null }) => void;
};

export type SeedResult =
  | { status: 'exists'; workspaceId: string }
  | {
      status: 'created';
      workspaceId: string;
      credentials: Array<{ role: 'owner' | 'staff'; email: string; password: string }>;
      counts: {
        channels: number;
        posts: number;
        comments: number;
        drafts: number;
        products: number;
      };
    };

const minutes = (n: number) => n * 60_000;
const ROW_SQL = "SELECT current_database() AS db, current_setting('cf.env', true) AS marker";

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

async function createDemoUser(
  deps: SeedDeps,
  email: string,
  name: string,
): Promise<{ id: string; password: string }> {
  const password = generateDemoPassword();
  const hash = await deps.hashPassword(password);
  const created = await deps.admin.query<{ id: string }>(
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

function priceSnapshotFor(productKey: string, now: Date): PriceSnapshot {
  // Ảnh chụp giá giả (id nghiệp vụ không có ở đây): dùng khóa mẫu; hệ thống thật dựng từ products/product_variants.
  const product = DEMO_PRODUCTS.find((p) => p.key === productKey);
  if (!product) return [];
  return product.variants.map((v) => ({
    product_id: `demo-${product.key}`,
    variant_id: v.sku,
    price_vnd: v.priceVnd,
    stock: v.stock,
    updated_from_source_at: now.toISOString(),
  }));
}

export async function seedDemo(deps: SeedDeps, options: { reset: boolean }): Promise<SeedResult> {
  await verifyConnectedDatabases(deps);
  if (options.reset) await resetDemo(deps.admin);

  const existing = await deps.admin.query<{ id: string }>(
    'SELECT id FROM core.workspaces WHERE name = $1',
    [DEMO_WORKSPACE_NAME],
  );
  if (existing.rows[0]) return { status: 'exists', workspaceId: existing.rows[0].id };

  // Tài khoản mẫu cũ (workspace đã bị xóa tay) được tạo lại để mật khẩu in ra luôn đúng.
  await deps.admin.query('DELETE FROM core.users WHERE email = ANY($1::text[])', [
    Object.values(DEMO_EMAILS),
  ]);
  const owner = await createDemoUser(deps, DEMO_EMAILS.owner, `${DEMO_TAG} Chủ shop`);
  const staff = await createDemoUser(deps, DEMO_EMAILS.staff, `${DEMO_TAG} Nhân viên`);

  const { id: workspaceId } = await createTenancy(deps.appDb).createWorkspace({
    userId: owner.id,
    name: DEMO_WORKSPACE_NAME,
  });
  // `members` chỉ cho Owner đầu tiên tự thêm (migration 0017); Staff mẫu thêm bằng role chủ sở hữu.
  await deps.admin.query(
    "INSERT INTO core.members (workspace_id, user_id, role) VALUES ($1, $2, 'staff')",
    [workspaceId, staff.id],
  );

  // Kênh + bài + bình luận (đường hệ thống: withJob). Kênh GIẢ: không token, không webhook.
  const channelIds = new Map<string, string>();
  const postIds = new Map<string, string>();
  const commentIds = new Map<string, string>();
  await deps.workerDb.withJob(workspaceId, async (tx) => {
    for (const c of DEMO_CHANNELS) {
      channelIds.set(
        c.key,
        await createChannel(tx, { platform: c.platform, externalId: c.externalId, name: c.name }),
      );
    }
    for (const p of DEMO_POSTS) {
      const channelId = channelIds.get(p.channelKey) as string;
      const comments = DEMO_COMMENTS.filter((c) => c.postKey === p.key);
      const [row] = await tx
        .insert(schema.posts)
        .values({
          workspaceId,
          channelId,
          externalId: p.externalId,
          message: p.message,
          isAd: p.isAd,
          createdTime: new Date(deps.now.getTime() - p.hoursAgo * 60 * minutes(1)),
          commentCount: comments.length,
          pendingCount: comments.filter((c) => c.status === 'pending_review').length,
        })
        .returning({ id: schema.posts.id });
      postIds.set(p.key, (row as { id: string }).id);
    }
    for (const c of DEMO_COMMENTS) {
      const post = DEMO_POSTS.find((p) => p.key === c.postKey);
      const created = new Date(deps.now.getTime() - minutes(c.minutesAgo));
      const [row] = await tx
        .insert(schema.comments)
        .values({
          workspaceId,
          channelId: channelIds.get(post?.channelKey ?? '') as string,
          postId: postIds.get(c.postKey) as string,
          externalId: c.externalId,
          authorExternalId: `demo_author_${c.externalId.slice(-2)}`,
          authorName: c.authorName,
          text: c.text,
          textNormalized: c.text.toLowerCase(),
          lang: c.lang,
          createdTime: created,
          label: c.label,
          labelConfidence: c.labelConfidence.toFixed(3),
          labelSource: 'llm',
          labels: [c.label],
          status: c.status,
          repliedAt: c.status === 'replied' ? new Date(created.getTime() + minutes(10)) : null,
        })
        .returning({ id: schema.comments.id });
      commentIds.set(c.externalId, (row as { id: string }).id);
    }
  });

  // Sản phẩm + biến thể (giá/tồn là nguồn đúng cho câu AI) và liên kết bài ↔ sản phẩm: Owner qua withActor.
  const productIds = new Map<string, string>();
  await deps.appDb.withActor(workspaceId, owner.id, async (tx) => {
    for (const p of DEMO_PRODUCTS) {
      const prices = p.variants.map((v) => v.priceVnd);
      // SQL thô với danh sách cột tường minh: cf_app chỉ có GRANT INSERT theo cột (không có `rev`, do trigger đặt),
      // còn drizzle `.insert()` luôn liệt kê cả cột `rev` (DEFAULT) → "permission denied for table products".
      const searchText = productSearchText({
        name: p.name,
        sku: p.sku,
        variants: p.variants.map((v) => ({ attrs: v.attrs })),
      });
      const inserted = await tx.execute<{ id: string }>(sql`
        INSERT INTO cf.products (workspace_id, source, name, sku, category, price_vnd, stock, search_text)
        VALUES (${workspaceId}::uuid, 'manual', ${p.name}, ${p.sku}, ${p.category}, ${Math.min(...prices)},
          ${p.variants.reduce((sum, v) => sum + v.stock, 0)}, ${searchText})
        RETURNING id`);
      const productId = (inserted.rows[0] as { id: string }).id;
      productIds.set(p.key, productId);
      await tx.insert(schema.productVariants).values(
        p.variants.map((v) => ({
          workspaceId,
          productId,
          sku: v.sku,
          attrs: v.attrs,
          attrsNorm: normalizeAttrs(v.attrs),
          priceVnd: v.priceVnd,
          stock: v.stock,
        })),
      );
    }
    for (const post of DEMO_POSTS) {
      if (!post.productKey) continue;
      const productId = productIds.get(post.productKey) as string;
      await linkProductsToPosts(tx, workspaceId, owner.id, {
        postIds: [postIds.get(post.key) as string],
        productIds: [productId],
        primaryProductId: productId,
      });
    }
  });

  // Bản nháp AI (+ độ tin cậy do dữ liệu mẫu cho sẵn; KHÔNG qua pipeline/LLM thật) và usage — đường hệ thống.
  let drafts = 0;
  await deps.workerDb.withJob(workspaceId, async (tx) => {
    for (const c of DEMO_COMMENTS) {
      if (!c.draft) continue;
      await insertDraft(tx, workspaceId, {
        targetType: 'comment',
        targetId: commentIds.get(c.externalId) as string,
        text: c.draft.text,
        lang: c.lang,
        confidence: c.draft.confidence,
        needsHuman: c.draft.needsHuman ?? false,
        reason: c.draft.reason ?? null,
        model: 'demo-mock',
        promptVersion: 'demo@0',
        action: c.draft.action,
        priceSnapshot: c.draft.priceOf ? priceSnapshotFor(c.draft.priceOf, deps.now) : [],
      });
      drafts += 1;
    }
    await tx.insert(schema.aiUsage).values(
      Array.from({ length: 36 }, (_, i) => ({
        workspaceId,
        step: ['classify', 'draft', 'retrieve'][i % 3] as string,
        model: 'demo-mock',
        promptVersion: 'demo@0',
        inputTokens: 400 + i * 13,
        outputTokens: 80 + i * 5,
        cachedTokens: i % 2 === 0 ? 300 : 0,
        costUsd: (0.0004 + i * 0.00002).toFixed(6),
        createdAt: new Date(deps.now.getTime() - i * 60 * minutes(5)),
      })),
    );
  });

  // Kiến thức nhập tay + cấu hình tự gửi (mọi ô Tắt) + nhật ký hoạt động: Owner qua withActor.
  await deps.appDb.withActor(workspaceId, owner.id, async (tx) => {
    const profile = parseShopProfile({
      lang: 'vi',
      name: DEMO_WORKSPACE_NAME,
      description: `${DEMO_TAG} Cửa hàng thời trang mẫu để xem giao diện.`,
      address: `${DEMO_TAG} Địa chỉ mẫu`,
      openingHours: '08:00–21:00 hằng ngày',
    });
    if (profile.success) await upsertShopProfile(tx, workspaceId, profile.data);
    const policy = parsePolicyItem({
      kind: 'return',
      lang: 'vi',
      title: `${DEMO_TAG} Đổi trả trong 7 ngày`,
      content: `${DEMO_TAG} Đổi trả trong 7 ngày nếu còn nguyên tem mác. Đây là nội dung mẫu.`,
    });
    if (policy.success) await createPolicyItem(tx, workspaceId, policy.data);
    for (const faq of [
      {
        question: `${DEMO_TAG} Shop có freeship không?`,
        answer: 'Freeship cho đơn từ 500.000đ (mẫu).',
      },
      {
        question: `${DEMO_TAG} Có thể đổi size không?`,
        answer: 'Đổi size 1 lần trong 7 ngày (mẫu).',
      },
    ]) {
      const parsed = parseFaqItem({ ...faq, lang: 'vi', tags: ['mau'] });
      if (parsed.success) await createFaqItem(tx, workspaceId, parsed.data);
    }
    await saveAutomationSettings(tx, workspaceId, owner.id, {
      threshold: 0.9,
      delaySeconds: 60,
      dailyCap: 50,
      activeHours: null,
      blockedKeywords: ['hoàn tiền', 'kiện'],
      signature: null,
      rules: [],
    });
    await tx.insert(schema.actionLogs).values(
      ['demo.channel_connected', 'demo.products_imported', 'demo.knowledge_added'].map(
        (action, i) => ({
          workspaceId,
          actorType: 'user',
          actorId: owner.id,
          action,
          targetType: 'workspace',
          targetId: workspaceId,
          after: { note: `${DEMO_TAG} nhật ký mẫu` },
          createdAt: new Date(deps.now.getTime() - (i + 1) * 60 * minutes(3)),
        }),
      ),
    );
  });

  return {
    status: 'created',
    workspaceId,
    credentials: [
      { role: 'owner', email: DEMO_EMAILS.owner, password: owner.password },
      { role: 'staff', email: DEMO_EMAILS.staff, password: staff.password },
    ],
    counts: {
      channels: DEMO_CHANNELS.length,
      posts: DEMO_POSTS.length,
      comments: DEMO_COMMENTS.length,
      drafts,
      products: DEMO_PRODUCTS.length,
    },
  };
}

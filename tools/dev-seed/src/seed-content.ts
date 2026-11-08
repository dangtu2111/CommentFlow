import { randomUUID } from 'node:crypto';
import { buildChunkRows, loadEmbeddingService, resolveEmbeddingConfig } from '@flow/ai';
import {
  activatePlan,
  assignConversation,
  confirmInvoicePayment,
  consumeUsage,
  createAbbreviation,
  createChannel,
  createFaqItem,
  createInvoice,
  createKbVersionFromChunks,
  createLeadVault,
  createPolicyItem,
  createPostNote,
  createProductAlias,
  createSizeChartRow,
  createSpamRule,
  getCurrentVersion,
  getEmbeddingState,
  getSubscription,
  getUsageCounter,
  insertDraft,
  linkProductsToPosts,
  lockKbPublish,
  type PreparedLead,
  parseLeadHashKey,
  parseLeadKeys,
  recordInboundMessage,
  recordLeads,
  recordOutboundMessage,
  saveAutomationSettings,
  schema,
  setConversationAi,
  setConversationStatus,
  setSpamRuleEnabled,
  sql,
  touchConversationLastMessage,
  updateLead,
  upsertBrandVoice,
  upsertDraftChunks,
  upsertShopProfile,
} from '@flow/db/runtime';
import {
  type ChunkDraft,
  chunkDocument,
  normalizeAttrs,
  normalizeLeadPhone,
  type PriceSnapshot,
  parseAbbreviation,
  parseBrandVoice,
  parseFaqItem,
  parseLeadUpdate,
  parsePolicyItem,
  parsePostNoteInput,
  parseProductAlias,
  parseShopProfile,
  parseSizeChartRow,
  parseSpamRule,
  productSearchText,
  usagePeriodStart,
} from '@flow/shared';
import { DEMO_CHANNELS, DEMO_COMMENTS, DEMO_POSTS, DEMO_PRODUCTS, DEMO_TAG } from './demo-data';
import {
  buildReportRows,
  DEMO_ABBREVIATIONS,
  DEMO_ACTION_LOGS,
  DEMO_AI_USAGE_EXTRA_ROWS,
  DEMO_ALIASES,
  DEMO_AUTOMATION,
  DEMO_BILLING,
  DEMO_CONVERSATIONS,
  DEMO_LEADS,
  DEMO_POST_NOTES,
  DEMO_SIZE_CHARTS,
  DEMO_SPAM_COMMENTS,
  DEMO_SPAM_RULES,
  KB_BRAND_VOICES,
  KB_FAQS,
  KB_POLICIES,
  KB_SHOP_PROFILES,
  type ReportRowSpec,
} from './demo-data-v2';
import type { SeedDeps } from './seed';

const minutes = (n: number) => n * 60_000;
const HOUR = 60 * minutes(1);
const DAY = 24 * HOUR;

export type ContentCtx = {
  deps: SeedDeps;
  workspaceId: string;
  ownerId: string;
  staffIds: { staff: string; staff2: string };
  /** `true` khi nạp vào workspace có sẵn của Owner khác (không đụng cấu hình hiện có). */
};

export type SeedCounts = Record<string, number>;

const must = <T>(value: T | undefined | null, what: string): T => {
  if (value === undefined || value === null) throw new Error(`Thiếu ${what} khi nạp dữ liệu mẫu`);
  return value;
};

const ok = <T>(
  r: { success: true; data: T } | { success: false; error: unknown },
  what: string,
): T => {
  if (!r.success) throw new Error(`Dữ liệu mẫu không qua kiểm tra: ${what}`);
  return r.data;
};

const chunked = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

function priceSnapshotFor(productKey: string, now: Date): PriceSnapshot {
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

type Ids = {
  channels: Map<string, string>;
  posts: Map<string, string>;
  comments: Map<string, string>;
  products: Map<string, string>;
  conversations: string[];
};

/** Hàng bình luận cho báo cáo + spam (ngoài bộ v1): gom một chỗ để đếm bài/bình luận trước khi ghi bài. */
type ExtraComment = {
  externalId: string;
  postKey: string;
  text: string;
  label: string;
  status: string;
  createdAt: Date;
  repliedAt: Date | null;
  repliedBy: string | null;
};

function extraComments(ctx: ContentCtx, now: Date): ExtraComment[] {
  const whoIs = { staff: ctx.staffIds.staff, staff2: ctx.staffIds.staff2 } as const;
  const out: ExtraComment[] = [];
  for (const s of DEMO_SPAM_COMMENTS) {
    out.push({
      externalId: s.externalId,
      postKey: s.postKey,
      text: s.text,
      label: 'spam',
      status: 'spam_suspected',
      createdAt: new Date(now.getTime() - minutes(s.minutesAgo)),
      repliedAt: null,
      repliedBy: null,
    });
  }
  const postKeys = DEMO_POSTS.map((p) => p.key);
  for (const r of buildReportRows(now, postKeys) as ReportRowSpec[]) {
    const createdAt = new Date(now.getTime() - minutes(r.minutesAgo));
    out.push({
      externalId: r.externalId,
      postKey: r.postKey,
      text: r.text,
      label: r.label,
      status: r.status,
      createdAt,
      repliedAt: r.reply ? new Date(createdAt.getTime() + minutes(r.reply.afterMinutes)) : null,
      repliedBy: r.reply && r.reply.by !== 'ai' ? whoIs[r.reply.by] : null,
    });
  }
  return out;
}

/** Kênh + bài + bình luận (v1 + spam + báo cáo) + bản nháp + ai_usage + hội thoại: đường hệ thống (`withJob`). */
async function seedChannelsAndConversations(
  ctx: ContentCtx,
  ids: Ids,
  now: Date,
): Promise<SeedCounts> {
  const { deps, workspaceId } = ctx;
  const extra = extraComments(ctx, now);
  let drafts = 0;
  const counts: SeedCounts = {};
  await deps.workerDb.withJob(workspaceId, async (tx) => {
    for (const c of DEMO_CHANNELS) {
      ids.channels.set(
        c.key,
        await createChannel(tx, { platform: c.platform, externalId: c.externalId, name: c.name }),
      );
    }
    for (const p of DEMO_POSTS) {
      const own = DEMO_COMMENTS.filter((c) => c.postKey === p.key);
      const more = extra.filter((c) => c.postKey === p.key);
      const [row] = await tx
        .insert(schema.posts)
        .values({
          workspaceId,
          channelId: must(ids.channels.get(p.channelKey), 'kênh'),
          externalId: p.externalId,
          message: p.message,
          isAd: p.isAd,
          createdTime: new Date(now.getTime() - p.hoursAgo * HOUR),
          commentCount: own.length + more.length,
          pendingCount:
            own.filter((c) => c.status === 'pending_review').length +
            more.filter((c) => c.status === 'pending_review').length,
        })
        .returning({ id: schema.posts.id });
      ids.posts.set(p.key, (row as { id: string }).id);
    }
    const channelOfPost = (postKey: string) =>
      must(
        ids.channels.get(
          must(
            DEMO_POSTS.find((p) => p.key === postKey),
            'bài',
          ).channelKey,
        ),
        'kênh của bài',
      );
    for (const c of DEMO_COMMENTS) {
      const created = new Date(now.getTime() - minutes(c.minutesAgo));
      const [row] = await tx
        .insert(schema.comments)
        .values({
          workspaceId,
          // Dữ liệu mẫu KHÔNG được tự chạy AI khi bật cờ cf.pipeline.v2 (Q-POR1): coi như bình luận nhập ngược.
          ingestSource: 'backfill',
          channelId: channelOfPost(c.postKey),
          postId: must(ids.posts.get(c.postKey), 'bài'),
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
      ids.comments.set(c.externalId, (row as { id: string }).id);
    }
    for (const batch of chunked(extra, 100)) {
      await tx.insert(schema.comments).values(
        batch.map((c, i) => ({
          workspaceId,
          // Dữ liệu mẫu KHÔNG được tự chạy AI khi bật cờ cf.pipeline.v2 (Q-POR1): coi như bình luận nhập ngược.
          ingestSource: 'backfill',
          channelId: channelOfPost(c.postKey),
          postId: must(ids.posts.get(c.postKey), 'bài'),
          externalId: c.externalId,
          authorExternalId: `demo_rpt_author_${(i % 37) + 1}`,
          authorName: `${DEMO_TAG} Khách báo cáo`,
          text: c.text,
          textNormalized: c.text.toLowerCase(),
          lang: 'vi',
          createdTime: c.createdAt,
          label: c.label,
          labelConfidence: '0.900',
          labelSource: 'llm',
          labels: [c.label],
          status: c.status,
          repliedAt: c.repliedAt,
          repliedBy: c.repliedBy,
        })),
      );
    }
    counts.comments_extra = extra.length;

    // Bản nháp AI của bình luận v1.
    for (const c of DEMO_COMMENTS) {
      if (!c.draft) continue;
      await insertDraft(tx, workspaceId, {
        targetType: 'comment',
        targetId: must(ids.comments.get(c.externalId), 'bình luận'),
        text: c.draft.text,
        lang: c.lang,
        confidence: c.draft.confidence,
        needsHuman: c.draft.needsHuman ?? false,
        reason: c.draft.reason ?? null,
        model: 'demo-mock',
        promptVersion: 'demo@0',
        action: c.draft.action,
        priceSnapshot: c.draft.priceOf ? priceSnapshotFor(c.draft.priceOf, now) : [],
      });
      drafts += 1;
    }
    counts.drafts = drafts;

    // ai_usage: 36 dòng gần đây (v1) + rải 14 ngày.
    const steps = ['classify', 'draft', 'retrieve'];
    const rows = Array.from({ length: 36 + DEMO_AI_USAGE_EXTRA_ROWS }, (_, i) => ({
      workspaceId,
      step: steps[i % 3] as string,
      model: 'demo-mock',
      promptVersion: 'demo@0',
      inputTokens: 400 + (i % 50) * 13,
      outputTokens: 80 + (i % 40) * 5,
      cachedTokens: i % 2 === 0 ? 300 : 0,
      costUsd: (0.0004 + (i % 30) * 0.00002).toFixed(6),
      createdAt:
        i < 36
          ? new Date(now.getTime() - i * 5 * HOUR)
          : new Date(now.getTime() - ((i - 36) / DEMO_AI_USAGE_EXTRA_ROWS) * 14 * DAY - HOUR),
    }));
    for (const batch of chunked(rows, 100)) await tx.insert(schema.aiUsage).values(batch);
    counts.ai_usage = rows.length;

    // Hội thoại + tin nhắn.
    let messages = 0;
    const convIds: string[] = [];
    for (const spec of DEMO_CONVERSATIONS) {
      const lastIdx = spec.turns.map((t) => t.by).lastIndexOf('c');
      const t0 = now.getTime() - minutes(spec.lastCustomerMinutesAgo);
      const timeOf = (i: number) => t0 + (i - lastIdx) * minutes(spec.turns.length > 1 ? 3 : 0);
      const channelId = must(ids.channels.get(spec.channelKey), 'kênh');
      const customerId = `demo_psid_${String(spec.key).padStart(2, '0')}`;
      let conversationId: string | null = null;
      for (const [i, turn] of spec.turns.entries()) {
        const at = new Date(timeOf(i));
        const mid = `demo_mid_${spec.key}_${i}`;
        if (turn.by === 'c') {
          const r = await recordInboundMessage(tx, workspaceId, {
            channelId,
            threadExternalId: `demo_thread_${spec.key}`,
            customerExternalId: customerId,
            customerName: spec.customer,
            messageExternalId: mid,
            text: turn.text,
            lang: spec.key === 13 ? 'en' : 'vi',
            at,
          });
          conversationId = r.conversationId;
        } else {
          const cid = must(conversationId, 'hội thoại (tin đầu phải của khách)');
          await recordOutboundMessage(tx, workspaceId, cid, {
            externalId: mid,
            text: turn.text,
            lang: spec.key === 13 ? 'en' : 'vi',
            sentBy: turn.by === 'a' ? 'ai' : 'staff',
            tag: turn.tag ?? null,
            at,
          });
          await touchConversationLastMessage(tx, workspaceId, cid, at, { aiTurn: turn.by === 'a' });
        }
        messages += 1;
      }
      convIds.push(must(conversationId, 'hội thoại'));
    }
    counts.conversations = convIds.length;
    counts.messages = messages;
    ids.conversations = convIds;
  });
  return counts;
}

/** Sản phẩm, biến thể, liên kết bài, bí danh, bảng size, ghi chú theo bài: Owner (`withActor`). */
async function seedCatalog(ctx: ContentCtx, ids: Ids, now: Date): Promise<SeedCounts> {
  const { deps, workspaceId, ownerId } = ctx;
  const counts: SeedCounts = { aliases: 0, size_charts: 0, post_notes: 0 };
  await deps.appDb.withActor(workspaceId, ownerId, async (tx) => {
    for (const p of DEMO_PRODUCTS) {
      const prices = p.variants.map((v) => v.priceVnd);
      const searchText = productSearchText({
        name: p.name,
        sku: p.sku,
        variants: p.variants.map((v) => ({ attrs: v.attrs })),
      });
      // SQL thô, cột tường minh: cf_app chỉ có GRANT INSERT theo cột (không có `rev`).
      const inserted = await tx.execute<{ id: string }>(sql`
        INSERT INTO cf.products (workspace_id, source, name, sku, category, price_vnd, stock, search_text)
        VALUES (${workspaceId}::uuid, 'manual', ${p.name}, ${p.sku}, ${p.category}, ${Math.min(...prices)},
          ${p.variants.reduce((sum, v) => sum + v.stock, 0)}, ${searchText})
        RETURNING id`);
      const productId = must(inserted.rows[0], 'sản phẩm').id;
      ids.products.set(p.key, productId);
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
      const productId = must(ids.products.get(post.productKey), 'sản phẩm');
      await linkProductsToPosts(tx, workspaceId, ownerId, {
        postIds: [must(ids.posts.get(post.key), 'bài')],
        productIds: [productId],
        primaryProductId: productId,
      });
    }
    for (const [key, aliases] of Object.entries(DEMO_ALIASES)) {
      for (const alias of aliases) {
        const input = ok(parseProductAlias({ alias, source: 'staff' }), `bí danh ${alias}`);
        await createProductAlias(
          tx,
          workspaceId,
          must(ids.products.get(key), 'sản phẩm'),
          input,
          ownerId,
        );
        counts.aliases = (counts.aliases ?? 0) + 1;
      }
    }
    for (const [i, row] of DEMO_SIZE_CHARTS.entries()) {
      const scope =
        'category' in row.scope
          ? { category: row.scope.category, productId: null }
          : { category: null, productId: must(ids.products.get(row.scope.productKey), 'sản phẩm') };
      const input = ok(
        parseSizeChartRow({
          ...scope,
          size: row.size,
          heightMinCm: row.height[0],
          heightMaxCm: row.height[1],
          weightMinKg: row.weight[0],
          weightMaxKg: row.weight[1],
          measures: row.measures,
          note: `${DEMO_TAG} Bảng size mẫu`,
          sortOrder: i,
        }),
        `bảng size ${row.size}`,
      );
      await createSizeChartRow(tx, workspaceId, input);
      counts.size_charts = (counts.size_charts ?? 0) + 1;
    }
    for (const n of DEMO_POST_NOTES) {
      const input = ok(
        parsePostNoteInput({
          content: n.content,
          validFrom: new Date(now.getTime() - n.fromHoursAgo * HOUR),
          validTo:
            n.toHoursFromNow === null ? null : new Date(now.getTime() + n.toHoursFromNow * HOUR),
        }),
        'ghi chú bài',
      );
      await createPostNote(tx, workspaceId, must(ids.posts.get(n.postKey), 'bài'), input);
      counts.post_notes = (counts.post_notes ?? 0) + 1;
    }
  });
  return counts;
}

/** Thông tin shop, chính sách, FAQ, giọng văn, từ điển viết tắt, quy tắc spam, tự động hóa: Owner (`withActor`). */
async function seedKnowledgeAndSettings(ctx: ContentCtx, ids: Ids): Promise<SeedCounts> {
  const { deps, workspaceId, ownerId } = ctx;
  const counts: SeedCounts = {};
  await deps.appDb.withActor(workspaceId, ownerId, async (tx) => {
    for (const p of KB_SHOP_PROFILES) {
      await upsertShopProfile(tx, workspaceId, ok(parseShopProfile(p), `thông tin shop ${p.lang}`));
    }
    for (const v of KB_BRAND_VOICES) {
      await upsertBrandVoice(tx, workspaceId, ok(parseBrandVoice(v), `giọng văn ${v.lang}`));
    }
    for (const p of KB_POLICIES) {
      await createPolicyItem(tx, workspaceId, ok(parsePolicyItem(p), p.title));
    }
    for (const f of KB_FAQS) {
      await createFaqItem(tx, workspaceId, ok(parseFaqItem(f), f.question));
    }
    counts.policies = KB_POLICIES.length;
    counts.faqs = KB_FAQS.length;
    counts.shop_profiles = KB_SHOP_PROFILES.length;
    counts.brand_voices = KB_BRAND_VOICES.length;
    for (const a of DEMO_ABBREVIATIONS) {
      // Trùng (lang, short) — shop đã tự thêm — thì giữ bản của shop.
      await tx.execute(sql`SAVEPOINT abbr`);
      try {
        await createAbbreviation(tx, workspaceId, ok(parseAbbreviation(a), `viết tắt ${a.short}`));
        await tx.execute(sql`RELEASE SAVEPOINT abbr`);
        counts.abbreviations = (counts.abbreviations ?? 0) + 1;
      } catch (error) {
        const code = (error as { cause?: { code?: string } })?.cause?.code;
        if (code !== '23505') throw error;
        await tx.execute(sql`ROLLBACK TO SAVEPOINT abbr`);
      }
    }
    for (const r of DEMO_SPAM_RULES) {
      const id = await createSpamRule(tx, workspaceId, ownerId, ok(parseSpamRule(r), r.name));
      if (!r.enabled) await setSpamRuleEnabled(tx, workspaceId, id, false);
    }
    counts.spam_rules = DEMO_SPAM_RULES.length;

    // Ma trận tự động hóa của workspace [MẪU] (seed chỉ ghi vào workspace mẫu — Q-SDO1).
    const demoRules = DEMO_AUTOMATION.matrix.map((m) => ({
      channelId: must(ids.channels.get(m.channelKey), 'kênh'),
      target: m.target,
      label: m.label,
      mode: m.mode,
    }));
    await saveAutomationSettings(tx, workspaceId, ownerId, {
      threshold: DEMO_AUTOMATION.threshold,
      delaySeconds: DEMO_AUTOMATION.delaySeconds,
      dailyCap: DEMO_AUTOMATION.dailyCap,
      activeHours: DEMO_AUTOMATION.activeHours,
      blockedKeywords: [...DEMO_AUTOMATION.blockedKeywords],
      signature: DEMO_AUTOMATION.signature,
      rules: demoRules,
    });
    counts.automation_rules = demoRules.length;
  });
  return counts;
}

/** Nguồn kiến thức + đoạn (embedder mock, không gọi dịch vụ ngoài) + 2 phiên bản đã xuất bản. */
async function seedKnowledgeBase(ctx: ContentCtx, now: Date): Promise<SeedCounts> {
  const { deps, workspaceId, ownerId } = ctx;
  const sourceIds = new Map<string, string>();
  await deps.appDb.withActor(workspaceId, ownerId, async (tx) => {
    const sources = [
      {
        key: 'shop',
        type: 'manual',
        title: `${DEMO_TAG} Thông tin shop`,
        status: 'active',
        syncError: null,
      },
      {
        key: 'faq',
        type: 'faq',
        title: `${DEMO_TAG} Câu hỏi thường gặp`,
        status: 'active',
        syncError: null,
      },
      {
        key: 'policy',
        type: 'policy',
        title: `${DEMO_TAG} Chính sách cửa hàng`,
        status: 'active',
        syncError: null,
      },
      {
        key: 'excel',
        type: 'excel',
        title: `${DEMO_TAG} Bảng giá Excel`,
        status: 'error',
        syncError: `${DEMO_TAG} Thiếu cột "giá" ở dòng 3 (lỗi mẫu để xem giao diện)`,
      },
    ] as const;
    for (const s of sources) {
      const [row] = await tx
        .insert(schema.kbSources)
        .values({
          workspaceId,
          type: s.type,
          title: s.title,
          status: s.status,
          syncError: s.syncError,
          lastSyncedAt: new Date(now.getTime() - 2 * HOUR),
        })
        .returning({ id: schema.kbSources.id });
      sourceIds.set(s.key, (row as { id: string }).id);
    }
  });

  const draftsBySource = new Map<string, ChunkDraft[]>();
  const profile = must(KB_SHOP_PROFILES[0], 'thông tin shop');
  draftsBySource.set(
    'shop',
    chunkDocument({
      key: 'shop:vi',
      kind: 'shop_profile',
      sourceTitle: `${DEMO_TAG} Thông tin shop`,
      lang: 'vi',
      text: `${profile.description}\n\nĐịa chỉ: ${profile.address}\n\nGiờ mở cửa: ${profile.openingHours}`,
    }),
  );
  draftsBySource.set(
    'faq',
    KB_FAQS.flatMap((f, i) =>
      chunkDocument({
        key: `faq:${i + 1}`,
        kind: 'faq',
        sourceTitle: `${DEMO_TAG} Câu hỏi thường gặp`,
        lang: f.lang,
        text: `Hỏi: ${f.question}\nĐáp: ${f.answer}`,
      }),
    ),
  );
  draftsBySource.set(
    'policy',
    KB_POLICIES.flatMap((p, i) =>
      chunkDocument({
        key: `policy:${i + 1}`,
        kind: 'policy',
        sourceTitle: `${DEMO_TAG} Chính sách cửa hàng`,
        section: p.title,
        lang: p.lang,
        text: p.content,
      }),
    ),
  );

  let chunkCount = 0;
  await deps.workerDb.withJob(workspaceId, async (tx) => {
    // Embedding THẬT theo model hoạt động ở DB + dịch vụ ml từ env; thiếu một trong hai → đoạn không có vector (chỉ toàn văn/trigram). Không có mock (FR-133).
    const embedding = resolveEmbeddingConfig(
      loadEmbeddingService(process.env),
      (await getEmbeddingState(tx)).activeModel,
    );
    console.info(`Embedding khi tạo dữ liệu mẫu: ${embedding.describe.note}`);
    const embedder = embedding.kind === 'ml' ? embedding.embedder : undefined;
    for (const [key, drafts] of draftsBySource) {
      const { rows } = await buildChunkRows({ drafts, existing: [], embedder });
      await upsertDraftChunks(tx, workspaceId, must(sourceIds.get(key), 'nguồn kiến thức'), rows);
      chunkCount += rows.length;
    }
    await lockKbPublish(tx, workspaceId);
    const first = (await getCurrentVersion(tx, workspaceId))?.number ?? 0;
    const keysOf = (...names: string[]) =>
      names.flatMap((n) =>
        (draftsBySource.get(n) ?? []).map((d) => ({
          sourceId: must(sourceIds.get(n), 'nguồn'),
          chunkKey: d.chunkKey,
        })),
      );
    await createKbVersionFromChunks(tx, workspaceId, {
      number: first + 1,
      publishedBy: ownerId,
      note: `${DEMO_TAG} Xuất bản lần đầu: FAQ và chính sách`,
      changedCategories: ['faq', 'policy'],
      scope: { kind: 'draft' },
      keys: keysOf('faq', 'policy'),
    });
    await createKbVersionFromChunks(tx, workspaceId, {
      number: first + 2,
      publishedBy: ownerId,
      note: `${DEMO_TAG} Thêm thông tin shop`,
      changedCategories: ['manual'],
      scope: { kind: 'draft' },
      keys: keysOf('faq', 'policy', 'shop'),
    });
  });
  return { kb_sources: sourceIds.size, kb_draft_chunks: chunkCount, kb_versions: 2 };
}

function leadVaultFromEnv(env: Record<string, string | undefined>) {
  // Dùng khóa thật của dev nếu có (để nút "xem số" của giao diện giải mã được); không thì khóa tạm — lead vẫn
  // hiện được 4 số cuối nhưng không giải mã được sau này. Khóa tạm dựng lúc chạy, không nằm trong mã nguồn.
  if (env.LEADS_ENC_KEYS && env.LEADS_HASH_KEY) {
    return createLeadVault({
      encKeys: parseLeadKeys(env.LEADS_ENC_KEYS),
      hashKey: parseLeadHashKey(env.LEADS_HASH_KEY),
    });
  }
  const hex = () => randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  return createLeadVault({
    encKeys: parseLeadKeys(`v1:${hex()}`),
    hashKey: parseLeadHashKey(hex()),
  });
}

/** ~25 khách tiềm năng ở 4 cột Kanban. SĐT là số GIẢ `0900…` (chỉ lưu bản mã + băm); giao diện chỉ hiện 4 số cuối. */
async function seedLeads(
  ctx: ContentCtx,
  ids: Ids,
  env: Record<string, string | undefined>,
): Promise<SeedCounts> {
  const { deps, workspaceId, ownerId } = ctx;
  const vault = leadVaultFromEnv(env);
  const prepared: PreparedLead[] = DEMO_LEADS.map((spec) => {
    const id = randomUUID();
    const phoneRaw = `0900${String(100000 + spec.key * 3137).slice(-6)}`;
    const phone = normalizeLeadPhone(phoneRaw);
    const emailRaw = `khach${spec.key}.mau@example.test`;
    const wantPhone = spec.contact !== 'email';
    const wantEmail = spec.contact !== 'phone';
    return {
      id,
      channelId: must(ids.channels.get(spec.channelKey), 'kênh'),
      sourceType: spec.source,
      sourceId: null,
      phone:
        wantPhone && phone
          ? {
              enc: vault.encrypt(phone, { workspaceId, leadId: id, field: 'phone' }).ciphertext,
              hash: vault.blindIndex(workspaceId, 'phone', phone),
              last4: phone.slice(-4),
            }
          : null,
      email: wantEmail
        ? {
            enc: vault.encrypt(emailRaw, { workspaceId, leadId: id, field: 'email' }).ciphertext,
            hash: vault.blindIndex(workspaceId, 'email', emailRaw),
          }
        : null,
      keyVersion: vault.currentVersion,
    };
  });
  const saved = await deps.workerDb.withJob(workspaceId, (tx) =>
    recordLeads(tx, workspaceId, prepared),
  );
  await deps.appDb.withActor(workspaceId, ownerId, async (tx) => {
    for (const [i, spec] of DEMO_LEADS.entries()) {
      const leadId = must(saved[i]?.id, 'lead');
      const assignedTo =
        spec.assignee === 'staff'
          ? ctx.staffIds.staff
          : spec.assignee === 'staff2'
            ? ctx.staffIds.staff2
            : null;
      const patch = ok(
        parseLeadUpdate({
          name: `${DEMO_TAG} Khách tiềm năng ${String(spec.key).padStart(2, '0')}`,
          stage: spec.stage,
          note: spec.note,
          assignedTo,
        }),
        `lead ${spec.key}`,
      );
      await updateLead(tx, workspaceId, leadId, patch);
    }
  });
  return { leads: saved.length };
}

/** Giao việc / trạng thái / AI cho hội thoại: Owner (`withActor`). */
async function finishConversations(ctx: ContentCtx, convIds: readonly string[]): Promise<void> {
  const { deps, workspaceId, ownerId } = ctx;
  await deps.appDb.withActor(workspaceId, ownerId, async (tx) => {
    for (const [i, spec] of DEMO_CONVERSATIONS.entries()) {
      const id = must(convIds[i], 'hội thoại');
      const userId =
        spec.assignee === 'staff'
          ? ctx.staffIds.staff
          : spec.assignee === 'staff2'
            ? ctx.staffIds.staff2
            : null;
      if (userId) await assignConversation(tx, workspaceId, id, userId);
      if (spec.status === 'resolved') await setConversationStatus(tx, workspaceId, id, 'resolved');
      if (!spec.aiEnabled) await setConversationAi(tx, workspaceId, id, false, 'human_takeover');
    }
  });
}

/** 45+ dòng nhật ký rải 14 ngày. Người dùng ghi bằng chính phiên của họ; AI/hệ thống ghi bằng đường hệ thống. */
async function seedActionLogs(ctx: ContentCtx, now: Date): Promise<SeedCounts> {
  const { deps, workspaceId } = ctx;
  const actorId = {
    owner: ctx.ownerId,
    staff: ctx.staffIds.staff,
    staff2: ctx.staffIds.staff2,
  } as const;
  const at = (daysAgo: number, hour: number) => {
    const d = new Date(now.getTime() - daysAgo * DAY);
    d.setHours(hour, 7 + ((daysAgo * 13 + hour * 7) % 50), 0, 0);
    return d.getTime() > now.getTime() ? new Date(now.getTime() - 10 * minutes(1)) : d;
  };
  const row = (s: (typeof DEMO_ACTION_LOGS)[number], actorType: string, id: string | null) => ({
    workspaceId,
    actorType,
    actorId: id,
    action: s.action,
    targetType: s.targetType,
    targetId: workspaceId,
    after: { note: s.note },
    createdAt: at(s.daysAgo, s.hour),
  });
  for (const who of ['owner', 'staff', 'staff2'] as const) {
    const mine = DEMO_ACTION_LOGS.filter((s) => s.actor === who);
    await deps.appDb.withActor(workspaceId, actorId[who], async (tx) => {
      await tx.insert(schema.actionLogs).values(mine.map((s) => row(s, 'user', actorId[who])));
    });
  }
  const system = DEMO_ACTION_LOGS.filter((s) => s.actor === 'ai' || s.actor === 'system');
  await deps.workerDb.withJob(workspaceId, async (tx) => {
    await tx
      .insert(schema.actionLogs)
      .values(system.map((s) => row(s, s.actor === 'ai' ? 'ai' : 'system', null)));
  });
  return { action_logs: DEMO_ACTION_LOGS.length };
}

/** Gói Starter, hạn mức AI ~71%, 3 hóa đơn (2 đã thanh toán, 1 chờ). Đã có gói/bộ đếm/hóa đơn thì giữ nguyên. */
async function seedBilling(ctx: ContentCtx, now: Date): Promise<SeedCounts> {
  const { deps, workspaceId } = ctx;
  const { product, planCode, meter, usedTurns, limitTurns } = DEMO_BILLING;
  const counts: SeedCounts = { invoices: 0 };
  await deps.workerDb.withJob(workspaceId, async (tx) => {
    const sub = await getSubscription(tx, workspaceId, product);
    if (!sub) {
      await activatePlan(tx, {
        workspaceId,
        product,
        planCode,
        periodStart: new Date(now.getTime() - 10 * DAY),
        periodEnd: new Date(now.getTime() + 20 * DAY),
      });
      counts.subscriptions = 1;
    }
    const periodStart = usagePeriodStart(now, 'Asia/Ho_Chi_Minh');
    const counter = await getUsageCounter(tx, { workspaceId, product, meter, periodStart });
    if (!counter || counter.used === 0) {
      await consumeUsage(tx, {
        workspaceId,
        product,
        meter,
        amount: usedTurns,
        periodStart,
        limit: limitTurns,
      });
      counts.usage_counters = 1;
    }
    const have = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM core.invoices
      WHERE workspace_id = ${workspaceId}::uuid AND items::text LIKE ${`%${DEMO_TAG}%`}`);
    if ((have.rows[0]?.n ?? 0) > 0) return;
    for (const inv of DEMO_BILLING.invoices) {
      const created = await createInvoice(tx, {
        workspaceId,
        product,
        items: [{ description: inv.description, quantity: 1, unitPriceVnd: inv.amountVnd }],
        dueAt: new Date(now.getTime() + inv.dueInDays * DAY),
      });
      if (inv.paid) {
        await confirmInvoicePayment(tx, {
          workspaceId,
          invoiceId: created.id,
          amountVnd: inv.amountVnd,
          bankRef: `DEMO${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
          confirmedBy: null,
        });
      }
      counts.invoices = (counts.invoices ?? 0) + 1;
    }
  });
  return counts;
}

export type SeedContentOptions = { env: Record<string, string | undefined>; now: Date };

/** Nạp toàn bộ dữ liệu mẫu vào workspace đã có Owner + 2 Staff. Gọi sau khi dọn dữ liệu mẫu cũ (nếu có). */
export async function seedContent(
  ctx: ContentCtx,
  options: SeedContentOptions,
): Promise<SeedCounts> {
  const ids: Ids = {
    channels: new Map(),
    posts: new Map(),
    comments: new Map(),
    products: new Map(),
    conversations: [],
  };
  const counts: SeedCounts = {
    channels: DEMO_CHANNELS.length,
    posts: DEMO_POSTS.length,
    products: DEMO_PRODUCTS.length,
    variants: DEMO_PRODUCTS.reduce((n, p) => n + p.variants.length, 0),
  };
  Object.assign(counts, await seedChannelsAndConversations(ctx, ids, options.now));
  counts.comments = DEMO_COMMENTS.length + (counts.comments_extra ?? 0);
  Object.assign(counts, await seedCatalog(ctx, ids, options.now));
  Object.assign(counts, await seedKnowledgeAndSettings(ctx, ids));
  Object.assign(counts, await seedKnowledgeBase(ctx, options.now));
  Object.assign(counts, await seedLeads(ctx, ids, options.env));
  await finishConversations(ctx, ids.conversations);
  Object.assign(counts, await seedActionLogs(ctx, options.now));
  Object.assign(counts, await seedBilling(ctx, options.now));
  return counts;
}

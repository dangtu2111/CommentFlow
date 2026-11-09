import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import { getCurrentVersion, type KbVersionRef } from './kb-publish';
import { countCustomerPostReplies, loadPipelineConvo, type PipelineConvo } from './pipeline-convo';

/**
 * Ngữ cảnh thật cho job `pipeline` (PIPE-ORCHESTRATOR lát B): CHỈ ĐỌC, mọi truy vấn lọc `workspace_id`; gọi trong
 * `withJob`/`withWorkspace` (RLS vẫn áp dụng). Không quyết định gì thay nơi gọi: bình luận của Page/đã xóa/đã gộp vẫn được trả
 * về kèm cờ để nơi gọi (và `shouldAutoRunPipeline`) quyết định, không bỏ qua ngầm.
 *
 * Định nghĩa chuỗi: các bình luận CÙNG khách (`author_external_id`) CÙNG bài, đến TRƯỚC bình luận đang xử lý, không phải của Page,
 * chưa xóa, và không phải bình luận đã gộp vào chính nó (cùng một lượt).
 */
export type PipelineContext = {
  comment: {
    id: string;
    channelId: string;
    postId: string;
    externalId: string;
    parentExternalId: string | null;
    authorExternalId: string;
    authorName: string | null;
    /** Văn bản GỐC (chưa che PII) — nơi gọi phải che trước khi đưa đi đâu khác (nguyên tắc #6). */
    text: string;
    createdTime: Date;
    status: string;
    isOwn: boolean;
    deleted: boolean;
    mergedIntoId: string | null;
    /** `webhook` | `polling` | `backfill` (migration 0072, Q-POR1). */
    ingestSource: string;
    attachmentTypes: string[];
  };
  post: { id: string; caption: string | null; isAd: boolean };
  /** Sản phẩm gắn bài ĐÃ XÁC NHẬN, sản phẩm chính trước (gợi ý của AI chưa xác nhận không tính). */
  postProductIds: string[];
  /** Tên Page của kênh (cho luật mạo danh, FR-155). */
  pageNames: string[];
  thread: { clarifyCount: number; repeatCount: number; humanHolding: boolean };
  /** Gợi ý ngôn ngữ trả lời cho câu quá ngắn để nhận ngôn ngữ (xem `resolveLanguageHints`). */
  language: LanguageHints;
  settings: {
    mergeWindowSeconds: number;
    humanHoldMinutes: number;
    /** FR-167: số câu AI tối đa cho một khách dưới một bài trong 24 giờ (1–5, mặc định 3). */
    maxAiRepliesPerCustomerPost: number;
  };
  /** Số câu AI đã soạn/gửi cho (khách, bài) trong 24 giờ, gộp mọi chuỗi + bình luận mới; không tính chính bình luận này (FR-167). */
  customerPostReplies24h: number;
  /** Ngữ cảnh hội thoại ĐÃ che PII (FR-137/144, Q-POR12). */
  convo: PipelineConvo;
  /** Bản kiến thức mới nhất ĐÃ XUẤT BẢN (bản nháp không bao giờ vào luồng thật); chưa có → `null`. */
  kbVersion: KbVersionRef | null;
};

/** Mặc định khi workspace chưa có dòng `automation_settings` (khớp mặc định cột, migration 0072). */
export const DEFAULT_MERGE_WINDOW_SECONDS = 30;
export const DEFAULT_HUMAN_HOLD_MINUTES = 120;
export const DEFAULT_MAX_AI_REPLIES_PER_CUSTOMER_POST = 3;
/** Số lượt trước tối đa đọc để đếm (chặn chuỗi dài bất thường). */
const MAX_EARLIER = 100;
const SENT_STATUSES = ['sent_as_is', 'edited', 'auto_sent'] as const;

/** Chuẩn hóa để so "cùng nội dung": bỏ khoảng trắng thừa, không phân biệt hoa/thường. */
const sameText = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

type CommentRow = {
  id: string;
  channel_id: string;
  post_id: string;
  external_id: string;
  parent_external_id: string | null;
  author_external_id: string;
  author_name: string | null;
  text: string;
  created_time: string | Date;
  status: string;
  is_own: boolean;
  deleted_at: string | Date | null;
  merged_into_id: string | null;
  ingest_source: string;
  attachments: unknown;
  post_message: string | null;
  post_is_ad: boolean;
  channel_name: string;
  channel_reply_language: string;
};

function attachmentTypesOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const type = (item as { type?: unknown } | null)?.type;
    return typeof type === 'string' ? [type] : [];
  });
}

export type LanguageHints = { replyLanguage: 'vi' | 'en' | null; previousLang: 'vi' | 'en' | null };

const asLang = (value: unknown): 'vi' | 'en' | null =>
  value === 'vi' || value === 'en' ? value : null;

/**
 * Thứ tự ngôn ngữ cho câu quá ngắn: `channels.reply_language` (khác 'auto') → ngôn ngữ lượt khách trước → `workspaces.default_lang`. `normalizeAndDetectLang` ưu tiên `previousLang` hơn `replyLanguage`,
 * nên khi kênh chọn cố định thì KHÔNG truyền `previousLang` (kênh thắng); không cố định → `previousLang` đứng trước, mặc định workspace làm `replyLanguage` (cuối cùng).
 */
export function resolveLanguageHints(input: {
  channelLanguage: string;
  workspaceDefault: string | null;
  previousLang: string | null;
}): LanguageHints {
  const fixed = asLang(input.channelLanguage);
  if (fixed) return { replyLanguage: fixed, previousLang: null };
  return {
    replyLanguage: asLang(input.workspaceDefault),
    previousLang: asLang(input.previousLang),
  };
}

async function workspaceDefaultLang(tx: Database, workspaceId: string): Promise<string | null> {
  const found = await tx.execute<{ default_lang: string }>(sql`
    SELECT default_lang FROM core.workspaces WHERE id = ${workspaceId}::uuid`);
  return found.rows[0]?.default_lang ?? null;
}

/** Ngôn ngữ đã nhận ra của bình luận khách TRƯỚC đó (cùng bài, cùng người), nếu có. */
async function previousCustomerLang(
  tx: Database,
  input: {
    workspaceId: string;
    postId: string;
    authorExternalId: string;
    commentId: string;
    before: Date;
  },
): Promise<string | null> {
  const found = await tx.execute<{ lang: string | null }>(sql`
    SELECT lang FROM cf.comments
     WHERE workspace_id = ${input.workspaceId}::uuid AND post_id = ${input.postId}::uuid
       AND author_external_id = ${input.authorExternalId} AND id <> ${input.commentId}::uuid
       AND created_time < ${input.before.toISOString()}::timestamptz AND lang IN ('vi', 'en')
     ORDER BY created_time DESC LIMIT 1`);
  return found.rows[0]?.lang ?? null;
}

export async function loadPipelineContext(
  tx: Database,
  workspaceId: string,
  commentId: string,
  now: Date,
): Promise<PipelineContext | null> {
  const found = await tx.execute<CommentRow>(sql`
    SELECT c.id, c.channel_id, c.post_id, c.external_id, c.parent_external_id, c.author_external_id, c.author_name, c.text,
           c.created_time, c.status, c.is_own, c.deleted_at, c.merged_into_id, c.ingest_source, c.attachments,
           p.message AS post_message, p.is_ad AS post_is_ad, ch.name AS channel_name, ch.reply_language AS channel_reply_language
      FROM cf.comments c
      JOIN cf.posts p ON p.id = c.post_id AND p.workspace_id = c.workspace_id
      JOIN cf.channels ch ON ch.id = c.channel_id AND ch.workspace_id = c.workspace_id
     WHERE c.workspace_id = ${workspaceId}::uuid AND c.id = ${commentId}::uuid`);
  const row = found.rows[0];
  if (!row) return null;
  const createdTime = new Date(row.created_time);

  const settingsRows = await tx.execute<{
    merge_window_seconds: number;
    human_hold_minutes: number;
    max_ai_replies_per_customer_post: number;
  }>(sql`
    SELECT merge_window_seconds, human_hold_minutes, max_ai_replies_per_customer_post FROM cf.automation_settings
     WHERE workspace_id = ${workspaceId}::uuid`);
  const settings = {
    mergeWindowSeconds: settingsRows.rows[0]?.merge_window_seconds ?? DEFAULT_MERGE_WINDOW_SECONDS,
    humanHoldMinutes: settingsRows.rows[0]?.human_hold_minutes ?? DEFAULT_HUMAN_HOLD_MINUTES,
    maxAiRepliesPerCustomerPost:
      settingsRows.rows[0]?.max_ai_replies_per_customer_post ??
      DEFAULT_MAX_AI_REPLIES_PER_CUSTOMER_POST,
  };

  const products = await tx.execute<{ product_id: string }>(sql`
    SELECT product_id FROM cf.post_products
     WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${row.post_id}::uuid AND status = 'confirmed'
     ORDER BY is_primary DESC, product_id`);

  const earlier = await tx.execute<{
    id: string;
    text: string;
    replied_by: string | null;
    replied_at: string | Date | null;
  }>(sql`
    SELECT id, text, replied_by, replied_at FROM cf.comments
     WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${row.post_id}::uuid
       AND author_external_id = ${row.author_external_id}
       AND id <> ${commentId}::uuid AND is_own = false AND deleted_at IS NULL
       AND created_time < ${createdTime.toISOString()}::timestamptz
       AND (merged_into_id IS NULL OR merged_into_id <> ${commentId}::uuid)
     ORDER BY created_time DESC, id
     LIMIT ${MAX_EARLIER}`);

  const wanted = sameText(row.text);
  const repeatCount = earlier.rows.filter((r) => sameText(r.text) === wanted).length;
  // Khung giữ = 0 → Owner tắt tính năng: không bao giờ coi là đang giữ.
  const holdSince =
    settings.humanHoldMinutes > 0 ? now.getTime() - settings.humanHoldMinutes * 60_000 : null;
  const humanHolding =
    holdSince !== null &&
    earlier.rows.some(
      (r) =>
        r.replied_by !== null &&
        r.replied_at !== null &&
        new Date(r.replied_at).getTime() >= holdSince,
    );

  let clarifyCount = 0;
  if (earlier.rows.length > 0) {
    const ids = sql.join(
      earlier.rows.map((r) => sql`${r.id}::uuid`),
      sql`, `,
    );
    const sent = sql.join(
      SENT_STATUSES.map((status) => sql`${status}`),
      sql`, `,
    );
    const counted = await tx.execute<{ n: string }>(sql`
      SELECT count(*) AS n FROM cf.drafts
       WHERE workspace_id = ${workspaceId}::uuid AND target_type = 'comment' AND action = 'clarify'
         AND status IN (${sent}) AND target_id IN (${ids})`);
    clarifyCount = Number(counted.rows[0]?.n ?? 0);
  }

  return {
    comment: {
      id: row.id,
      channelId: row.channel_id,
      postId: row.post_id,
      externalId: row.external_id,
      parentExternalId: row.parent_external_id,
      authorExternalId: row.author_external_id,
      authorName: row.author_name,
      text: row.text,
      createdTime,
      status: row.status,
      isOwn: row.is_own,
      deleted: row.deleted_at !== null,
      mergedIntoId: row.merged_into_id,
      ingestSource: row.ingest_source,
      attachmentTypes: attachmentTypesOf(row.attachments),
    },
    post: { id: row.post_id, caption: row.post_message, isAd: row.post_is_ad },
    postProductIds: products.rows.map((r) => r.product_id),
    pageNames: [row.channel_name],
    thread: { clarifyCount, repeatCount, humanHolding },
    language: resolveLanguageHints({
      channelLanguage: row.channel_reply_language,
      workspaceDefault: await workspaceDefaultLang(tx, workspaceId),
      previousLang: await previousCustomerLang(tx, {
        workspaceId,
        postId: row.post_id,
        authorExternalId: row.author_external_id,
        commentId,
        before: createdTime,
      }),
    }),
    settings,
    customerPostReplies24h: await countCustomerPostReplies(
      tx,
      workspaceId,
      row.post_id,
      row.author_external_id,
      now,
      commentId,
    ),
    convo: await loadPipelineConvo(tx, {
      workspaceId,
      commentId,
      postId: row.post_id,
      authorExternalId: row.author_external_id,
      parentExternalId: row.parent_external_id,
      channelId: row.channel_id,
      postCaption: row.post_message,
      createdTime,
      now,
    }),
    kbVersion: await getCurrentVersion(tx, workspaceId),
  };
}

import { sql } from 'drizzle-orm';
import type { Database } from './client';
import { setPublishPostMedia } from './publish-media';

/**
 * Bài viết để đăng lên Facebook (migration 0090, POST-PUBLISHING, Q-PUB1). `cf_app` không ghi được bảng; mọi ghi qua hàm DEFINER:
 * Owner (`withActor`): lưu/sửa, hủy lịch, xóa, đăng ngay. Worker: liệt kê workspace đến hạn (`withSystem`), nhận mục tiêu và ghi kết quả (`withJob`).
 * Quyền do DB quyết định (Staff/người lạ → 42501). Tối đa MỘT lần: mục tiêu được thuê trước khi gọi nền tảng; kết quả không rõ → `unknown`, không tự thử lại.
 */
export const PUBLISH_MAX_MESSAGE_CHARS = 63206;
export const PUBLISH_MIN_LEAD_MINUTES = 2;
export const PUBLISH_MAX_LEAD_DAYS = 90;

export type PublishPostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partial'
  | 'failed';
export type PublishTargetStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'unknown';

export type PublishTarget = {
  id: string;
  channelId: string;
  channelName: string;
  status: PublishTargetStatus;
  errorCode: string | null;
  externalPostId: string | null;
};

export type PublishPostItem = {
  id: string;
  message: string;
  status: PublishPostStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  /** Ngày/giờ địa phương để đặt vào lịch (`published_at`, nếu chưa có thì `scheduled_at`); bản nháp không có. */
  day: string | null;
  time: string | null;
  targets: PublishTarget[];
};

const asDate = (value: string | Date | null): Date | null =>
  value === null ? null : value instanceof Date ? value : new Date(value);

/** Lưu (tạo hoặc sửa) bài: `scheduledAt = null` → nháp; có giờ → đã lên lịch. Trả id. Chỉ Owner (42501); đầu vào sai 22023; bài không còn sửa được 55000. */
export async function savePublishPost(
  tx: Database,
  input: {
    id?: string | null;
    message: string;
    channelIds: readonly string[];
    scheduledAt?: Date | null;
    /** Sản phẩm gắn vào bài (thứ tự đầu = chính, tối đa 5). Owner chọn lúc soạn = xác nhận (migration 0091). */
    productIds?: readonly string[];
    /** Ảnh/video gắn vào bài (thứ tự giữ nguyên; tối đa 10 ảnh hoặc 1 video). Luôn đặt lại toàn bộ (rỗng = gỡ hết). */
    mediaIds?: readonly string[];
    /** Ghi chú riêng cho AI (1–1000 ký tự; rỗng/null = xóa). Khi bài đăng thành công, thành ghi chú bài ở `post_notes`. */
    aiNote?: string | null;
  },
): Promise<string> {
  const channels =
    input.channelIds.length === 0
      ? sql`'{}'::uuid[]`
      : sql`ARRAY[${sql.join(
          input.channelIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]::uuid[]`;
  const r = await tx.execute<{ id: string }>(sql`
    SELECT cf.save_publish_post(
      ${input.id ?? null}::uuid, ${input.message}, ${channels}, ${input.scheduledAt ? input.scheduledAt.toISOString() : null}::timestamptz
    ) AS id`);
  const id = r.rows[0]?.id;
  if (!id) throw new Error('publish_post_not_saved');
  const products = input.productIds ?? [];
  const productArray =
    products.length === 0
      ? sql`'{}'::uuid[]`
      : sql`ARRAY[${sql.join(
          products.map((p) => sql`${p}::uuid`),
          sql`, `,
        )}]::uuid[]`;
  await tx.execute(sql`SELECT cf.set_publish_post_products(${id}::uuid, ${productArray})`);
  await setPublishPostMedia(tx, id, input.mediaIds ?? []);
  await tx.execute(sql`SELECT cf.set_publish_post_note(${id}::uuid, ${input.aiNote ?? null})`);
  return id;
}

/** Ghi chú riêng cho AI của một bài (chỉ Owner thấy; RLS của publish_posts). */
export async function getPublishPostNote(
  tx: Database,
  workspaceId: string,
  postId: string,
): Promise<string | null> {
  const r = await tx.execute<{ ai_note: string | null }>(
    sql`SELECT ai_note FROM cf.publish_posts WHERE workspace_id = ${workspaceId}::uuid AND id = ${postId}::uuid`,
  );
  return r.rows[0]?.ai_note ?? null;
}

export type PickableProduct = {
  id: string;
  name: string;
  sku: string | null;
  priceVnd: number | null;
  /** Ảnh sản phẩm từ nguồn đồng bộ; web chỉ hiển thị nếu là https. */
  imageUrl: string | null;
};
export const PICKABLE_PRODUCT_LIMIT = 200;

/** Sản phẩm đang bán của workspace để Owner chọn gắn vào bài (RLS theo workspace). Giá đọc từ `products`, không từ vector. */
export async function listPickableProducts(
  tx: Database,
  workspaceId: string,
): Promise<PickableProduct[]> {
  const r = await tx.execute<{
    id: string;
    name: string;
    sku: string | null;
    price_vnd: string | number | null;
    image_url: string | null;
  }>(sql`
    SELECT id, name, sku, price_vnd, image_url FROM cf.products
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'active'
     ORDER BY name, id LIMIT ${PICKABLE_PRODUCT_LIMIT}`);
  return r.rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    imageUrl: row.image_url,
    priceVnd: row.price_vnd === null ? null : Number(row.price_vnd),
  }));
}

/** Id sản phẩm đã gắn vào một bài (theo thứ tự chọn; chỉ Owner thấy). */
export async function listPublishPostProductIds(
  tx: Database,
  workspaceId: string,
  postId: string,
): Promise<string[]> {
  const r = await tx.execute<{ product_id: string }>(sql`
    SELECT product_id FROM cf.publish_post_products
     WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid ORDER BY position`);
  return r.rows.map((row) => row.product_id);
}

/**
 * Sửa nhanh nội dung và/hoặc giờ của MỘT bài nháp/đã lên lịch (Lịch: kéo thả, hộp thoại chỉnh sửa); không đụng kênh/media/sản phẩm/ghi chú.
 * `scheduledAt = null` → nháp; có giờ → lên lịch. Chỉ Owner (42501); đầu vào/giờ sai 22023; bài không còn sửa được 55000.
 */
export async function updatePublishPost(
  tx: Database,
  input: { id: string; message: string; scheduledAt: Date | null },
): Promise<void> {
  await tx.execute(
    sql`SELECT cf.update_publish_post(${input.id}::uuid, ${input.message}, ${input.scheduledAt ? input.scheduledAt.toISOString() : null}::timestamptz)`,
  );
}

/** Hủy lịch (`scheduled` → `draft`). `false` nếu không còn `scheduled` hoặc đã có mục tiêu đi tiếp. */
export async function cancelPublishSchedule(tx: Database, id: string): Promise<boolean> {
  const r = await tx.execute<{ ok: boolean }>(
    sql`SELECT cf.cancel_publish_schedule(${id}::uuid) AS ok`,
  );
  return r.rows[0]?.ok === true;
}

/** Xóa bài `draft`/`failed`/`partial`. `false` nếu không xóa được (đang chờ/đang đăng/đã đăng thành công). */
export async function deletePublishPost(tx: Database, id: string): Promise<boolean> {
  const r = await tx.execute<{ ok: boolean }>(
    sql`SELECT cf.delete_publish_post(${id}::uuid) AS ok`,
  );
  return r.rows[0]?.ok === true;
}

/** Đăng ngay: đặt `scheduled` với giờ = bây giờ; worker nhận ở lần quét kế tiếp. `false` nếu bài không ở trạng thái cho phép. */
export async function publishPostNow(tx: Database, id: string): Promise<boolean> {
  const r = await tx.execute<{ ok: boolean }>(sql`SELECT cf.publish_post_now(${id}::uuid) AS ok`);
  return r.rows[0]?.ok === true;
}

type Row = {
  id: string;
  message: string;
  status: PublishPostStatus;
  scheduled_at: string | Date | null;
  published_at: string | Date | null;
  day: string | null;
  hhmm: string | null;
};
type TargetRow = {
  id: string;
  post_id: string;
  channel_id: string;
  channel_name: string;
  status: PublishTargetStatus;
  error_code: string | null;
  external_post_id: string | null;
};

async function withTargets(
  tx: Database,
  workspaceId: string,
  rows: Row[],
): Promise<PublishPostItem[]> {
  if (rows.length === 0) return [];
  const ids = sql.join(
    rows.map((row) => sql`${row.id}::uuid`),
    sql`, `,
  );
  const targets = await tx.execute<TargetRow>(sql`
    SELECT t.id, t.post_id, t.channel_id, ch.name AS channel_name, t.status, t.error_code, t.external_post_id
      FROM cf.publish_post_targets t
      JOIN cf.channels ch ON ch.id = t.channel_id AND ch.workspace_id = t.workspace_id
     WHERE t.workspace_id = ${workspaceId}::uuid AND t.post_id IN (${ids})
     ORDER BY ch.name, t.id`);
  return rows.map((row) => ({
    id: row.id,
    message: row.message,
    status: row.status,
    scheduledAt: asDate(row.scheduled_at),
    publishedAt: asDate(row.published_at),
    day: row.day,
    time: row.hhmm,
    targets: targets.rows
      .filter((t) => t.post_id === row.id)
      .map((t) => ({
        id: t.id,
        channelId: t.channel_id,
        channelName: t.channel_name,
        status: t.status,
        errorCode: t.error_code,
        externalPostId: t.external_post_id,
      })),
  }));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

/** Bài của MỘT tuần cho Lịch đăng (không gồm nháp): đặt theo `published_at`, nếu chưa có thì `scheduled_at`, đổi sang múi giờ workspace ở DB. Chỉ Owner/hệ thống thấy (RLS). */
export async function listPublishPostsForWeek(
  tx: Database,
  workspaceId: string,
  weekStart: string,
  timeZone: string,
): Promise<PublishPostItem[]> {
  if (!ISO_DATE.test(weekStart)) throw new Error('invalid_week_start');
  if (!TIME_ZONE.test(timeZone)) throw new Error('invalid_time_zone');
  const result = await tx.execute<Row>(sql`
    SELECT p.id, p.message, p.status, p.scheduled_at, p.published_at,
           to_char(coalesce(p.published_at, p.scheduled_at) AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
           to_char(coalesce(p.published_at, p.scheduled_at) AT TIME ZONE ${timeZone}, 'HH24:MI') AS hhmm
      FROM cf.publish_posts p
     WHERE p.workspace_id = ${workspaceId}::uuid AND p.status <> 'draft'
       AND coalesce(p.published_at, p.scheduled_at) IS NOT NULL
       AND (coalesce(p.published_at, p.scheduled_at) AT TIME ZONE ${timeZone}) >= ${weekStart}::date::timestamp
       AND (coalesce(p.published_at, p.scheduled_at) AT TIME ZONE ${timeZone}) < (${weekStart}::date + 7)::timestamp
     ORDER BY coalesce(p.published_at, p.scheduled_at), p.id
     LIMIT 300`);
  return withTargets(tx, workspaceId, result.rows);
}

/** Bản nháp (chưa có ngày) của workspace, mới sửa trước. */
export async function listPublishDrafts(
  tx: Database,
  workspaceId: string,
): Promise<PublishPostItem[]> {
  const result = await tx.execute<Row>(sql`
    SELECT p.id, p.message, p.status, p.scheduled_at, p.published_at, NULL::text AS day, NULL::text AS hhmm
      FROM cf.publish_posts p
     WHERE p.workspace_id = ${workspaceId}::uuid AND p.status = 'draft'
     ORDER BY p.updated_at DESC, p.id
     LIMIT 50`);
  return withTargets(tx, workspaceId, result.rows);
}

/** Một bài theo id (để sửa trong Biên tập); `null` nếu không có/không thuộc workspace. */
export async function getPublishPost(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<PublishPostItem | null> {
  const result = await tx.execute<Row>(sql`
    SELECT p.id, p.message, p.status, p.scheduled_at, p.published_at, NULL::text AS day, NULL::text AS hhmm
      FROM cf.publish_posts p
     WHERE p.workspace_id = ${workspaceId}::uuid AND p.id = ${id}::uuid`);
  return (await withTargets(tx, workspaceId, result.rows))[0] ?? null;
}

/** WORKER (`withSystem`, ngữ cảnh trần của cf_worker): workspace có bài đến hạn và KHÔNG đang Dừng khẩn cấp. */
export async function listDuePublishWorkspaces(tx: Database, limit: number): Promise<string[]> {
  const r = await tx.execute<{ workspace_id: string }>(
    sql`SELECT workspace_id FROM cf.list_due_publish_workspaces(${limit}::integer)`,
  );
  return r.rows.map((row) => row.workspace_id);
}

export type ClaimedPublishTarget = {
  targetId: string;
  postId: string;
  channelId: string;
  channelExternalId: string;
  message: string;
  scopes: string[];
  attempts: number;
};

/** WORKER (`withJob`): hết hạn thuê cũ → `unknown`; nhận tối đa `limit` mục tiêu đến hạn (không nhận trùng giữa các worker). */
export async function claimPublishTargets(
  tx: Database,
  limit: number,
): Promise<ClaimedPublishTarget[]> {
  const r = await tx.execute<{
    target_id: string;
    post_id: string;
    channel_id: string;
    channel_external_id: string;
    message: string;
    scopes: string[];
    attempts: number;
  }>(sql`SELECT * FROM cf.claim_publish_targets(${limit}::integer)`);
  return r.rows.map((row) => ({
    targetId: row.target_id,
    postId: row.post_id,
    channelId: row.channel_id,
    channelExternalId: row.channel_external_id,
    message: row.message,
    scopes: row.scopes ?? [],
    attempts: row.attempts,
  }));
}

export type PublishOutcome = 'published' | 'failed' | 'unknown' | 'retry';

/** WORKER (`withJob`): ghi kết quả của một mục tiêu đang `publishing`. `false` nếu mục tiêu không còn `publishing` (không ghi đè). `error` chỉ là MÃ (không nội dung). */
export async function recordPublishResult(
  tx: Database,
  targetId: string,
  outcome: PublishOutcome,
  detail: { externalPostId?: string | null; error?: string | null } = {},
): Promise<boolean> {
  const r = await tx.execute<{ ok: boolean }>(sql`
    SELECT cf.record_publish_result(${targetId}::uuid, ${outcome}, ${detail.externalPostId ?? null}, ${detail.error ?? null}) AS ok`);
  return r.rows[0]?.ok === true;
}

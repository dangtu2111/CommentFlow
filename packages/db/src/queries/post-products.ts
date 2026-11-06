import type { LinkPostProductsInput, PostProductLink, PostProductStatus } from '@flow/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../client';

/**
 * Liên kết bài ↔ sản phẩm (FR-061, migration 0048, Q-PLP1). Ghi của người dùng: `withActor` (Owner/Staff);
 * đề xuất của AI/hệ thống: `withJob` (chỉ tạo được `suggested`). RLS chặn chéo workspace; bài/sản phẩm không
 * thuộc workspace → lỗi khóa ngoại 23503. Đầu vào hàng loạt PHẢI đã qua `parseLinkPostProducts`.
 */
export type PostProductRow = PostProductLink & {
  postId: string;
  suggestedByAi: boolean;
  confirmedBy: string | null;
};

type RawRow = {
  post_id: string;
  product_id: string;
  status: PostProductStatus;
  is_primary: boolean;
  suggested_by_ai: boolean;
  confirmed_by: string | null;
};

const toRow = (r: RawRow): PostProductRow => ({
  postId: r.post_id,
  productId: r.product_id,
  status: r.status,
  isPrimary: r.is_primary,
  suggestedByAi: r.suggested_by_ai,
  confirmedBy: r.confirmed_by,
});

/** Literal mảng Postgres từ chuỗi không chứa ký tự đặc biệt (uuid, `uuid:uuid`); drizzle không gói mảng JS thành một tham số. */
const pgArray = (values: readonly string[]): string => `{${values.join(',')}}`;

const COLS = sql`post_id, product_id, status, is_primary, suggested_by_ai, confirmed_by`;

/**
 * Gắn hàng loạt (N bài × M sản phẩm) trong MỘT giao dịch của người gọi: đề xuất cũ của cặp được nâng lên đã xác
 * nhận (xóa + tạo lại), cặp đã xác nhận giữ nguyên, không trùng. `primaryProductId` (đã nằm trong `productIds`)
 * chỉ đặt cho bài CHƯA có sản phẩm chính (không đè lựa chọn cũ). Trả số cặp mới được xác nhận.
 */
export async function linkProductsToPosts(
  tx: Database,
  workspaceId: string,
  userId: string,
  input: LinkPostProductsInput,
): Promise<number> {
  const posts = sql`unnest(${pgArray(input.postIds)}::uuid[])`;
  const prods = sql`unnest(${pgArray(input.productIds)}::uuid[])`;
  // Nâng đề xuất: nhớ cặp từng do AI đề xuất (suggested_by_ai) rồi tạo lại đã xác nhận.
  const del = await tx.execute<{ post_id: string; product_id: string }>(sql`
    DELETE FROM cf.post_products
    WHERE workspace_id = ${workspaceId}::uuid AND status = 'suggested'
      AND post_id IN (SELECT ${posts}) AND product_id IN (SELECT ${prods})
    RETURNING post_id, product_id`);
  const upgraded = del.rows.map((r) => `${r.post_id}:${r.product_id}`);
  const ins = await tx.execute(sql`
    INSERT INTO cf.post_products
      (workspace_id, post_id, product_id, status, is_primary, suggested_by_ai, confirmed_by)
    SELECT ${workspaceId}::uuid, p.post_id, q.product_id, 'confirmed', false,
           (p.post_id::text || ':' || q.product_id::text) = ANY(${pgArray(upgraded)}::text[]),
           ${userId}::uuid
    FROM (SELECT ${posts} AS post_id) p CROSS JOIN (SELECT ${prods} AS product_id) q
    ON CONFLICT (workspace_id, post_id, product_id) DO NOTHING`);
  if (input.primaryProductId !== null) {
    await tx.execute(sql`
      UPDATE cf.post_products pp SET is_primary = true, updated_at = now()
      WHERE pp.workspace_id = ${workspaceId}::uuid AND pp.product_id = ${input.primaryProductId}::uuid
        AND pp.status = 'confirmed' AND pp.post_id IN (SELECT ${posts})
        AND NOT EXISTS (
          SELECT 1 FROM cf.post_products o
          WHERE o.workspace_id = pp.workspace_id AND o.post_id = pp.post_id AND o.is_primary)`);
  }
  return ins.rowCount ?? 0;
}

/**
 * Đổi sản phẩm chính của bài sang liên kết ĐÃ XÁC NHẬN. Hai bước trong giao dịch của người gọi (bỏ chính cũ trước
 * để không vướng chỉ mục duy nhất). `false` khi sản phẩm chưa được gắn/xác nhận (không thay đổi gì).
 */
export async function setPrimaryPostProduct(
  tx: Database,
  workspaceId: string,
  postId: string,
  productId: string,
): Promise<boolean> {
  const ok = await tx.execute(sql`
    SELECT 1 FROM cf.post_products
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid
      AND product_id = ${productId}::uuid AND status = 'confirmed'`);
  if (ok.rows.length === 0) return false;
  await tx.execute(sql`
    UPDATE cf.post_products SET is_primary = false, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid
      AND is_primary AND product_id <> ${productId}::uuid`);
  await tx.execute(sql`
    UPDATE cf.post_products SET is_primary = true, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid
      AND product_id = ${productId}::uuid`);
  return true;
}

/** Gỡ liên kết hoặc từ chối đề xuất. `false` khi không thấy (workspace khác, đã gỡ). */
export async function unlinkPostProduct(
  tx: Database,
  workspaceId: string,
  postId: string,
  productId: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    DELETE FROM cf.post_products
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid AND product_id = ${productId}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

/**
 * AI/hệ thống đề xuất sản phẩm cho bài (CHƯA dùng để trả lời). Bỏ qua cặp đã có (đã xác nhận hoặc đã đề xuất).
 * Chạy bằng `withJob`; RLS không cho tạo `confirmed` ở đường này. Trả số đề xuất mới.
 */
export async function suggestPostProducts(
  tx: Database,
  workspaceId: string,
  postId: string,
  productIds: readonly string[],
): Promise<number> {
  if (productIds.length === 0) return 0;
  if (!productIds.every((id) => z.uuid().safeParse(id).success)) {
    throw new Error('suggestPostProducts: productIds phải là uuid');
  }
  const r = await tx.execute(sql`
    INSERT INTO cf.post_products (workspace_id, post_id, product_id, status, suggested_by_ai)
    SELECT ${workspaceId}::uuid, ${postId}::uuid, q.product_id, 'suggested', true
    FROM (SELECT unnest(${pgArray(productIds)}::uuid[]) AS product_id) q
    ON CONFLICT (workspace_id, post_id, product_id) DO NOTHING`);
  return r.rowCount ?? 0;
}

/** Xác nhận một đề xuất (người đang thao tác ghi tên). `false` khi không có đề xuất đang chờ. */
export async function confirmSuggestedPostProduct(
  tx: Database,
  workspaceId: string,
  userId: string,
  postId: string,
  productId: string,
): Promise<boolean> {
  const del = await tx.execute(sql`
    DELETE FROM cf.post_products
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid
      AND product_id = ${productId}::uuid AND status = 'suggested'`);
  if ((del.rowCount ?? 0) === 0) return false;
  await tx.execute(sql`
    INSERT INTO cf.post_products
      (workspace_id, post_id, product_id, status, suggested_by_ai, confirmed_by)
    VALUES (${workspaceId}::uuid, ${postId}::uuid, ${productId}::uuid, 'confirmed', true, ${userId}::uuid)`);
  return true;
}

/** Mọi liên kết của bài (cả đề xuất) cho màn quản trị; đã xác nhận trước, chính lên đầu. */
export async function listPostProducts(
  tx: Database,
  workspaceId: string,
  postId: string,
): Promise<PostProductRow[]> {
  const r = await tx.execute<RawRow>(sql`
    SELECT ${COLS} FROM cf.post_products
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid
    ORDER BY (status = 'confirmed') DESC, is_primary DESC, created_at, product_id`);
  return r.rows.map(toRow);
}

/** Sản phẩm dùng được khi trả lời (chỉ đã xác nhận; chính trước). Đề xuất AI chưa xác nhận KHÔNG có ở đây. */
export async function productIdsForAnswering(
  tx: Database,
  workspaceId: string,
  postId: string,
): Promise<string[]> {
  const r = await tx.execute<{ product_id: string }>(sql`
    SELECT product_id FROM cf.post_products
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid AND status = 'confirmed'
    ORDER BY is_primary DESC, created_at, product_id`);
  return r.rows.map((x) => x.product_id);
}

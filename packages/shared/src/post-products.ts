import { z } from 'zod';

/**
 * Gắn sản phẩm vào bài (FR-061, US-032, docs/10 `post_products`). Phần thuần: kiểm đầu vào gắn hàng loạt và các
 * quy tắc đọc liên kết. Đề xuất của AI (`suggested`) CHƯA được dùng để trả lời cho tới khi nhân viên xác nhận
 * (`confirmed`) — mọi nơi cần "sản phẩm của bài" phải đi qua `confirmedProductIds`.
 */
export const POST_PRODUCT_STATUSES = ['suggested', 'confirmed'] as const;
export type PostProductStatus = (typeof POST_PRODUCT_STATUSES)[number];

/** Trần một lần gắn hàng loạt (giữ truy vấn và giao dịch nhỏ). */
export const BULK_MAX_POSTS = 200;
export const BULK_MAX_PRODUCTS = 20;

export type PostProductLink = {
  productId: string;
  status: PostProductStatus;
  isPrimary: boolean;
};

const dedupe = (ids: string[]) => [...new Set(ids)];

const linkSchema = z
  .object({
    postIds: z.array(z.uuid()).min(1).transform(dedupe).pipe(z.array(z.uuid()).max(BULK_MAX_POSTS)),
    productIds: z
      .array(z.uuid())
      .min(1)
      .transform(dedupe)
      .pipe(z.array(z.uuid()).max(BULK_MAX_PRODUCTS)),
    primaryProductId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
  })
  .refine((v) => v.primaryProductId === null || v.productIds.includes(v.primaryProductId), {
    path: ['primaryProductId'],
    message: 'sản phẩm chính phải nằm trong danh sách gắn',
  });

export type LinkPostProductsInput = z.output<typeof linkSchema>;

export function parseLinkPostProducts(input: unknown) {
  return linkSchema.safeParse(input);
}

/** Sản phẩm dùng được khi trả lời: chỉ liên kết đã xác nhận. */
export function confirmedProductIds(links: readonly PostProductLink[]): string[] {
  return links.filter((l) => l.status === 'confirmed').map((l) => l.productId);
}

/**
 * Sản phẩm chính hiệu lực: cái được đánh dấu (và đã xác nhận); không có mà chỉ một liên kết đã xác nhận → chính
 * là nó; còn lại `null` (không đoán).
 */
export function effectivePrimary(links: readonly PostProductLink[]): string | null {
  const confirmed = links.filter((l) => l.status === 'confirmed');
  const marked = confirmed.find((l) => l.isPrimary);
  if (marked) return marked.productId;
  return confirmed.length === 1 ? (confirmed[0]?.productId ?? null) : null;
}

export function summarizePostLinks(links: readonly PostProductLink[]) {
  const confirmed = confirmedProductIds(links).length;
  return {
    confirmed,
    pendingSuggestions: links.length - confirmed,
    primaryProductId: effectivePrimary(links),
    linked: confirmed > 0,
  };
}

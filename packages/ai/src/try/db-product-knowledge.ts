import {
  type Database,
  findProductMatch,
  loadTryProducts,
  type TryProduct,
} from '@flow/db/runtime';
import { unsafeMarkMasked } from '@flow/shared';
import type { VariantAxis } from '../decide/decide-action';
import type { TryCandidate, TryKnowledge } from './try-pipeline';

/**
 * Sản phẩm THẬT của workspace cho ô Thử AI (TRY-AI-REAL lát A, FR-059/127/129): khớp tên bằng `findProductMatch`
 * (trigram trên `search_text`, chịu gõ sai/không dấu; mơ hồ → trả nhiều ứng viên để AI hỏi lại), giá/tồn đọc từ
 * `products`/`product_variants` (nguyên tắc #4). Mọi số trong câu nguồn đều lấy từ DB — AI không tự tính gì thêm.
 * `tx` PHẢI là giao dịch `withActor`/`withWorkspace` của đúng workspace (RLS vẫn áp dụng).
 */
const formatVnd = (value: number) => `${value.toLocaleString('vi-VN')}đ`;

/** Trục biến thể (size/màu) mà sản phẩm CÓ nhiều lựa chọn → khách chưa nói thì phải hỏi lại. Hàm thuần. */
export function missingAxesOf(product: TryProduct): VariantAxis[] {
  const distinct = (key: VariantAxis) =>
    new Set(
      product.variants.flatMap((variant) => {
        const value = variant.attrsNorm[key];
        return value === undefined ? [] : [value];
      }),
    ).size;
  return (['size', 'color'] as const).filter((axis) => distinct(axis) > 1);
}

const stockText = (stock: number | null): string | null =>
  stock === null ? null : stock > 0 ? `còn ${stock}` : 'hết hàng';

const variantLabel = (attrs: Record<string, string>): string =>
  Object.entries(attrs)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ');

/** Câu nguồn của một sản phẩm: tên, giá (hoặc khoảng giá), từng biến thể có giá/tồn. Hàm thuần. */
export function productFactText(product: TryProduct): string {
  const prices = product.variants.flatMap((v) => (v.priceVnd === null ? [] : [v.priceVnd]));
  const base = product.priceVnd ?? (prices.length > 0 ? Math.min(...prices) : null);
  const head =
    base === null ? `${product.name}: chưa có giá` : `${product.name}: giá ${formatVnd(base)}`;
  const detailed = product.variants.filter((v) => Object.keys(v.attrs).length > 0);
  if (detailed.length === 0) {
    const stock = stockText(product.stock);
    return stock === null ? `${head}.` : `${head}; ${stock}.`;
  }
  const lines = detailed.map((v) => {
    const parts = [
      variantLabel(v.attrs),
      v.priceVnd === null ? null : `giá ${formatVnd(v.priceVnd)}`,
      stockText(v.stock),
    ].filter((part): part is string => part !== null);
    return parts.join(' ');
  });
  return `${head}; biến thể: ${lines.join(' | ')}.`;
}

export type DbProductKnowledge = Pick<TryKnowledge, 'matchProducts' | 'lookupProductFacts'>;

export function createDbProductKnowledge(tx: Database, workspaceId: string): DbProductKnowledge {
  return {
    async matchProducts(mentions) {
      const ids: string[] = [];
      for (const mention of mentions) {
        const text = mention.trim();
        if (text === '') continue;
        const match = await findProductMatch(tx, { workspaceId, queryText: text });
        if (match.status === 'matched') ids.push(match.id);
        else if (match.status === 'ambiguous') ids.push(...match.ids);
      }
      const unique = [...new Set(ids)];
      const products = await loadTryProducts(tx, workspaceId, unique);
      return {
        ids: products.map((p) => p.id),
        names: products.map((p) => p.name),
        missingAxes: products.length === 1 ? missingAxesOf(products[0] as TryProduct) : [],
      };
    },
    async lookupProductFacts(ids) {
      const products = await loadTryProducts(tx, workspaceId, ids);
      return products.map(
        (product): TryCandidate => ({
          id: product.id,
          kind: 'product',
          title: product.name,
          text: unsafeMarkMasked(productFactText(product)),
          score: 1,
          topics: ['product_info', 'size'],
        }),
      );
    },
  };
}

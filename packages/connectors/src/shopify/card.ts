import { CARD_VALUE_MAX, cleanCardText, type ProductCard } from '@flow/shared';

/**
 * Thẻ sản phẩm (FR-058) dựng từ dữ liệu Shopify: loại, tag, mô tả (chữ thuần) và metafield `custom.*`. Hàm thuần.
 * Nguyên tắc #4: giá chỉ đọc từ `products`/`product_variants` — mọi CÂU có số tiền trong mô tả/metafield bị loại để AI không
 * trích giá cũ từ văn bản (bộ chặn số tiền coi nguồn là đúng, nên phải chặn từ gốc).
 */
export type ShopifyMetafield = { namespace: string; key: string; type: string; value: string };

export type ShopifyCardSource = {
  /** `product.description` — chữ thuần Shopify đã bỏ HTML. */
  description: string;
  tags: readonly string[];
  productType: string;
  metafields: readonly ShopifyMetafield[];
};

const MAX_TAGS = 20;
const TEXT_TYPES = new Set(['single_line_text_field', 'multi_line_text_field', 'rich_text_field']);

/** Khóa metafield (namespace `custom`) → trường thẻ; có cả khóa tiếng Việt phổ biến (khóa Shopify chỉ chữ thường/số/gạch dưới). */
const METAFIELD_KEYS: ReadonlyArray<readonly [keyof ProductCard, readonly string[]]> = [
  ['material', ['material', 'chat_lieu']],
  ['care', ['care', 'care_instructions', 'cach_giat', 'huong_dan_giat', 'bao_quan']],
  ['sizeChart', ['size_chart', 'bang_size']],
  ['warranty', ['warranty', 'bao_hanh']],
  ['origin', ['origin', 'xuat_xu']],
];

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();
const cap = (text: string): string => text.slice(0, CARD_VALUE_MAX);

function richTextToPlain(raw: string): string {
  try {
    const walk = (node: unknown): string[] => {
      if (typeof node !== 'object' || node === null) return [];
      const { type, value, children } = node as {
        type?: unknown;
        value?: unknown;
        children?: unknown;
      };
      if (type === 'text' && typeof value === 'string') return [value];
      return Array.isArray(children) ? children.flatMap(walk) : [];
    };
    return walk(JSON.parse(raw)).join(' ');
  } catch {
    return '';
  }
}

function metafieldText(field: ShopifyMetafield): string {
  const raw = field.type === 'rich_text_field' ? richTextToPlain(field.value) : field.value;
  return cleanCardText(raw);
}

export function buildShopifyCard(source: ShopifyCardSource): ProductCard {
  const card: ProductCard = {};
  const type = collapse(source.productType);
  if (type !== '') card.type = cap(type);
  const tags = [...new Set(source.tags.map(collapse).filter((tag) => tag !== ''))].slice(
    0,
    MAX_TAGS,
  );
  if (tags.length > 0) card.tags = tags.map(cap);
  const description = cleanCardText(source.description);
  if (description !== '') card.description = description;
  for (const [field, keys] of METAFIELD_KEYS) {
    for (const key of keys) {
      const found = source.metafields.find(
        (m) => m.namespace === 'custom' && m.key === key && TEXT_TYPES.has(m.type),
      );
      const text = found ? metafieldText(found) : '';
      if (text !== '') {
        (card as Record<string, unknown>)[field] = text;
        break;
      }
    }
  }
  return card;
}

import { z } from 'zod';

/** Giá trị tối đa của một trường thẻ sản phẩm (FR-058). */
export const CARD_VALUE_MAX = 600;

/** Bỏ dấu, thường, gộp khoảng trắng: dạng so khớp của khóa/giá trị thuộc tính. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Từ điển chuẩn hóa Việt–Anh (FR-129). Khóa đã `fold`. Mở rộng khi bộ đánh giá cho thấy thiếu.
const KEY_ALIASES: Record<string, string> = {
  mau: 'color',
  'mau sac': 'color',
  colour: 'color',
  color: 'color',
  size: 'size',
  'kich co': 'size',
  'kich thuoc': 'size',
};

const COLOR_ALIASES: Record<string, string> = {
  den: 'black',
  black: 'black',
  trang: 'white',
  white: 'white',
  do: 'red',
  red: 'red',
  'xanh duong': 'blue',
  blue: 'blue',
  'xanh la': 'green',
  green: 'green',
  vang: 'yellow',
  yellow: 'yellow',
  hong: 'pink',
  pink: 'pink',
  tim: 'purple',
  purple: 'purple',
  xam: 'gray',
  gray: 'gray',
  grey: 'gray',
  nau: 'brown',
  brown: 'brown',
  cam: 'orange',
  orange: 'orange',
  be: 'beige',
  beige: 'beige',
};

/**
 * Chuẩn hóa thuộc tính biến thể thành `attrs_norm` (FR-129): khóa `mau`→`color`, giá trị `đen`→`black`.
 * Khóa/giá trị chưa có trong từ điển được giữ ở dạng đã bỏ dấu + thường; giá trị rỗng bị bỏ. Lũy đẳng.
 */
export function normalizeAttrs(attrs: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(attrs)) {
    const value = foldText(rawValue);
    if (value === '') continue;
    const foldedKey = foldText(rawKey);
    const key = KEY_ALIASES[foldedKey] ?? foldedKey;
    result[key] = key === 'color' ? (COLOR_ALIASES[value] ?? value) : value;
  }
  return result;
}

const cardText = z.string().max(CARD_VALUE_MAX);

/** Thẻ sản phẩm (FR-058): chất liệu, cách giặt, bảng size, bảo hành, xuất xứ, loại, tag; mỗi giá trị ≤ 600 ký tự. */
export const productCardSchema = z
  .object({
    material: cardText,
    care: cardText,
    sizeChart: cardText,
    warranty: cardText,
    origin: cardText,
    type: cardText,
    tags: z.array(cardText),
  })
  .partial()
  .strict();

export type ProductCard = z.infer<typeof productCardSchema>;

export function parseProductCard(
  input: unknown,
): { ok: true; card: ProductCard } | { ok: false; error: string } {
  const parsed = productCardSchema.safeParse(input);
  if (parsed.success) return { ok: true, card: parsed.data };
  return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') };
}

export type ProductEmbeddingInput = {
  name: string;
  category?: string | null;
  card?: ProductCard;
  variants?: ReadonlyArray<{ attrs: Record<string, string> }>;
};

/**
 * Văn bản đưa vào vector hóa tên sản phẩm (FR-056): CHỈ tên, danh mục, thẻ, thuộc tính biến thể.
 * Giá/tồn không có trong kiểu đầu vào nên không thể lọt vào (đọc trực tiếp từ DB khi trả lời — nguyên tắc #4).
 */
export function productEmbeddingText(product: ProductEmbeddingInput): string {
  const parts: string[] = [product.name];
  if (product.category) parts.push(product.category);
  const card = product.card ?? {};
  for (const value of [card.type, card.material, card.care, card.sizeChart, card.origin]) {
    if (value) parts.push(value);
  }
  if (card.tags) parts.push(...card.tags);
  const attrLines = new Set<string>();
  for (const variant of product.variants ?? []) {
    for (const [key, value] of Object.entries(variant.attrs)) attrLines.add(`${key} ${value}`);
  }
  parts.push(...attrLines);
  return parts.join('\n');
}

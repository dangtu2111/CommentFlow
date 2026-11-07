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

/** Thẻ sản phẩm (FR-058): chất liệu, cách giặt, bảng size, bảo hành, xuất xứ, loại, mô tả, tag; mỗi giá trị ≤ 600 ký tự. */
export const productCardSchema = z
  .object({
    material: cardText,
    care: cardText,
    sizeChart: cardText,
    warranty: cardText,
    origin: cardText,
    type: cardText,
    /** Mô tả ngắn dạng chữ thuần (đồng bộ từ nguồn ngoài, đã loại câu có số tiền); không dùng để lấy giá. */
    description: cardText,
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

/** Số tiền: `150.000đ`, `99k`, `2tr`, `120 USD`, `$20`… ("5kg" không phải vì `k` đứng liền chữ khác). */
const MONEY =
  /(?:\d[\d.,]*\s*(?:đ|₫|vnd|vnđ|nghìn|ngàn|triệu|usd|k|tr)(?![\p{L}\p{N}]))|(?:[$₫€£]\s*\d)/iu;

const collapseSpaces = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Làm sạch một giá trị văn bản của thẻ (FR-058): gộp khoảng trắng, LOẠI mọi câu có số tiền (nguyên tắc #4: giá chỉ đọc từ
 * `products`/`product_variants`, không từ văn bản tự do), cắt ≤ `CARD_VALUE_MAX` ký tự ở ranh giới từ. Hàm thuần.
 */
export function cleanCardText(raw: string): string {
  // Tách câu ở dấu chấm/!/?/; theo sau là khoảng trắng — không tách giữa số ("150.000đ").
  const kept = collapseSpaces(raw)
    .split(/(?<=[.!?;])\s+/)
    .filter((sentence) => !MONEY.test(sentence));
  const text = collapseSpaces(kept.join(' '));
  if (text.length <= CARD_VALUE_MAX) return text;
  const cut = text.slice(0, CARD_VALUE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > CARD_VALUE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
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
  for (const value of [
    card.type,
    card.material,
    card.care,
    card.sizeChart,
    card.origin,
    card.description,
  ]) {
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

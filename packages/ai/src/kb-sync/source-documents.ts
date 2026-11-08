import { type ChunkDocument, cleanCardText, type ProductCard } from '@flow/shared';
import { CARD_DETAIL_LABELS } from '../try/db-product-knowledge';

/** Nguồn nhập tay → tài liệu cần cắt đoạn (FAQ, thông tin shop, sản phẩm). Hàm thuần, không I/O. */

export type FaqInput = { id: string; lang: 'vi' | 'en' | 'all'; question: string; answer: string };

export type ShopProfileInput = {
  lang: 'vi' | 'en' | 'all';
  name: string;
  description: string | null;
  address: string | null;
  openingHours: string | null;
  contact: string | null;
  website: string | null;
};

/** Sản phẩm cho kiến thức: CHỈ tên/mã/tùy chọn biến thể — KHÔNG giá, KHÔNG tồn kho (đọc từ `products`/`product_variants`, nguyên tắc 4). */
export type ProductInput = {
  id: string;
  name: string;
  sku: string | null;
  options: ReadonlyArray<{ name: string; values: readonly string[] }>;
  /** Thẻ sản phẩm (FR-058: chất liệu, cách giặt, bảng size, bảo hành, xuất xứ, mô tả, tag từ Shopify/nhập tay). */
  card?: ProductCard;
};

const chunkLang = (lang: 'vi' | 'en' | 'all'): 'vi' | 'en' => (lang === 'en' ? 'en' : 'vi');

export function buildFaqDocuments(faqs: readonly FaqInput[], sourceTitle: string): ChunkDocument[] {
  return faqs.map((faq) => ({
    key: `faq:${faq.id}`,
    kind: 'faq',
    sourceTitle,
    lang: chunkLang(faq.lang),
    text: `Hỏi: ${faq.question}\nĐáp: ${faq.answer}`,
  }));
}

export function buildShopDocuments(
  profiles: readonly ShopProfileInput[],
  sourceTitle: string,
): ChunkDocument[] {
  return profiles.flatMap((profile) => {
    const lines = [
      profile.description,
      profile.address ? `Địa chỉ: ${profile.address}` : null,
      profile.openingHours ? `Giờ mở cửa: ${profile.openingHours}` : null,
      profile.contact ? `Liên hệ: ${profile.contact}` : null,
      profile.website ? `Website: ${profile.website}` : null,
    ].filter((line): line is string => line !== null && line.trim() !== '');
    if (lines.length === 0) return [];
    return [
      {
        key: `shop:${profile.lang}`,
        kind: 'shop_profile' as const,
        sourceTitle,
        section: profile.name,
        lang: chunkLang(profile.lang),
        text: lines.join('\n\n'),
      },
    ];
  });
}

/** Dòng chi tiết từ thẻ: mỗi giá trị làm sạch lại (loại câu có số tiền — nguyên tắc #4: giá chỉ từ `product_variants`). */
function cardLines(card: ProductCard | undefined): string[] {
  if (!card) return [];
  const labelled = CARD_DETAIL_LABELS.flatMap(([field, label]) => {
    const value = card[field];
    const text = typeof value === 'string' ? cleanCardText(value) : '';
    return text === '' ? [] : [`${label.charAt(0).toUpperCase()}${label.slice(1)}: ${text}`];
  });
  const tags = (card.tags ?? []).map((tag) => cleanCardText(tag)).filter((tag) => tag !== '');
  return tags.length > 0 ? [...labelled, `Tag: ${tags.join(', ')}`] : labelled;
}

export function buildProductDocuments(
  products: readonly ProductInput[],
  sourceTitle: string,
): ChunkDocument[] {
  return products.map((product) => {
    const options = product.options
      .filter((option) => option.values.length > 0)
      .map((option) => `${option.name}: ${option.values.join(', ')}`);
    const lines = [
      `Sản phẩm: ${product.name}`,
      product.sku ? `Mã: ${product.sku}` : null,
      options.length > 0 ? `Tùy chọn: ${options.join('; ')}` : null,
      ...cardLines(product.card),
    ].filter((line): line is string => line !== null);
    return {
      key: `product:${product.id}`,
      kind: 'product',
      sourceTitle,
      productName: product.name,
      productId: product.id,
      lang: 'vi',
      text: lines.join('\n'),
    };
  });
}

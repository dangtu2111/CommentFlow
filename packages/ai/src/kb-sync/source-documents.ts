import type { ChunkDocument } from '@flow/shared';

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

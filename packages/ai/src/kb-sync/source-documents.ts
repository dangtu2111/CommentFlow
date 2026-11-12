import {
  type ChunkDocument,
  cleanCardText,
  type ProductCard,
  type ShopBranch,
  type ShopContacts,
  type ShopHours,
} from '@flow/shared';
import { CARD_DETAIL_LABELS } from '../try/db-product-knowledge';
import { detectChunkLang } from './lang';

/** Nguồn nhập tay → tài liệu cần cắt đoạn (FAQ, thông tin shop, sản phẩm). Hàm thuần, không I/O. */

export type FaqInput = {
  id: string;
  lang: 'vi' | 'en' | 'all';
  question: string;
  answer: string;
  /** FAQ chắt lọc (M3-2): đoạn thô nguồn + loại; FAQ nhập tay thì thiếu/null. */
  sourceChunkId?: string | null;
  kind?: string;
};

export type ShopProfileInput = {
  lang: 'vi' | 'en' | 'all';
  name: string;
  description: string | null;
  address: string | null;
  openingHours: string | null;
  contact: string | null;
  website: string | null;
  /** KB-SHOP-V2 (đều tùy chọn: hồ sơ cũ chưa có). Giá trị đã qua Zod ở ranh giới vào. */
  slogan?: string | null;
  industries?: readonly string[];
  legalName?: string | null;
  taxId?: string | null;
  hours?: ShopHours | null;
  contacts?: ShopContacts | null;
  branches?: readonly ShopBranch[];
};

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

/** Ngày 1–7 (1 = Thứ Hai) → "T2–T7" khi liền nhau từ 3 ngày trở lên, ngược lại liệt kê "T3, T5, CN". */
function formatDays(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && (sorted[j + 1] as number) === (sorted[j] as number) + 1) j += 1;
    const label = (n: number) => WEEKDAY_LABELS[n - 1] ?? String(n);
    if (j - i >= 2) parts.push(`${label(sorted[i] as number)}–${label(sorted[j] as number)}`);
    else for (let k = i; k <= j; k += 1) parts.push(label(sorted[k] as number));
    i = j + 1;
  }
  return parts.join(', ');
}

function branchLine(branch: ShopBranch): string {
  const parts = [
    `${branch.is_main ? 'Chi nhánh chính' : 'Chi nhánh'}: ${branch.name}`,
    branch.address,
    branch.hours ? `Giờ: ${branch.hours}` : null,
    branch.note ? `Ghi chú: ${branch.note}` : null,
  ].filter((part): part is string => part !== null && part.trim() !== '');
  return parts.join(' — ');
}

/** Các dòng của trường v2; chi nhánh chính đứng trước. Không log, không số tiền (Zod đã chặn). */
function shopV2Lines(profile: ShopProfileInput): string[] {
  const open = profile.hours?.open;
  const support = profile.hours?.support;
  const contacts = profile.contacts;
  const branches = [...(profile.branches ?? [])].sort(
    (a, b) => Number(b.is_main) - Number(a.is_main),
  );
  return [
    profile.slogan ? `Khẩu hiệu: ${profile.slogan}` : null,
    profile.industries && profile.industries.length > 0
      ? `Ngành hàng: ${profile.industries.join(', ')}`
      : null,
    profile.legalName ? `Tên pháp lý: ${profile.legalName}` : null,
    profile.taxId ? `Mã số thuế: ${profile.taxId}` : null,
    open ? `Lịch mở cửa: ${formatDays(open.days)}, ${open.from}–${open.to}` : null,
    support ? `Giờ hỗ trợ online: ${support.from}–${support.to}` : null,
    contacts?.hotline ? `Hotline: ${contacts.hotline}` : null,
    contacts?.zalo ? `Zalo: ${contacts.zalo}` : null,
    contacts?.website ? `Website: ${contacts.website}` : null,
    contacts?.shopee ? `Shopee: ${contacts.shopee}` : null,
    contacts?.tiktok ? `TikTok Shop: ${contacts.tiktok}` : null,
    ...branches.map(branchLine),
  ].filter((line): line is string => line !== null);
}

/** Sản phẩm cho kiến thức: CHỈ tên/mã/tùy chọn biến thể — KHÔNG giá, KHÔNG tồn kho (đọc từ `products`/`product_variants`, nguyên tắc 4). */
export type ProductInput = {
  id: string;
  name: string;
  sku: string | null;
  options: ReadonlyArray<{ name: string; values: readonly string[] }>;
  /** Thẻ sản phẩm (FR-058: chất liệu, cách giặt, bảng size, bảo hành, xuất xứ, mô tả, tag từ Shopify/nhập tay). */
  card?: ProductCard;
};

export function buildFaqDocuments(faqs: readonly FaqInput[], sourceTitle: string): ChunkDocument[] {
  return faqs.map((faq) => ({
    key: `faq:${faq.id}`,
    kind: 'faq',
    sourceTitle,
    lang: detectChunkLang(`${faq.question} ${faq.answer}`, faq.lang),
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
      ...shopV2Lines(profile),
    ].filter((line): line is string => line !== null && line.trim() !== '');
    if (lines.length === 0) return [];
    return [
      {
        key: `shop:${profile.lang}`,
        kind: 'shop_profile' as const,
        sourceTitle,
        section: profile.name,
        lang: detectChunkLang(lines.join(' '), profile.lang),
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
      // Nhận ngôn ngữ từ TÊN + thẻ (không từ nhãn tiếng Việt "Sản phẩm:"/"Mã:" ta tự thêm vào văn bản).
      lang: detectChunkLang(
        [product.name, ...CARD_DETAIL_LABELS.map(([field]) => product.card?.[field])]
          .filter((v): v is string => typeof v === 'string')
          .join(' '),
        'vi',
      ),
      text: lines.join('\n'),
    };
  });
}

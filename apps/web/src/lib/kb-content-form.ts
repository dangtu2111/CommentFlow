import {
  type BrandVoiceInput,
  type FaqItemInput,
  HANDOFF_TOPICS,
  type PolicyItemInput,
  parseBrandVoice,
  parseFaqItem,
  parsePolicyItem,
  parseShopProfile,
  type ShopProfileInput,
} from '@flow/shared';

/**
 * Chuyển `FormData` của các biểu mẫu Cơ sở kiến thức thành đầu vào đã kiểm bằng `parse*` của `@flow/shared` (nguồn sự
 * thật duy nhất của quy tắc). Thuần, không đọc DB/phiên. Mọi giá trị từ form chỉ là DỮ LIỆU: workspace/người dùng lấy
 * từ phiên ở Server Action, không bao giờ từ form.
 */
export type FormParse<T> = { ok: true; input: T } | { ok: false };

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

/** Mỗi dòng một mục; bỏ dòng trống và khoảng trắng thừa. */
export function splitLines(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Thẻ cách nhau bằng dấu phẩy. */
export function splitTags(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function formToShopProfile(data: FormData): FormParse<ShopProfileInput> {
  const parsed = parseShopProfile({
    lang: text(data, 'lang'),
    name: text(data, 'name'),
    description: text(data, 'description'),
    address: text(data, 'address'),
    openingHours: text(data, 'openingHours'),
    contact: text(data, 'contact'),
    website: text(data, 'website'),
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false };
}

export function formToPolicy(data: FormData): FormParse<PolicyItemInput> {
  const parsed = parsePolicyItem({
    kind: text(data, 'kind'),
    lang: text(data, 'lang'),
    title: text(data, 'title'),
    content: text(data, 'content'),
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false };
}

export function formToFaq(data: FormData): FormParse<FaqItemInput> {
  const parsed = parseFaqItem({
    question: text(data, 'question'),
    answer: text(data, 'answer'),
    lang: text(data, 'lang'),
    tags: splitTags(text(data, 'tags')),
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false };
}

export function formToBrandVoice(data: FormData): FormParse<BrandVoiceInput> {
  const handoffTemplates: Record<string, { inHours: string; outHours: string }> = {};
  for (const topic of HANDOFF_TOPICS) {
    const inHours = text(data, `handoff.${topic}.inHours`).trim();
    const outHours = text(data, `handoff.${topic}.outHours`).trim();
    // Cần đủ hai câu; ô trống cả hai hoặc thiếu một → bỏ qua chủ đề này (không lưu nửa vời).
    if (inHours && outHours) handoffTemplates[topic] = { inHours, outHours };
  }
  const custom = text(data, 'shopPronounCustom').trim();
  const parsed = parseBrandVoice({
    lang: text(data, 'lang'),
    tone: text(data, 'tone'),
    greeting: text(data, 'greeting'),
    signOff: text(data, 'signOff'),
    doRules: splitLines(text(data, 'doRules')),
    dontRules: splitLines(text(data, 'dontRules')),
    addressByName: data.get('addressByName') !== null,
    shopPronoun: text(data, 'shopPronoun'),
    ...(custom ? { shopPronounCustom: custom } : {}),
    customerAddress: text(data, 'customerAddress'),
    handoffTemplates,
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false };
}

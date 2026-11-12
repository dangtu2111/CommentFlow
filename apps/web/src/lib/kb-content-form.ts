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
  type ShopProfileV2,
  shopProfileV2Schema,
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

/** Số dòng chi nhánh tối đa form có thể gửi (giới hạn thật 10 do Zod kiểm; quét dư để dòng thứ 11 bị từ chối thay vì lặng lẽ bỏ). */
const BRANCH_FORM_ROWS = 30;

const orNull = (value: string): string | null => (value === '' ? null : value);

/**
 * Các trường MỚI của thông tin shop (KB-SHOP-V2 PR4). Trường trống = null/rỗng (Owner xóa được). Giờ mở cửa phải có đủ
 * ngày + giờ mở + giờ đóng; giờ trực phải có đủ hai đầu — thiếu một nửa là lỗi, không đoán. Chi nhánh trống cả tên lẫn địa chỉ bị bỏ.
 */
export function formToShopProfileV2(data: FormData): FormParse<ShopProfileV2> {
  const days = data.getAll('openDays').map((v) => Number(v));
  const [openFrom, openTo] = [text(data, 'openFrom').trim(), text(data, 'openTo').trim()];
  const [supportFrom, supportTo] = [
    text(data, 'supportFrom').trim(),
    text(data, 'supportTo').trim(),
  ];
  const anyOpen = days.length > 0 || openFrom !== '' || openTo !== '';
  const anySupport = supportFrom !== '' || supportTo !== '';
  const hours =
    anyOpen || anySupport
      ? {
          ...(anyOpen ? { open: { days, from: openFrom, to: openTo } } : {}),
          ...(anySupport ? { support: { from: supportFrom, to: supportTo } } : {}),
        }
      : null;

  const contacts: Record<string, string> = {};
  for (const key of ['zalo', 'shopee', 'tiktok'] as const) {
    const value = text(data, key).trim();
    if (value !== '') contacts[key] = value;
  }

  const mainIndex = text(data, 'branchMain');
  const branches: Array<Record<string, unknown>> = [];
  for (let i = 0; i < BRANCH_FORM_ROWS; i += 1) {
    const name = text(data, `branchName.${i}`).trim();
    const address = text(data, `branchAddress.${i}`).trim();
    if (name === '' && address === '') continue;
    const hoursText = text(data, `branchHours.${i}`).trim();
    const note = text(data, `branchNote.${i}`).trim();
    branches.push({
      name,
      address,
      ...(hoursText ? { hours: hoursText } : {}),
      ...(note ? { note } : {}),
      is_main: mainIndex === String(i),
    });
  }

  const parsed = shopProfileV2Schema.safeParse({
    slogan: orNull(text(data, 'slogan').trim()),
    industries: splitTags(text(data, 'industries')),
    legalName: orNull(text(data, 'legalName').trim()),
    taxId: orNull(text(data, 'taxId').trim()),
    hours,
    contacts: Object.keys(contacts).length > 0 ? contacts : null,
    branches,
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

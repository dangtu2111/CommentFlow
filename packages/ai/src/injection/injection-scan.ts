import { type ChunkDraft, foldText } from '@flow/shared';

/**
 * Quét mẫu câu lệnh cài qua kiến thức nhập vào (FR-164, QKI1). Hàm thuần, không I/O.
 * Chạy khi lập chỉ mục (đánh dấu `kb_chunks.injection_suspected`) và khi truy hồi (lớp phòng thủ thứ hai).
 * Đây là lớp phát hiện theo mẫu, KHÔNG phải rào chắn duy nhất: lớp cuối vẫn là khối dữ liệu có thẻ trong prompt,
 * guard số tiền/nguồn và cổng tự gửi. Thiên về báo nhầm hơn bỏ sót — đoạn bị báo nhầm chỉ vào hàng chờ duyệt.
 */

export const INJECTION_REASONS = [
  'ignore_instructions',
  'role_play',
  'reveal_prompt',
  'forced_reply',
  'system_marker',
  'tag_forgery',
  'discount_directive',
  'unknown_link',
] as const;
export type InjectionReason = (typeof INJECTION_REASONS)[number];

export type InjectionScanOptions = {
  /**
   * Nguồn văn bản: `customer` = câu của KHÁCH (thêm luật "Hệ thống:" tiếng Việt và "giảm X% cho tất cả" mà khách không có quyền ra lệnh);
   * mặc định = đoạn kiến thức của shop (không áp các luật này vì shop được phép có khuyến mãi hợp lệ).
   */
  source?: 'customer' | 'knowledge';
  /** Miền thuộc shop (vd `myshop.vn`); link tới miền này hoặc miền con của nó không bị coi là lạ. */
  allowedDomains?: readonly string[];
};

export type InjectionScanResult = { suspected: boolean; reasons: InjectionReason[] };

/** Động từ "bỏ qua" và đối tượng bị bỏ qua, CẢ tiếng Anh lẫn tiếng Việt (khách hay trộn: "Ignore quy định của shop", "bỏ qua instructions"). */
const IGNORE_VERBS = 'ignore|disregard|forget|override|bypass|bo qua|quen|phot lo|huy bo';
const IGNORE_OBJECTS =
  'instructions?|rules?|prompts?|guidelines?|directions?|everything|huong dan|quy tac|chi dan|lenh|chi thi|quy dinh|yeu cau|noi dung';

/** Mẫu trên văn bản đã bỏ dấu + chữ thường + gộp khoảng trắng (`foldText`). */
const PHRASE_RULES: ReadonlyArray<readonly [InjectionReason, RegExp]> = [
  [
    'ignore_instructions',
    new RegExp(
      `\\b(?:${IGNORE_VERBS})\\b[^.\\n]{0,30}\\b(?:${IGNORE_OBJECTS})\\b|\\b(?:ignore|disregard|forget)\\b[^.\\n]{0,15}\\b(?:above|previous|prior|earlier)\\b|\\b(?:bo qua|quen|phot lo|huy bo)\\b[^.\\n]{0,30}\\b(?:truoc do|o tren)\\b`,
    ),
  ],
  [
    'role_play',
    /\byou are now\b|\b(?:pretend|roleplay|role-play|behave as)\b|\bact as (?:a|an|the|if)\b|\bdong vai\b|\bgia vo (?:la|lam)\b|\b(?:tu gio|bay gio) ban (?:la|se)\b/,
  ],
  [
    'reveal_prompt',
    /\b(?:reveal|print|show|repeat|output|leak|tiet lo|in ra|hien thi|lap lai)\b[^.\n]{0,40}\b(?:system prompt|prompt|your instructions|huong dan cua ban|chi dan he thong|prompt he thong)\b/,
  ],
  [
    'forced_reply',
    /\bfrom now on\b[^.\n]{0,40}\b(?:reply|respond|answer|say|tell|always|you)\b|\b(?:always|only|must) (?:reply|respond|answer|say)\b|\btu bay gio\b[^.\n]{0,30}\b(?:ban|hay|luon|tra loi)\b|\bluon (?:tra loi|noi|bao|dap)\b|\bchi (?:duoc )?(?:tra loi|noi)\b/,
  ],
  [
    'discount_directive',
    new RegExp(
      '(?:\\bhay (?:bao|noi|cho|bat|hua|tra loi)\\b|\\bluon (?:bao|noi|cho|hua)\\b|\\bphai (?:bao|noi|cho)\\b|\\b(?:bao|noi) (?:voi )?khach\\b|\\b(?:always|must|tell|offer|promise|say|inform|give|grant)\\b)' +
        '[^.\\n?]{0,60}?(?:\\b(?:giam(?: gia)?|discount|khuyen mai|off)\\b[^.\\n?]{0,20}?\\d{1,3}\\s?%|\\d{1,3}\\s?%\\s?(?:off|discount|giam))',
    ),
  ],
];

/** Mẫu trên văn bản NFKC + chữ thường, GIỮ dấu và xuống dòng (đánh dấu hệ thống, giả thẻ). */
const TAG_FORGERY = /<\s*\/?\s*(?:source|question|system|instructions?|assistant)\b/;
const MARKER_LINE =
  /^\s*(?:system|assistant|developer)\s*:|^\s*#{2,}\s*(?:instruction|system|prompt)/;
const MARKER_TOKEN = /<\|[a-z_]+\|>|\[\/?inst\]|<<\/?sys>>/;

const URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>"')]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|vn|net|org|io|me|ly|xyz|info|biz|co|shop|store|site|online|top|link|app)\b(?:\/[^\s<>"')]*)?/g;

/** Dòng mở đầu giả danh hệ thống bằng tiếng Việt (đã bỏ dấu): "hệ thống:", "quản trị viên:", "admin:". */
const VI_MARKER_LINE = /^\s*(?:he thong|quan tri(?: vien)?|admin|nha phat trien)\s*:/;
/** Giảm giá X% cho TẤT CẢ/MỌI sản phẩm/đơn: khách không có quyền ra lệnh điều này (chỉ xét câu KHÔNG phải câu hỏi). */
const DISCOUNT_ALL =
  /\b(?:giam(?: gia)?|discount|off|khuyen mai)\b[^.!\n?]{0,25}\d{1,3}\s?%[^.!\n?]{0,25}\b(?:moi|tat ca|toan bo|all|every|cho tat ca)\b|\b(?:moi|tat ca|toan bo|all|every)\b[^.!\n?]{0,25}\b(?:giam(?: gia)?|discount|off)\b[^.!\n?]{0,20}\d{1,3}\s?%/;
const QUESTION_WORDS = /\?|\bkhong\b|\bko\b|\bhong\b/;

function customerRules(folded: string): Set<InjectionReason> {
  const hit = new Set<InjectionReason>();
  if (folded.split(/\r?\n/).some((line) => VI_MARKER_LINE.test(line))) hit.add('system_marker');
  const sentences = folded.split(/(?<=[.!\n])\s*/);
  if (sentences.some((sentence) => DISCOUNT_ALL.test(sentence) && !QUESTION_WORDS.test(sentence))) {
    hit.add('discount_directive');
  }
  return hit;
}

function hostOf(rawUrl: string): string {
  const withoutScheme = rawUrl.replace(/^https?:\/\//, '');
  // Trình duyệt coi `\` như `/` (https://evil.com\@myshop.vn mở evil.com) nên cũng là điểm cắt.
  const authority = withoutScheme.split(/[/?#\\]/, 1)[0] ?? '';
  const host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d+$/, '');
  return host.replace(/[.,;:!]+$/, '').replace(/^www\./, '');
}

function isAllowedHost(host: string, allowed: readonly string[]): boolean {
  return allowed.some((domain) => {
    const d = domain.toLowerCase().replace(/^www\./, '');
    return d !== '' && (host === d || host.endsWith(`.${d}`));
  });
}

function hasUnknownLink(text: string, allowed: readonly string[]): boolean {
  for (const match of text.matchAll(URL_PATTERN)) {
    if (!isAllowedHost(hostOf(match[0]), allowed)) return true;
  }
  return false;
}

/** NFKC (đưa chữ toàn chiều rộng về thường) + bỏ ký tự định dạng vô hình (rộng-0, nối từ, đánh dấu hướng). */
function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase();
}

export function scanInjection(
  text: string,
  options: InjectionScanOptions = {},
): InjectionScanResult {
  const norm = normalize(text);
  // `-`/`_` coi như khoảng trắng để "bo-qua", "ignore_all" không né được mẫu cụm từ.
  const folded = foldText(norm.replace(/[-_]/g, ' '));
  const hit =
    options.source === 'customer'
      ? customerRules(foldText(norm.replace(/[-_]/g, ' ')))
      : new Set<InjectionReason>();
  for (const [reason, pattern] of PHRASE_RULES) {
    if (pattern.test(folded)) hit.add(reason);
  }
  if (norm.split(/\r?\n/).some((line) => MARKER_LINE.test(line)) || MARKER_TOKEN.test(norm)) {
    hit.add('system_marker');
  }
  if (TAG_FORGERY.test(norm)) hit.add('tag_forgery');
  if (hasUnknownLink(norm, options.allowedDomains ?? [])) hit.add('unknown_link');
  const reasons = INJECTION_REASONS.filter((reason) => hit.has(reason));
  return { suspected: reasons.length > 0, reasons };
}

/** Chuỗi lý do để lưu vào `kb_chunks.injection_reason`; không có lý do → null. */
export function describeInjectionReasons(reasons: readonly InjectionReason[]): string | null {
  return reasons.length === 0 ? null : reasons.join(',');
}

export type InjectionAnnotated<T> = T & {
  injectionSuspected: boolean;
  injectionReason: string | null;
};

/** Quét từng đoạn (tiêu đề ngữ cảnh + nội dung) khi lập chỉ mục; trả đoạn kèm cờ để ghi bản nháp. */
export function annotateInjection<T extends ChunkDraft>(
  drafts: readonly T[],
  options: InjectionScanOptions = {},
): InjectionAnnotated<T>[] {
  return drafts.map((draft) => {
    const { suspected, reasons } = scanInjection(
      `${draft.contextHeader ?? ''}\n${draft.content}`,
      options,
    );
    return {
      ...draft,
      injectionSuspected: suspected,
      injectionReason: describeInjectionReasons(reasons),
    };
  });
}

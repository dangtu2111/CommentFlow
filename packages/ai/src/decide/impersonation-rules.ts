import { foldText } from '@flow/shared';
import { z } from 'zod';

/**
 * Chống mạo danh Page/shop (DA-IMPERSONATION, FR-155, US-111, Q-DIM1, `docs/09` §4 bậc 4 "rủi ro luôn thắng").
 * Hàm thuần, không DB/LLM. Kết quả `suspected` nuôi `risks.impersonation` của `decideAction` (→ chuyển người,
 * không bao giờ tự gửi). `suggestHide` chỉ là GỢI Ý để người bấm Ẩn: module này KHÔNG có đường ra lệnh ẩn
 * (nguyên tắc #3 — AI/code không bao giờ tự ẩn bình luận).
 *
 * Hai đường nghi (tín hiệu lấy từ chữ đã chuẩn hóa — chống chữ toàn khổ, zero-width, ký tự Cyrillic/Hy Lạp giống Latin,
 * "0/1/3…" thay chữ):
 *  A) tên tác giả GIỐNG tên Page/shop (giống hệt, chứa nhau, hoặc sai ≤ ~20% ký tự) VÀ có tín hiệu
 *     (link, SĐT, "page phụ", "nhận quà", số tài khoản, đòi chuyển khoản, tự xưng chủ shop/ngân hàng);
 *  B) tự xưng chủ shop/admin/ngân hàng (có động từ "là" — "chủ shop ơi" của khách thì không) VÀ đòi chuyển
 *     khoản hoặc kèm liên hệ, bất kể tên.
 * Tên giống mà bình luận bình thường → KHÔNG nghi (khách có thể trùng tên). Đầu vào hỏng/quá dài → nghi
 * (`unreadable`), thiên về chặn. Bình luận do chính Page viết (`authorIsPage`) được bỏ qua (nguyên tắc #5).
 */

/** Trần độ dài: quá → không đọc được → chặn (chống tốn CPU). */
export const MAX_COMMENT_LENGTH = 20_000;
const MAX_NAME_LENGTH = 200;
const MAX_PAGE_NAMES = 50;
/** Tên Page ngắn hơn ngưỡng này chỉ khớp khi giống hệt (tránh "Mai" khớp mọi tên chứa "mai"). */
const MIN_CONTAINMENT_LENGTH = 5;
const MIN_FUZZY_LENGTH = 5;
const FUZZY_SIMILARITY = 0.8;

export const IMPERSONATION_REASONS = [
  'name_lookalike',
  'self_claim',
  'payment_demand',
  'link',
  'phone',
  'fake_page',
  'gift',
  'account_number',
] as const;
export type ImpersonationReason = (typeof IMPERSONATION_REASONS)[number];

const inputSchema = z.object({
  authorName: z.string().max(MAX_NAME_LENGTH),
  text: z.string().max(MAX_COMMENT_LENGTH),
  // Danh sách rỗng = nơi gọi đọc tên Page lỗi → không đọc được (không để đường A tắt ngầm).
  pageNames: z.array(z.string().max(MAX_NAME_LENGTH)).min(1).max(MAX_PAGE_NAMES),
  authorIsPage: z.boolean().optional(),
});

export type ImpersonationResult = {
  /** Nghi mạo danh → `risks.impersonation` (chuyển người, không tự gửi). */
  suspected: boolean;
  /** Các tín hiệu thấy được (thứ tự cố định, không trùng) — hiển thị lý do cho nhân viên. */
  reasons: ImpersonationReason[];
  /** Gợi ý nút Ẩn cho NGƯỜI bấm; không phải lệnh. Sai-đầu-vào không gợi ý. */
  suggestHide: boolean;
  /** Đầu vào hỏng/quá dài: nghi do không đọc được. */
  unreadable: boolean;
};

const UNREADABLE: ImpersonationResult = {
  suspected: true,
  reasons: [],
  suggestHide: false,
  unreadable: true,
};
const CLEAN: ImpersonationResult = {
  suspected: false,
  reasons: [],
  suggestHide: false,
  unreadable: false,
};

// ---- Chuẩn hóa ----

/** Ký tự Cyrillic/Hy Lạp trông giống Latin (đã chữ thường) → Latin. */
const CONFUSABLES: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  α: 'a',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
};
/** Chữ số/ký hiệu thay chữ ("H0a", "Sh0p", "@dmin"). Chỉ dùng cho khóa so TÊN. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** NFKC + bỏ ký tự định dạng (zero-width…) + thường + gộp khoảng trắng. */
function lightNormalize(text: string): string {
  const lowered = text
    .normalize('NFKC')
    .replace(/\p{Cf}|️|⃣|ㅤ/gu, '')
    .toLowerCase();
  // Cyrillic/Hy Lạp giống Latin ("chuyển khоản" với о Cyrillic) cũng được đưa về Latin trong nội dung.
  return Array.from(lowered, (ch) => CONFUSABLES[ch] ?? ch)
    .join('')
    .replace(/\s+/g, ' ');
}

/** Khóa so tên: chỉ a-z0-9 sau khi bỏ dấu, đổi ký tự giống, đổi leet. */
function nameKey(name: string): string {
  const leet = Array.from(foldText(lightNormalize(name)), (ch) => LEET[ch] ?? ch).join('');
  return leet.replace(/[^a-z0-9]/g, '');
}

/** Từ chung hay thêm/bớt để nhái tên ("Hoa Xinh Store/Official/CSKH"). */
const GENERIC_NAME_WORDS = /(?:shop|store|official|cskh|fanpage|page|chinhthuc|vn)/g;

/** Bỏ từ chung; còn quá ngắn (tên Page chính là "Shop") thì giữ khóa gốc. */
function coreKey(key: string): string {
  const core = key.replace(GENERIC_NAME_WORDS, '');
  return core.length >= 3 ? core : key;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(
        Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function keysLookAlike(author: string, page: string): boolean {
  if (author.length === 0 || page.length === 0) return false;
  if (author === page) return true;
  const [shorter, longer] = author.length <= page.length ? [author, page] : [page, author];
  if (shorter.length >= MIN_CONTAINMENT_LENGTH && longer.includes(shorter)) return true;
  if (Math.max(author.length, page.length) < MIN_FUZZY_LENGTH) return false;
  const distance = editDistance(author, page);
  return 1 - distance / Math.max(author.length, page.length) >= FUZZY_SIMILARITY;
}

// ---- Tín hiệu trong chữ ----

const LINK_PATTERN =
  /(?:https?:\/\/|www\.|\b[a-z0-9-]{1,63}\.(?:com|vn|net|org|info|xyz|top|site|link|me|ly|click|shop|store|online|cc|co|io|app|club|vip)\b|\b(?:m\.me|zalo\.me|wa\.me|t\.me|bit\.ly|tinyurl))/;
const SPELLED_LINK_PATTERN = /\b(?:cham|dot)\s+(?:com|vn|net|xyz)\b/;
const PHONE_PATTERN = /(?<!\d)(?:\+?84|0)\d{9}(?!\d)/g;
const ACCOUNT_PATTERN = /(?<!\d)\d{9,19}(?!\d)/;
const FAKE_PAGE_PATTERN =
  /\b(?:(?:page|fanpage|acc|tai khoan|nick)\s*(?:phu|moi|clone|backup|du phong|cu)|doi\s+(?:page|acc|nick|tai khoan))\b/;
const GIFT_PATTERN =
  /\b(?:nhan qua|trung thuong|qua tang|qua mien phi|tang qua|nhan thuong|trung giai|boc tham|gift|giveaway|you won|free gift)\b/;
const PAYMENT_PATTERN =
  /\b(?:chuyen khoan|chuyen tien|chuyen coc|ck truoc|stk|so tai khoan|tai khoan ngan hang|dat coc|coc truoc|thanh toan truoc|nap tien|ung truoc|bank transfer|transfer|deposit|pay first|prepay)\b/;
const SELF_CLAIM_PATTERNS: readonly RegExp[] = [
  /\b(?:la|chinh la)\s+(?:chu|admin|quan tri|nhan vien|ke toan|thu quy|bo phan|cskh|chuyen vien|can bo)\b/,
  /\b(?:page|fanpage|tai khoan|acc|nick|kenh)\s+chinh thuc\b/,
  /\b(?:ben|thay mat)\s+ngan hang\b/,
  /\b(?:nhan vien|chuyen vien|can bo|bo phan)\s+(?:cua\s+)?(?:ngan hang|bank)\b/,
  /\bi\s*(?:am|m)\s+(?:the\s+|a\s+)?(?:owner|admin|manager|bank (?:staff|officer|employee))\b/,
  /\bofficial (?:page|account)\b/,
];

type TextSignals = Record<Exclude<ImpersonationReason, 'name_lookalike'>, boolean>;

function readTextSignals(text: string): TextSignals {
  const light = lightNormalize(text);
  const folded = foldText(light);
  // Gộp dấu cách/chấm/gạch giữa các chữ số để bắt "0912 345 678", "0912.345.678".
  const collapsed = light.replace(/(?<=\d)[\s.\-,()]+(?=\d)/g, '');
  const withoutPhones = collapsed.replace(PHONE_PATTERN, ' ');
  return {
    link: LINK_PATTERN.test(light) || SPELLED_LINK_PATTERN.test(folded),
    phone: new RegExp(PHONE_PATTERN.source).test(collapsed),
    fake_page: FAKE_PAGE_PATTERN.test(folded),
    gift: GIFT_PATTERN.test(folded),
    account_number: ACCOUNT_PATTERN.test(withoutPhones),
    payment_demand: PAYMENT_PATTERN.test(folded),
    self_claim: SELF_CLAIM_PATTERNS.some((pattern) => pattern.test(folded)),
  };
}

// ---- Hàm chính ----

export function evaluateImpersonation(raw: unknown): ImpersonationResult {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return UNREADABLE;
  const { authorName, text, pageNames, authorIsPage } = parsed.data;
  // Bình luận do chính Page viết: bỏ qua (nguyên tắc #5). Đã qua kiểm đầu vào nên text hợp lệ.
  if (authorIsPage === true) return CLEAN;

  const signals = readTextSignals(text);
  const authorKey = nameKey(authorName).slice(0, MAX_NAME_LENGTH);
  const pageKeys = pageNames.map((page) => nameKey(page).slice(0, MAX_NAME_LENGTH));
  // Mọi tên Page đều không có chữ/số so được (toàn emoji/ký tự lạ) → không đọc được, không cho qua ngầm.
  if (pageKeys.every((key) => key.length === 0)) return UNREADABLE;
  const authorCore = coreKey(authorKey);
  const lookalike = pageKeys.some(
    (key) => keysLookAlike(authorKey, key) || keysLookAlike(authorCore, coreKey(key)),
  );

  const contact =
    signals.link || signals.phone || signals.fake_page || signals.gift || signals.account_number;
  const nameRoute = lookalike && (contact || signals.payment_demand || signals.self_claim);
  const claimRoute = signals.self_claim && (signals.payment_demand || contact);
  const suspected = nameRoute || claimRoute;

  const seen: Record<ImpersonationReason, boolean> = { name_lookalike: lookalike, ...signals };
  return {
    suspected,
    reasons: IMPERSONATION_REASONS.filter((reason) => seen[reason]),
    suggestHide: suspected,
    unreadable: false,
  };
}

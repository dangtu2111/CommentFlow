/**
 * DỮ LIỆU MẪU `[MẪU]` cho các khối của Báo cáo chưa có nguồn thật (xu hướng ngày, nhãn ý định, top bài viết, tên nhân
 * viên, gợi ý AI). Chép từ design/stitch/reports.html. Chỉ hiện khi `showSampleData()` (APP_ENV=dev); ở môi trường
 * khác các khối này hiện "—"/"Sắp có". KHÔNG bao giờ dùng làm số liệu thật hoặc trong test nghiệp vụ.
 */

export type TrendBucket = { ai: number; reviewed: number; skipped: number; label?: string };

/** 14 cột xếp chồng (cao theo đơn vị SVG 0–220), nhãn trục X chỉ ở vài cột. */
export const TREND_SAMPLE: readonly TrendBucket[] = [
  { skipped: 28, reviewed: 40, ai: 70, label: '01/05' },
  { skipped: 22, reviewed: 40, ai: 80 },
  { skipped: 20, reviewed: 35, ai: 70 },
  { skipped: 18, reviewed: 32, ai: 82, label: '08/05' },
  { skipped: 26, reviewed: 39, ai: 83 },
  { skipped: 25, reviewed: 50, ai: 87 },
  { skipped: 20, reviewed: 40, ai: 80, label: '15/05' },
  { skipped: 18, reviewed: 37, ai: 89 },
  { skipped: 15, reviewed: 33, ai: 102 },
  { skipped: 16, reviewed: 34, ai: 106, label: '22/05' },
  { skipped: 14, reviewed: 30, ai: 108 },
  { skipped: 12, reviewed: 28, ai: 118 },
  { skipped: 11, reviewed: 27, ai: 117 },
  { skipped: 10, reviewed: 25, ai: 125, label: '28/05' },
];

export type IntentSlice = {
  label: string;
  pct: number;
  tone: 'primary' | 'secondary' | 'tertiary' | 'error' | 'outline';
  hint?: string;
};

export const INTENT_SAMPLE: readonly IntentSlice[] = [
  { label: 'Hỏi giá sản phẩm', pct: 44, tone: 'primary', hint: '(AI nhanh nhất)' },
  { label: 'Tư vấn size / chất liệu', pct: 28, tone: 'secondary' },
  { label: 'Ý định mua hàng (Ưu tiên)', pct: 14, tone: 'tertiary' },
  { label: 'Khiếu nại / Vận chuyển', pct: 8, tone: 'error', hint: '(Chuyển CSKH)' },
  { label: 'Nghi ngờ spam / Khác', pct: 6, tone: 'outline' },
];

export type TopPostSample = {
  title: string;
  channel: string;
  channelTone: 'primary' | 'secondary' | 'warning';
  product: string | null;
  priceQuestions: number;
  autoPct: number | null;
};

export const TOP_POSTS_SAMPLE: readonly TopPostSample[] = [
  {
    title: 'BST Nắng Hè 2025 (Chạy Ads)',
    channel: 'Facebook Fanpage',
    channelTone: 'primary',
    product: 'Váy hoa nhí Vintage',
    priceQuestions: 482,
    autoPct: 89,
  },
  {
    title: 'Lookbook Áo Blazer Linen Hàn Quốc',
    channel: 'Instagram Post',
    channelTone: 'secondary',
    product: 'Blazer Linen 2 Lớp',
    priceQuestions: 245,
    autoPct: 76,
  },
  {
    title: 'TikTok Video: Áo Thun Basic 100% Cotton',
    channel: 'TikTok Viral (Chưa tự động hóa)',
    channelTone: 'warning',
    product: null,
    priceQuestions: 128,
    autoPct: null,
  },
];

export type StaffSample = {
  name: string;
  summary: string;
  editRate: string;
  trust: string;
  trustTone: 'primary' | 'neutral' | 'tertiary';
  online: boolean;
};

export const STAFF_SAMPLE: readonly StaffSample[] = [
  {
    name: 'Nguyễn Mai Linh',
    summary: '620 câu đã duyệt • SLA 1m45s',
    editRate: 'Sửa AI: 12%',
    trust: 'Rất tin tưởng AI',
    trustTone: 'primary',
    online: true,
  },
  {
    name: 'Trần Quốc Huy',
    summary: '410 câu đã duyệt • SLA 2m10s',
    editRate: 'Sửa AI: 24%',
    trust: 'Tin tưởng ổn định',
    trustTone: 'neutral',
    online: true,
  },
  {
    name: 'Lê Thuỳ Dung',
    summary: '285 câu đã duyệt • SLA 3m05s',
    editRate: 'Sửa AI: 31%',
    trust: 'Chăm chút thủ công',
    trustTone: 'tertiary',
    online: false,
  },
];

/** Số liệu các thẻ chỉ số không suy ra được từ `Report`. */
export const KPI_SAMPLE = {
  comments: '3.612',
  messages: '1.214',
  totalDelta: '+18.4%',
  aiDelta: '+7.2%',
  beforeAi: '45 phút',
  waitCut: '97.3%',
  fteEquivalent: '~1.8',
  savedMoney: '12.8 tr ₫',
  leads: '348',
  conversion: '8.2%',
  leadsWeek: '+42',
  staffCount: 4,
  agreement: '81.4%',
  intentF1: '94.6%',
  trendNote: '+21%',
  insightQuestion: 'Chính sách bảo hành phụ kiện khi mua kèm',
  insightAsked: 28,
  insightGain: '+3.4%',
  insightHours: 14,
  range: '01/05 - 28/05/2025',
} as const;

/** Cung tròn của biểu đồ vành khuyên (chu vi 2π·38 ≈ 238.76); mỗi lát: độ dài + độ lệch (âm). */
export function donutArcs(
  slices: readonly Pick<IntentSlice, 'pct'>[],
  radius = 38,
): { dash: number; offset: number; circumference: number }[] {
  const circumference = 2 * Math.PI * radius;
  let used = 0;
  return slices.map((slice) => {
    const dash = (slice.pct / 100) * circumference;
    const arc = { dash, offset: -used, circumference };
    used += dash;
    return arc;
  });
}

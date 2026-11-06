/**
 * DỮ LIỆU MẪU `[MẪU]` để dựng giao diện Quy tắc spam (UI-first, QUIC1). Chỉ dùng ở `/dev/ui/spam-rules` và ở trang
 * thật khi `showSampleData()` (APP_ENV=dev). Không bao giờ hiện ở staging/production. Số điện thoại trong mẫu là số
 * giả `0900000000` hoặc đã che bằng `*` (không có số thật, không có dữ liệu khách thật).
 */

export type SampleRuleBadge = {
  tone: 'solid' | 'accent' | 'warm' | 'muted' | 'neutral';
  text: string;
  icon: 'shield' | 'sync' | 'hand' | 'flask' | 'none';
};

export type SampleRule = {
  id: string;
  name: string;
  icon: 'phone' | 'link' | 'face' | 'flaky';
  badges: SampleRuleBadge[];
  conditionStrong: string;
  conditionRest: string;
  scopeStrong: string;
  scopeRest?: string;
  matchesLabel: 'matches' | 'simulated';
  matches: number;
  falseRate: string;
  extraLabel: string;
  extraValue: string;
  /** Nút thứ hai bên phải: nhật ký hay mô phỏng. */
  secondAction: 'history' | 'simulation';
};

export const SPAM_SAMPLE_RULES: SampleRule[] = [
  {
    id: 'mau-1',
    name: '[MẪU] Chặn cướp khách: Chứa Số điện thoại khách hàng',
    icon: 'phone',
    badges: [
      { tone: 'solid', text: 'Tự ẩn an toàn', icon: 'shield' },
      { tone: 'accent', text: 'Auto-CRM Lead', icon: 'sync' },
    ],
    conditionStrong: 'Định dạng SĐT VN',
    conditionRest: ' (10 số, số cách nhau, viết chữ/ký hiệu đặc biệt 09x, 08x...)',
    scopeStrong: 'FB An Nhiên, IG @annhien',
    scopeRest: ' (3 kênh)',
    matchesLabel: 'matches',
    matches: 342,
    falseRate: '0.3% (Rất an toàn)',
    extraLabel: 'Thời gian cập nhật:',
    extraValue: '14:20 hôm qua bởi Nguyễn Mai Linh',
    secondAction: 'history',
  },
  {
    id: 'mau-2',
    name: '[MẪU] Chặn quảng cáo chéo & Link lừa đảo / Phishing',
    icon: 'link',
    badges: [
      { tone: 'solid', text: 'Tự ẩn', icon: 'shield' },
      { tone: 'neutral', text: 'Ngoại lệ: annhienstore.vn', icon: 'none' },
    ],
    conditionStrong: 'Chứa URL / Tên miền',
    conditionRest: ' (http://, https://, .com, .vn, bit.ly, t.me...)',
    scopeStrong: 'Tất cả kênh kết nối',
    matchesLabel: 'matches',
    matches: 189,
    falseRate: '1.1% (An toàn)',
    extraLabel: 'Trạng thái:',
    extraValue: 'Bảo vệ 24/7',
    secondAction: 'history',
  },
  {
    id: 'mau-3',
    name: '[MẪU] Từ khóa xúc phạm / Kém văn hóa',
    icon: 'face',
    badges: [
      { tone: 'warm', text: 'Chỉ đánh dấu Nghi spam (Duyệt tay)', icon: 'hand' },
      { tone: 'neutral', text: 'Cần thêm 5 lượt khớp trước khi bật Tự ẩn', icon: 'none' },
    ],
    conditionStrong: 'Chứa từ khóa tiêu cực',
    conditionRest: ' (lừa đảo, cút, dỏm, scam, đồ giả...)',
    scopeStrong: 'Tất cả kênh',
    matchesLabel: 'matches',
    matches: 45,
    falseRate: '4.4% (Cần duyệt thủ công)',
    extraLabel: 'Bảo vệ:',
    extraValue: 'Đẩy vào tab Duyệt nghi vấn',
    secondAction: 'history',
  },
  {
    id: 'mau-4',
    name: '[MẪU] Spam ký tự vô nghĩa & Icon hàng loạt',
    icon: 'flaky',
    badges: [
      { tone: 'muted', text: 'Chế độ thử nghiệm (Dry-run)', icon: 'flask' },
      { tone: 'neutral', text: 'Chỉ mô phỏng - Chưa ẩn thật', icon: 'none' },
    ],
    conditionStrong: '> 10 icon liên tiếp',
    conditionRest: ' hoặc chuỗi ký tự vô nghĩa (asdfgh, xxx...)',
    scopeStrong: 'TikTok & Facebook Page',
    matchesLabel: 'simulated',
    matches: 18,
    falseRate: '5.6% (Cần tinh chỉnh điều kiện)',
    extraLabel: 'Gợi ý AI:',
    extraValue: 'Tăng ngưỡng lên >15 icon',
    secondAction: 'simulation',
  },
];

export type SampleHiddenComment = {
  id: string;
  customer: string;
  source: string;
  platform: 'facebook' | 'instagram';
  /** Phần chữ trước và sau đoạn được đánh dấu. */
  before: string;
  highlight: string;
  after: string;
  footnote: string;
  footnoteTone: 'lead' | 'danger';
  rule: string;
  ruleIcon: 'shield' | 'link';
  ago: string;
  at: string;
  secondary: 'flag' | 'block';
};

export const SPAM_SAMPLE_HIDDEN: SampleHiddenComment[] = [
  {
    id: 'mau-h1',
    customer: '[MẪU] Trần Thu Thảo',
    source: 'FB: An Nhiên Store • Bài: Đầm Voan Hoa',
    platform: 'facebook',
    before: 'Shop ship cho mình 1 set size M về địa chỉ này nhé, gọi mình số: ',
    highlight: '0912.839.***',
    after: '',
    footnote: 'Đã tự động lưu vào CRM Khách tiềm năng (SĐT: 0900000000)',
    footnoteTone: 'lead',
    rule: 'Chứa số điện thoại',
    ruleIcon: 'shield',
    ago: '15 phút trước',
    at: '15:42 • 28/10/2023',
    secondary: 'flag',
  },
  {
    id: 'mau-h2',
    customer: '[MẪU] Tài Khoản Rao Vặt 99',
    source: 'IG: @annhien.official • Post: BST Thu Đông',
    platform: 'instagram',
    before: 'Kiếm tiền thụ động 500k/ngày không cần vốn xem ngay tại: ',
    highlight: 'https://bit.ly/kiemtien-nhanh24h',
    after: ' nhận quà liền tay!',
    footnote: 'Hệ thống nhận diện URL độc hại rút gọn',
    footnoteTone: 'danger',
    rule: 'Link quảng cáo / Lừa đảo',
    ruleIcon: 'link',
    ago: '1 giờ trước',
    at: '14:30 • 28/10/2023',
    secondary: 'block',
  },
  {
    id: 'mau-h3',
    customer: '[MẪU] Hoàng Đăng Khôi',
    source: 'FB: An Nhiên Store • Reel: Áo Blazer Basic',
    platform: 'facebook',
    before: 'Báo giá và chốt đơn giúp mình nhé: ',
    highlight: '0389 441 ***',
    after: ' mình ở Cầu Giấy Hà Nội.',
    footnote: 'Đã tự động lưu vào CRM Khách tiềm năng (SĐT: 0900000000)',
    footnoteTone: 'lead',
    rule: 'Chứa số điện thoại',
    ruleIcon: 'shield',
    ago: '2 giờ trước',
    at: '13:12 • 28/10/2023',
    secondary: 'flag',
  },
];

export const SPAM_SAMPLE_METRICS = {
  activeRules: 4,
  filtered7d: 531,
  hidden30d: 594,
  hiddenGrowthPercent: 14.2,
  leads: 342,
  falsePositivePercent: 0.8,
  falsePositiveLimitPercent: 2,
  reactionSeconds: 1.4,
  logsTotal: 531,
  logsFrom: 1,
  logsTo: 3,
};

export type SpamMetricsData = typeof SPAM_SAMPLE_METRICS;

export const SPAM_SAMPLE_SCOPE_CHANNELS = [
  { id: 'mau-fb', name: 'FB: An Nhiên Store', note: 'Fanpage chính thức', checked: true },
  { id: 'mau-ig', name: 'IG: @annhien.official', note: 'Instagram Direct & Post', checked: true },
  { id: 'mau-tt', name: 'TikTok Shop: An Nhiên', note: 'Video & Livestream feed', checked: false },
] as const;

export const SPAM_SAMPLE_DRY_RUN = { matched: 24, real: 23, check: 1, realPercent: 95.8 };

// Dữ liệu MẪU v2 cho DB dev (yêu cầu chủ dự án 06/11/2026: "tạo dữ liệu mẫu luôn để hiển thị").
// Mọi thực thể mang nhãn [MẪU]; KHÔNG có SĐT/email thật (SĐT lead dựng lúc chạy từ số giả `0900…`, email dùng miền `.test`).
// Giá/số tiền trong câu mẫu khớp biến thể ở demo-data.ts (nguyên tắc #4).

import { DEMO_TAG } from './demo-data';

const T = DEMO_TAG;

export type Lang = 'vi' | 'en';

// ───────── (1) Cơ sở kiến thức ─────────

export const KB_SHOP_PROFILES = [
  {
    lang: 'vi',
    name: `${T} Demo Shop`,
    description: `${T} Cửa hàng thời trang mẫu: áo, váy, quần, giày và phụ kiện cho người đi làm, đi học.`,
    address: `${T} Địa chỉ mẫu, Quận 1, TP.HCM`,
    openingHours: '08:00–21:00 hằng ngày',
    contact: `${T} Nhắn tin fanpage để được tư vấn`,
    website: 'https://demo-shop.example.test',
  },
  {
    lang: 'en',
    name: `${T} Demo Shop`,
    description: `${T} Sample fashion store: tops, dresses, trousers, shoes and accessories.`,
    address: `${T} Sample address, District 1, Ho Chi Minh City`,
    openingHours: '08:00–21:00 every day',
    contact: `${T} Message our page for advice`,
    website: 'https://demo-shop.example.test',
  },
] as const;

export const KB_POLICIES = [
  {
    kind: 'return',
    lang: 'vi',
    title: `${T} Đổi trả trong 7 ngày`,
    content: `${T} Đổi trả trong 7 ngày kể từ khi nhận hàng nếu sản phẩm còn nguyên tem mác, chưa giặt, chưa qua sử dụng. Đổi size miễn phí 1 lần. Hàng giảm giá trên 30% không áp dụng đổi trả. Đây là nội dung mẫu.`,
  },
  {
    kind: 'shipping',
    lang: 'vi',
    title: `${T} Vận chuyển và phí ship`,
    content: `${T} Giao toàn quốc 2–4 ngày làm việc (nội thành TP.HCM 1–2 ngày). Freeship cho đơn từ 500.000đ; dưới mức này phí do đơn vị vận chuyển tính. Shop không tự tính phí ship trong bình luận — nhân viên sẽ báo khi chốt đơn. Đây là nội dung mẫu.`,
  },
  {
    kind: 'warranty',
    lang: 'vi',
    title: `${T} Bảo hành đường may`,
    content: `${T} Bảo hành đường may, khóa kéo, nút trong 30 ngày. Lỗi do nhà sản xuất được sửa hoặc đổi mới miễn phí. Không bảo hành hư hỏng do sử dụng sai cách. Đây là nội dung mẫu.`,
  },
  {
    kind: 'payment',
    lang: 'vi',
    title: `${T} Thanh toán`,
    content: `${T} Thanh toán khi nhận hàng (COD) hoặc chuyển khoản. Đơn chuyển khoản được ưu tiên đóng gói trong ngày. Đây là nội dung mẫu.`,
  },
  {
    kind: 'return',
    lang: 'en',
    title: `${T} 7-day returns`,
    content: `${T} Returns and exchanges within 7 days of delivery for unworn items with tags attached. One free size exchange. Sample content.`,
  },
  {
    kind: 'shipping',
    lang: 'en',
    title: `${T} Shipping`,
    content: `${T} Nationwide delivery in 2–4 business days. Free shipping on orders from 500,000 VND. Sample content.`,
  },
] as const;

export const KB_FAQS: ReadonlyArray<{
  lang: Lang;
  question: string;
  answer: string;
  tags: string[];
}> = [
  {
    lang: 'vi',
    question: `${T} Shop có freeship không?`,
    answer: 'Freeship cho đơn từ 500.000đ trên toàn quốc (mẫu).',
    tags: ['ship'],
  },
  {
    lang: 'vi',
    question: `${T} Mất bao lâu để nhận hàng?`,
    answer: 'Nội thành 1–2 ngày, tỉnh 2–4 ngày làm việc (mẫu).',
    tags: ['ship'],
  },
  {
    lang: 'vi',
    question: `${T} Có thể đổi size không?`,
    answer: 'Đổi size 1 lần miễn phí trong 7 ngày nếu còn tem mác (mẫu).',
    tags: ['doi-tra'],
  },
  {
    lang: 'vi',
    question: `${T} Hàng giảm giá có đổi trả được không?`,
    answer: 'Hàng giảm trên 30% không áp dụng đổi trả (mẫu).',
    tags: ['doi-tra'],
  },
  {
    lang: 'vi',
    question: `${T} Shop có nhận thanh toán khi nhận hàng không?`,
    answer: 'Có, shop nhận COD toàn quốc (mẫu).',
    tags: ['thanh-toan'],
  },
  {
    lang: 'vi',
    question: `${T} Chuyển khoản vào đâu?`,
    answer:
      'Nhân viên sẽ gửi thông tin chuyển khoản khi chốt đơn, shop không đăng số tài khoản trong bình luận (mẫu).',
    tags: ['thanh-toan'],
  },
  {
    lang: 'vi',
    question: `${T} Cách chọn size áo?`,
    answer: 'Bạn cho shop chiều cao và cân nặng, shop tra bảng size giúp bạn nhé (mẫu).',
    tags: ['size'],
  },
  {
    lang: 'vi',
    question: `${T} Áo có bị co sau khi giặt không?`,
    answer: 'Vải cotton đã qua xử lý co rút, giặt nước lạnh dưới 30°C để bền màu (mẫu).',
    tags: ['chat-lieu'],
  },
  {
    lang: 'vi',
    question: `${T} Shop có cửa hàng để xem trực tiếp không?`,
    answer: 'Shop có điểm xem hàng mẫu, nhắn tin để hẹn giờ (mẫu).',
    tags: ['cua-hang'],
  },
  {
    lang: 'vi',
    question: `${T} Giờ làm việc của shop?`,
    answer: '08:00–21:00 hằng ngày, kể cả cuối tuần (mẫu).',
    tags: ['cua-hang'],
  },
  {
    lang: 'vi',
    question: `${T} Mua sỉ có giá riêng không?`,
    answer: 'Đơn từ 10 sản phẩm vui lòng nhắn tin để nhân viên báo giá (mẫu).',
    tags: ['si'],
  },
  {
    lang: 'vi',
    question: `${T} Làm sao kiểm tra đơn hàng của mình?`,
    answer: 'Bạn nhắn mã đơn hoặc tên người nhận, nhân viên sẽ kiểm tra giúp (mẫu).',
    tags: ['don-hang'],
  },
  {
    lang: 'vi',
    question: `${T} Sản phẩm lỗi thì xử lý thế nào?`,
    answer:
      'Chụp ảnh lỗi gửi shop trong 3 ngày, shop đổi mới hoặc hoàn tiền theo chính sách (mẫu).',
    tags: ['bao-hanh'],
  },
  {
    lang: 'en',
    question: `${T} Do you offer free shipping?`,
    answer: 'Free shipping on orders from 500,000 VND (sample).',
    tags: ['ship'],
  },
  {
    lang: 'en',
    question: `${T} Can I exchange the size?`,
    answer: 'One free size exchange within 7 days if tags are attached (sample).',
    tags: ['returns'],
  },
];

export const KB_BRAND_VOICES = [
  {
    lang: 'vi',
    tone: `${T} Thân thiện, lịch sự, ngắn gọn`,
    greeting: 'Dạ shop chào bạn ạ!',
    signOff: 'Cảm ơn bạn đã quan tâm shop nhé.',
    doRules: [
      'Xưng "shop", gọi khách là "bạn"',
      'Nêu giá đúng như trong dữ liệu sản phẩm',
      'Hỏi lại size/màu khi khách chưa nói rõ',
    ],
    dontRules: ['Không hứa giảm giá', 'Không tự tính phí ship', 'Không cam kết ngày giao cụ thể'],
    addressByName: false,
    shopPronoun: 'shop',
    customerAddress: 'ban',
    handoffTemplates: {
      shipping: {
        inHours: 'Dạ phần phí ship nhân viên sẽ báo bạn ngay ạ.',
        outHours: 'Dạ shop đã ghi nhận, sáng mai nhân viên báo phí ship cho bạn nhé.',
      },
    },
  },
  {
    lang: 'en',
    tone: `${T} Friendly and concise`,
    greeting: 'Hi there, thanks for reaching out!',
    signOff: 'Thank you for choosing us.',
    doRules: ['Quote prices exactly as listed', 'Ask for size and colour when missing'],
    dontRules: ['Never promise discounts', 'Never calculate shipping fees'],
    addressByName: false,
    shopPronoun: 'shop',
    customerAddress: 'you',
    handoffTemplates: {},
  },
] as const;

export const DEMO_ABBREVIATIONS: ReadonlyArray<{ short: string; full: string; lang: Lang }> = [
  { short: 'sz', full: 'size', lang: 'vi' },
  { short: 'đc', full: 'được', lang: 'vi' },
  { short: 'k', full: 'không', lang: 'vi' },
  { short: 'mn', full: 'mọi người', lang: 'vi' },
  { short: 'bn', full: 'bao nhiêu', lang: 'vi' },
  { short: 'lh', full: 'liên hệ', lang: 'vi' },
  { short: 'cod', full: 'thanh toán khi nhận hàng', lang: 'vi' },
  { short: 'fs', full: 'freeship', lang: 'vi' },
  { short: 'sdt', full: 'số điện thoại', lang: 'vi' },
  { short: 'dm', full: 'direct message', lang: 'en' },
];

/** Bí danh theo khóa sản phẩm (demo-data.ts). */
export const DEMO_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ao: ['áo thun trơn', 'áo phông basic', 'áo cotton'],
  vay: ['váy hoa', 'đầm hoa nhí'],
  giay: ['giày thể thao trắng', 'sneaker'],
  tui: ['túi vải', 'túi canvas'],
  quan: ['quần bò', 'jean ống rộng'],
  somi: ['sơ mi lanh', 'áo linen'],
  khoac: ['áo gió', 'khoác chống nắng'],
  chanvay: ['chân váy ly', 'váy xếp li'],
  non: ['nón kết', 'mũ lưỡi trai đen'],
  dep: ['dép quai ngang', 'dép đi trong nhà'],
  balo: ['ba lô laptop', 'cặp laptop'],
  setdo: ['bộ thể thao', 'đồ tập gym'],
};

export type DemoSizeRow = {
  scope: { category: string } | { productKey: string };
  size: string;
  height: [number, number];
  weight: [number, number];
  measures: Record<string, string | number>;
};

export const DEMO_SIZE_CHARTS: readonly DemoSizeRow[] = [
  {
    scope: { category: 'Áo' },
    size: 'S',
    height: [150, 160],
    weight: [40, 50],
    measures: { ngực: '84-88 cm' },
  },
  {
    scope: { category: 'Áo' },
    size: 'M',
    height: [160, 168],
    weight: [51, 58],
    measures: { ngực: '88-92 cm' },
  },
  {
    scope: { category: 'Áo' },
    size: 'L',
    height: [169, 175],
    weight: [59, 68],
    measures: { ngực: '92-98 cm' },
  },
  {
    scope: { category: 'Áo' },
    size: 'XL',
    height: [176, 185],
    weight: [69, 80],
    measures: { ngực: '98-104 cm' },
  },
  {
    scope: { category: 'Váy' },
    size: 'S',
    height: [150, 160],
    weight: [40, 50],
    measures: { eo: '62-66 cm' },
  },
  {
    scope: { category: 'Váy' },
    size: 'M',
    height: [161, 168],
    weight: [51, 58],
    measures: { eo: '66-70 cm' },
  },
  {
    scope: { productKey: 'quan' },
    size: '28',
    height: [155, 163],
    weight: [45, 54],
    measures: { eo: '72 cm' },
  },
  {
    scope: { productKey: 'quan' },
    size: '30',
    height: [164, 172],
    weight: [55, 63],
    measures: { eo: '77 cm' },
  },
  {
    scope: { productKey: 'quan' },
    size: '32',
    height: [173, 182],
    weight: [64, 75],
    measures: { eo: '82 cm' },
  },
];

export const DEMO_POST_NOTES: ReadonlyArray<{
  postKey: string;
  content: string;
  fromHoursAgo: number;
  toHoursFromNow: number | null;
}> = [
  {
    postKey: 'p1',
    content: `${T} Áo thun đang tặng kèm tất cho đơn từ 2 áo, đến hết tuần.`,
    fromHoursAgo: 48,
    toHoursFromNow: 96,
  },
  {
    postKey: 'p2',
    content: `${T} Váy hoa nhí còn lại size S, size M đã hết hàng.`,
    fromHoursAgo: 24,
    toHoursFromNow: null,
  },
  {
    postKey: 'p6',
    content: `${T} Ưu đãi sơ mi linen đã kết thúc.`,
    fromHoursAgo: 240,
    toHoursFromNow: -48,
  },
  {
    postKey: 'p8',
    content: `${T} Set đồ thể thao sẽ mở bán đợt mới vào cuối tháng.`,
    fromHoursAgo: 0,
    toHoursFromNow: 400,
  },
];

// ───────── (4) Quy tắc spam ─────────

export const DEMO_SPAM_RULES: ReadonlyArray<{
  name: string;
  type: 'keyword' | 'regex' | 'phone' | 'link' | 'emoji_only' | 'tag_only';
  pattern: string;
  action: 'mark' | 'skip';
  enabled: boolean;
}> = [
  {
    name: `${T} Từ khóa kiếm tiền online`,
    type: 'keyword',
    pattern: 'kiếm tiền online',
    action: 'mark',
    enabled: true,
  },
  { name: `${T} Từ khóa cá độ`, type: 'keyword', pattern: 'cá độ', action: 'mark', enabled: true },
  { name: `${T} Chứa liên kết lạ`, type: 'link', pattern: '', action: 'mark', enabled: true },
  { name: `${T} Để lại số điện thoại`, type: 'phone', pattern: '', action: 'mark', enabled: true },
  {
    name: `${T} Chỉ có biểu tượng cảm xúc`,
    type: 'emoji_only',
    pattern: '',
    action: 'skip',
    enabled: true,
  },
  {
    name: `${T} Chỉ gắn thẻ bạn bè`,
    type: 'tag_only',
    pattern: '',
    action: 'skip',
    enabled: false,
  },
  {
    name: `${T} Mời vào nhóm kín`,
    type: 'regex',
    pattern: 'nhóm (kín|vip)',
    action: 'mark',
    enabled: true,
  },
];

export type DemoSpamComment = {
  externalId: string;
  postKey: string;
  text: string;
  minutesAgo: number;
};

/** Bình luận khớp quy tắc ở trên (số điện thoại là số GIẢ `0900…`, không phải của ai). */
export const DEMO_SPAM_COMMENTS: readonly DemoSpamComment[] = [
  {
    externalId: 'demo_spam_01',
    postKey: 'p1',
    text: 'Kiếm tiền online tại nhà 500k/ngày, inbox mình chỉ cách',
    minutesAgo: 95,
  },
  {
    externalId: 'demo_spam_02',
    postKey: 'p2',
    text: 'Xem ngay bit.ly/mau-giam-soc giảm sốc 90%',
    minutesAgo: 140,
  },
  {
    externalId: 'demo_spam_03',
    postKey: 'p3',
    text: 'Ai cần mua sỉ gọi 0900 000 123 em tư vấn nhé',
    minutesAgo: 210,
  },
  {
    externalId: 'demo_spam_04',
    postKey: 'p5',
    text: 'Vào nhóm kín nhận code giảm giá tại link bio nha mọi người',
    minutesAgo: 330,
  },
  {
    externalId: 'demo_spam_05',
    postKey: 'p6',
    text: 'Cá độ bóng đá uy tín, nạp rút nhanh, ib mình',
    minutesAgo: 420,
  },
  { externalId: 'demo_spam_06', postKey: 'p7', text: '😍😍😍🔥🔥🔥', minutesAgo: 500 },
];

// ───────── (5) Tự động hóa ─────────

export type DemoMode = 'off' | 'shadow' | 'auto';

/** Ma trận kênh × đối tượng × nhãn; ô không liệt kê = Tắt. Nhãn Khiếu nại/Spam không có ô (luôn chặn). */
export const DEMO_AUTOMATION = {
  threshold: 0.88,
  delaySeconds: 120 as const,
  dailyCap: 80,
  activeHours: { days: [0, 1, 2, 3, 4, 5, 6], from: '08:00', to: '21:30' },
  blockedKeywords: ['hoàn tiền', 'kiện', 'lừa đảo', 'báo công an'],
  signature: `— ${T} Demo Shop`,
  matrix: [
    { channelKey: 'fb', target: 'comment', label: 'price', mode: 'auto' },
    { channelKey: 'fb', target: 'comment', label: 'advice', mode: 'shadow' },
    { channelKey: 'fb', target: 'comment', label: 'purchase', mode: 'off' },
    { channelKey: 'fb', target: 'message', label: 'price', mode: 'shadow' },
    { channelKey: 'fb', target: 'message', label: 'advice', mode: 'shadow' },
    { channelKey: 'ig', target: 'comment', label: 'price', mode: 'shadow' },
    { channelKey: 'ig', target: 'comment', label: 'advice', mode: 'off' },
    { channelKey: 'ig', target: 'message', label: 'price', mode: 'off' },
    { channelKey: 'tt', target: 'comment', label: 'price', mode: 'shadow' },
    { channelKey: 'tt', target: 'comment', label: 'advice', mode: 'off' },
  ] as ReadonlyArray<{
    channelKey: string;
    target: 'comment' | 'message';
    label: 'price' | 'advice' | 'purchase';
    mode: DemoMode;
  }>,
} as const;

// ───────── (3) Khách tiềm năng ─────────

export type DemoLeadStage = 'new' | 'contacted' | 'won' | 'lost';
export type DemoLeadSpec = {
  key: number;
  stage: DemoLeadStage;
  channelKey: 'fb' | 'ig' | 'tt';
  source: 'comment' | 'message';
  /** `phone`: số giả dựng lúc chạy (0900 + 6 chữ số); `email`: địa chỉ `.test`; có thể có cả hai. */
  contact: 'phone' | 'email' | 'both';
  note: string | null;
  assignee: 'staff' | 'staff2' | null;
};

const LEAD_STAGES: DemoLeadStage[] = [
  ...Array<DemoLeadStage>(9).fill('new'),
  ...Array<DemoLeadStage>(8).fill('contacted'),
  ...Array<DemoLeadStage>(4).fill('won'),
  ...Array<DemoLeadStage>(4).fill('lost'),
];
const LEAD_NOTES = [
  null,
  `${T} Hỏi giá sỉ 10 áo`,
  `${T} Hẹn gọi lại sau 18h`,
  `${T} Quan tâm sneaker size 38`,
  null,
  `${T} Đã gửi bảng size`,
  null,
  `${T} Khách ở Đà Nẵng, hỏi phí ship`,
];

export const DEMO_LEADS: readonly DemoLeadSpec[] = LEAD_STAGES.map((stage, i) => ({
  key: i + 1,
  stage,
  channelKey: (['fb', 'ig', 'tt'] as const)[i % 3] as 'fb' | 'ig' | 'tt',
  source: i % 4 === 3 ? 'message' : 'comment',
  contact: i % 5 === 4 ? 'both' : i % 7 === 6 ? 'email' : 'phone',
  note: LEAD_NOTES[i % LEAD_NOTES.length] ?? null,
  assignee: stage === 'new' ? null : i % 2 === 0 ? 'staff' : 'staff2',
}));

// ───────── (6) Nhật ký hoạt động ─────────

export type DemoLogSpec = {
  daysAgo: number;
  hour: number;
  actor: 'owner' | 'staff' | 'staff2' | 'ai' | 'system';
  action: string;
  targetType: string;
  note: string;
};

const L = (
  daysAgo: number,
  hour: number,
  actor: DemoLogSpec['actor'],
  action: string,
  targetType: string,
  note: string,
): DemoLogSpec => ({ daysAgo, hour, actor, action, targetType, note: `${T} ${note}` });

export const DEMO_ACTION_LOGS: readonly DemoLogSpec[] = [
  L(13, 9, 'owner', 'workspace.created', 'workspace', 'Tạo workspace'),
  L(13, 9, 'owner', 'auth.login', 'user', 'Đăng nhập chủ shop'),
  L(13, 10, 'owner', 'channel.connected', 'channel', 'Kết nối Fanpage'),
  L(13, 10, 'owner', 'channel.connected', 'channel', 'Kết nối Instagram'),
  L(12, 8, 'owner', 'invitation.created', 'invitation', 'Mời nhân viên thứ nhất'),
  L(12, 9, 'staff', 'invitation.accepted', 'invitation', 'Nhân viên thứ nhất tham gia'),
  L(12, 9, 'staff', 'auth.login', 'user', 'Đăng nhập nhân viên'),
  L(12, 14, 'owner', 'invitation.created', 'invitation', 'Mời nhân viên thứ hai'),
  L(11, 8, 'staff2', 'invitation.accepted', 'invitation', 'Nhân viên thứ hai tham gia'),
  L(11, 9, 'owner', 'member.role_changed', 'member', 'Đổi vai trò nhân viên thứ hai: Staff'),
  L(11, 10, 'owner', 'kb.faq_created', 'faq', 'Thêm câu hỏi thường gặp'),
  L(11, 11, 'owner', 'kb.policy_updated', 'policy', 'Cập nhật chính sách đổi trả'),
  L(10, 9, 'owner', 'kb.published', 'kb_version', 'Xuất bản kiến thức phiên bản 1'),
  L(10, 10, 'owner', 'product.imported', 'product', 'Nhập 12 sản phẩm'),
  L(10, 11, 'owner', 'spam_rule.created', 'rule', 'Tạo quy tắc spam từ khóa'),
  L(9, 8, 'ai', 'ai.draft_created', 'comment', 'AI soạn bản nháp trả lời giá'),
  L(9, 8, 'staff', 'comment.reply_requested', 'comment', 'Duyệt và gửi bản nháp'),
  L(9, 10, 'staff', 'comment.reply_edited', 'comment', 'Sửa bản nháp trước khi gửi'),
  L(9, 15, 'staff2', 'comment.reply_requested', 'comment', 'Gửi trả lời bình luận hỏi size'),
  L(8, 9, 'owner', 'automation.settings_updated', 'automation', 'Đặt ngưỡng 0,88 và trễ 2 phút'),
  L(8, 9, 'owner', 'automation.matrix_updated', 'automation', 'Bật chạy thử cho Fanpage'),
  L(8, 16, 'system', 'channel.token_refreshed', 'channel', 'Làm mới mã truy cập kênh'),
  L(7, 8, 'staff', 'auth.login', 'user', 'Đăng nhập nhân viên'),
  L(7, 9, 'staff', 'comment.hide_requested', 'comment', 'Yêu cầu ẩn bình luận spam'),
  L(7, 9, 'system', 'comment.hidden', 'comment', 'Đã ẩn bình luận spam trên nền tảng'),
  L(7, 13, 'staff2', 'comment.reply_requested', 'comment', 'Gửi trả lời về tồn kho'),
  L(6, 9, 'owner', 'auth.login', 'user', 'Đăng nhập chủ shop'),
  L(6, 10, 'owner', 'member.role_changed', 'member', 'Đổi vai trò nhân viên thứ nhất: Staff'),
  L(6, 11, 'owner', 'lead.stage_changed', 'lead', 'Chuyển khách sang "Đã liên hệ"'),
  L(5, 9, 'ai', 'ai.draft_created', 'comment', 'AI soạn bản nháp hỏi lại size'),
  L(5, 9, 'staff2', 'comment.reply_requested', 'comment', 'Duyệt và gửi bản nháp'),
  L(5, 14, 'staff', 'comment.hide_cancelled', 'comment', 'Hủy yêu cầu ẩn bình luận'),
  L(4, 8, 'system', 'channel.webhook_silent', 'channel', 'Kênh Instagram 6 giờ chưa có sự kiện'),
  L(4, 9, 'owner', 'channel.reconnected', 'channel', 'Kết nối lại Instagram'),
  L(4, 10, 'owner', 'spam_rule.created', 'rule', 'Tạo quy tắc chặn liên kết lạ'),
  L(3, 9, 'staff', 'comment.reply_requested', 'comment', 'Gửi trả lời khen sản phẩm'),
  L(3, 11, 'owner', 'invoice.created', 'invoice', 'Tạo hóa đơn gói Starter'),
  L(3, 12, 'owner', 'invoice.paid', 'invoice', 'Hóa đơn gói Starter đã thanh toán'),
  L(2, 8, 'staff2', 'auth.login', 'user', 'Đăng nhập nhân viên'),
  L(2, 9, 'staff2', 'conversation.assigned', 'conversation', 'Nhận xử lý hội thoại'),
  L(2, 10, 'staff', 'comment.hide_requested', 'comment', 'Yêu cầu ẩn bình luận quảng cáo'),
  L(2, 10, 'system', 'comment.hidden', 'comment', 'Đã ẩn bình luận quảng cáo'),
  L(1, 8, 'owner', 'kb.published', 'kb_version', 'Xuất bản kiến thức phiên bản 2'),
  L(1, 9, 'owner', 'post.note_created', 'post', 'Thêm ghi chú khuyến mãi cho bài'),
  L(1, 14, 'owner', 'member.role_changed', 'member', 'Đổi vai trò nhân viên thứ hai: Staff'),
  L(0, 8, 'owner', 'auth.login', 'user', 'Đăng nhập chủ shop'),
  L(0, 8, 'ai', 'ai.draft_created', 'comment', 'AI soạn bản nháp trả lời giá'),
];

// ───────── (7) Tin nhắn / hội thoại ─────────

export type DemoTurn = { by: 'c' | 'a' | 's'; text: string; tag?: 'HUMAN_AGENT' };
export type DemoConversationSpec = {
  key: number;
  channelKey: 'fb' | 'ig' | 'tt';
  customer: string;
  /** Phút kể từ tin KHÁCH cuối cùng tới bây giờ — quyết định cửa sổ 24 giờ. */
  lastCustomerMinutesAgo: number;
  turns: readonly DemoTurn[];
  status: 'open' | 'resolved';
  assignee: 'staff' | 'staff2' | null;
  aiEnabled: boolean;
};

const c = (text: string): DemoTurn => ({ by: 'c', text });
const a = (text: string): DemoTurn => ({ by: 'a', text });
const s = (text: string, tag?: 'HUMAN_AGENT'): DemoTurn => ({
  by: 's',
  text,
  ...(tag ? { tag } : {}),
});

export const DEMO_CONVERSATIONS: readonly DemoConversationSpec[] = [
  // còn < 2 giờ của cửa sổ 24 giờ (khách nhắn ~22,5–23,5 giờ trước)
  {
    key: 1,
    channelKey: 'fb',
    customer: `${T} Khách M01`,
    lastCustomerMinutesAgo: 1350,
    status: 'open',
    assignee: null,
    aiEnabled: true,
    turns: [
      c('Shop ơi áo thun còn size L không?'),
      a('Dạ size L màu trắng còn hàng ạ, giá 199.000đ. Bạn muốn lấy màu nào ạ?'),
      c('Cho mình màu trắng nhé, ship về Bình Thạnh được không?'),
    ],
  },
  {
    key: 2,
    channelKey: 'ig',
    customer: `${T} Khách M02`,
    lastCustomerMinutesAgo: 1405,
    status: 'open',
    assignee: 'staff',
    aiEnabled: false,
    turns: [
      c('Váy hoa nhí còn size S không ạ?'),
      s('Dạ còn 3 chiếc size S ạ, bạn cần giữ hàng không?'),
      c('Giữ giúp mình 1 cái nha'),
    ],
  },
  {
    key: 3,
    channelKey: 'tt',
    customer: `${T} Khách M03`,
    lastCustomerMinutesAgo: 1380,
    status: 'open',
    assignee: null,
    aiEnabled: true,
    turns: [c('Set đồ thể thao mặc có nóng không shop?')],
  },
  // còn nhiều
  {
    key: 4,
    channelKey: 'fb',
    customer: `${T} Khách M04`,
    lastCustomerMinutesAgo: 20,
    status: 'open',
    assignee: 'staff2',
    aiEnabled: true,
    turns: [
      c('Quần jean size 32 màu xanh đậm còn không?'),
      a('Dạ size 32 xanh đậm hiện hết hàng ạ. Bạn tham khảo size 30 xanh nhạt, còn hàng nhé!'),
      c('Mình cao 1m75 mặc 30 có chật không?'),
    ],
  },
  {
    key: 5,
    channelKey: 'ig',
    customer: `${T} Khách M05`,
    lastCustomerMinutesAgo: 75,
    status: 'open',
    assignee: null,
    aiEnabled: true,
    turns: [
      c('Mũ lưỡi trai giá bao nhiêu?'),
      a('Dạ mũ lưỡi trai giá 149.000đ ạ, có màu đen và kem.'),
    ],
  },
  {
    key: 6,
    channelKey: 'fb',
    customer: `${T} Khách M06`,
    lastCustomerMinutesAgo: 240,
    status: 'open',
    assignee: 'staff',
    aiEnabled: false,
    turns: [
      c('Đơn hôm qua của mình giao chưa shop?'),
      s('Dạ bạn cho shop xin tên người nhận để kiểm tra đơn nhé.'),
      c('Tên Lan ạ'),
    ],
  },
  {
    key: 7,
    channelKey: 'tt',
    customer: `${T} Khách M07`,
    lastCustomerMinutesAgo: 480,
    status: 'open',
    assignee: null,
    aiEnabled: true,
    turns: [
      c('Sneaker trắng size 40 còn không?'),
      a('Dạ size 40 còn 2 đôi, giá 590.000đ ạ.'),
      c('Okie mình lấy 1 đôi'),
    ],
  },
  {
    key: 8,
    channelKey: 'fb',
    customer: `${T} Khách M08`,
    lastCustomerMinutesAgo: 600,
    status: 'resolved',
    assignee: 'staff2',
    aiEnabled: true,
    turns: [
      c('Cảm ơn shop, mình nhận được hàng rồi, đẹp lắm'),
      s('Dạ cảm ơn bạn nhiều, hẹn bạn lần mua sau ạ!'),
    ],
  },
  // quá 24 giờ (còn trong 7 ngày: chỉ nhân viên trả lời được với thẻ HUMAN_AGENT)
  {
    key: 9,
    channelKey: 'ig',
    customer: `${T} Khách M09`,
    lastCustomerMinutesAgo: 1700,
    status: 'open',
    assignee: 'staff',
    aiEnabled: false,
    turns: [
      c('Túi tote có đựng vừa laptop 14 inch không?'),
      s('Dạ túi tote canvas đựng vừa laptop 13 inch, 14 inch hơi chật ạ.', 'HUMAN_AGENT'),
      c('Vậy mình xem balo nhé'),
    ],
  },
  {
    key: 10,
    channelKey: 'fb',
    customer: `${T} Khách M10`,
    lastCustomerMinutesAgo: 3200,
    status: 'open',
    assignee: null,
    aiEnabled: true,
    turns: [c('Shop ơi có áo khoác gió size L không?')],
  },
  {
    key: 11,
    channelKey: 'tt',
    customer: `${T} Khách M11`,
    lastCustomerMinutesAgo: 5800,
    status: 'open',
    assignee: 'staff2',
    aiEnabled: false,
    turns: [
      c('Mua sỉ 10 áo thun giá sao shop?'),
      s('Dạ bạn để lại thông tin, nhân viên báo giá sỉ cho bạn ạ.', 'HUMAN_AGENT'),
    ],
  },
  // quá 7 ngày (đóng hẳn)
  {
    key: 12,
    channelKey: 'fb',
    customer: `${T} Khách M12`,
    lastCustomerMinutesAgo: 12500,
    status: 'resolved',
    assignee: 'staff',
    aiEnabled: true,
    turns: [
      c('Mình muốn đổi size áo đã mua'),
      s('Dạ bạn gửi ảnh áo và mã đơn giúp shop nhé.'),
      c('Mình gửi rồi ạ'),
    ],
  },
  {
    key: 13,
    channelKey: 'ig',
    customer: `${T} Khách M13`,
    lastCustomerMinutesAgo: 14400,
    status: 'resolved',
    assignee: null,
    aiEnabled: true,
    turns: [
      c('Hello, do you ship abroad?'),
      a('Hi! Currently we only deliver within Vietnam. Thank you for asking.'),
    ],
  },
  {
    key: 14,
    channelKey: 'tt',
    customer: `${T} Khách M14`,
    lastCustomerMinutesAgo: 30,
    status: 'open',
    assignee: null,
    aiEnabled: true,
    turns: [
      c('Balo laptop có chống nước không ạ?'),
      a('Dạ balo laptop có lớp chống thấm nhẹ ạ, giá 549.000đ. Bạn cần thêm thông tin gì không?'),
      c('Có freeship không shop?'),
    ],
  },
];

// ───────── (8) Dữ liệu báo cáo (bình luận rải 28 ngày) ─────────

export type ReportRowSpec = {
  externalId: string;
  postKey: string;
  text: string;
  label: 'price' | 'size' | 'stock' | 'purchase' | 'praise' | 'other';
  minutesAgo: number;
  /** null = chưa trả lời. */
  reply: { by: 'staff' | 'staff2' | 'ai'; afterMinutes: number } | null;
  status: 'replied' | 'auto_replied' | 'skipped' | 'new' | 'pending_review';
};

const REPORT_TEXTS: Record<ReportRowSpec['label'], readonly string[]> = {
  price: [
    'Giá sao shop ơi?',
    'Cho mình xin giá với ạ',
    'Bao nhiêu vậy bạn?',
    'Mẫu này giá nhiêu thế shop',
  ],
  size: [
    'Mình 1m60 nặng 52kg mặc size gì ạ?',
    'Size M có vừa không shop?',
    'Cho mình hỏi bảng size với',
  ],
  stock: ['Còn hàng không shop ơi?', 'Màu đen còn không ạ?', 'Size L còn không bạn?'],
  purchase: ['Mình chốt đơn nhé', 'Lấy cho mình 1 cái ạ', 'Cho mình đặt 2 cái nha'],
  praise: ['Đẹp quá shop ơi', 'Mình mua rồi, rất ưng ý', 'Vải mát lắm, sẽ ủng hộ tiếp'],
  other: ['Shop ở đâu vậy ạ?', 'Mấy giờ shop mở cửa?', 'Có ship tỉnh không shop?'],
};

/** Bộ sinh số giả ngẫu nhiên xác định (mulberry32): cùng hạt → cùng dữ liệu, để test khẳng định được. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Giờ cao điểm: trưa (11–13h) và tối (19–22h). */
const HOUR_WEIGHTS: ReadonlyArray<[number, number]> = [
  [8, 2],
  [9, 3],
  [10, 4],
  [11, 7],
  [12, 8],
  [13, 6],
  [14, 3],
  [15, 3],
  [16, 3],
  [17, 4],
  [18, 5],
  [19, 8],
  [20, 10],
  [21, 9],
  [22, 4],
];

function pickWeighted(rand: () => number, items: ReadonlyArray<[number, number]>): number {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let x = rand() * total;
  for (const [value, weight] of items) {
    x -= weight;
    if (x < 0) return value;
  }
  return items[items.length - 1]?.[0] ?? 0;
}

const REPORT_DAYS = 28;
const REPORT_PER_DAY = 7;

/** ~196 bình luận: ~62% trả lời dưới 15 phút, phần còn lại 15–600 phút, ~12% chưa trả lời; AI tự gửi ~20%. */
export function buildReportRows(now: Date, postKeys: readonly string[]): ReportRowSpec[] {
  const rand = mulberry32(20261106);
  const labels = Object.keys(REPORT_TEXTS) as ReportRowSpec['label'][];
  const rows: ReportRowSpec[] = [];
  let n = 0;
  for (let day = 0; day < REPORT_DAYS; day += 1) {
    for (let i = 0; i < REPORT_PER_DAY; i += 1) {
      n += 1;
      const hour = pickWeighted(rand, HOUR_WEIGHTS);
      const minute = Math.floor(rand() * 60);
      const sinceMidnight = hour * 60 + minute;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      // Ngày hôm nay: chỉ lấy giờ đã qua.
      let minutesAgo = day * 1440 + (nowMinutes - sinceMidnight);
      if (minutesAgo < 5) minutesAgo = 5 + Math.floor(rand() * 600);
      const label = labels[Math.floor(rand() * labels.length)] as ReportRowSpec['label'];
      const pool = REPORT_TEXTS[label];
      const text = pool[Math.floor(rand() * pool.length)] as string;
      const postKey = postKeys[Math.floor(rand() * postKeys.length)] as string;
      const roll = rand();
      const base = {
        externalId: `demo_rpt_${String(n).padStart(3, '0')}`,
        postKey,
        text,
        label,
        minutesAgo,
      };
      if (roll < 0.12) {
        // chưa trả lời: bình luận mới nhất còn chờ duyệt, bình luận cũ bị bỏ qua
        rows.push({
          ...base,
          reply: null,
          status: minutesAgo < 2880 ? 'pending_review' : 'skipped',
        });
        continue;
      }
      const by: 'staff' | 'staff2' | 'ai' = roll < 0.4 ? 'staff' : roll < 0.8 ? 'staff2' : 'ai';
      const speed = rand();
      // staff2 nhanh hơn staff một chút để báo cáo theo nhân viên có khác biệt
      const fast = by === 'staff2' ? 0.7 : by === 'ai' ? 0.9 : 0.55;
      const afterMinutes =
        speed < fast
          ? 1 + Math.floor(rand() * 13)
          : speed < fast + (1 - fast) * 0.7
            ? 16 + Math.floor(rand() * 44)
            : 61 + Math.floor(rand() * 540);
      rows.push({
        ...base,
        // Đã trả lời xong trước thời điểm hiện tại
        reply: { by, afterMinutes: Math.min(afterMinutes, Math.max(minutesAgo - 1, 1)) },
        status: by === 'ai' ? 'auto_replied' : 'replied',
      });
    }
  }
  return rows;
}

// ───────── (9) Gói, hạn mức, hóa đơn ─────────

export const DEMO_BILLING = {
  product: 'commentflow',
  planCode: 'starter',
  meter: 'ai_turns',
  /** 710 / 1.000 lượt của gói Starter = 71%. */
  usedTurns: 710,
  limitTurns: 1000,
  invoices: [
    // Hạn thanh toán phải ở tương lai (core.create_invoice từ chối hạn đã qua).
    { description: `${T} Gói Starter — kỳ trước`, amountVnd: 299000, paid: true, dueInDays: 3 },
    { description: `${T} Gói Starter — kỳ này`, amountVnd: 299000, paid: true, dueInDays: 7 },
    { description: `${T} Mua thêm 1.000 lượt AI`, amountVnd: 149000, paid: false, dueInDays: 5 },
  ],
} as const;

/** Dòng `ai_usage` rải 14 ngày, thêm vào 36 dòng gần đây của bản v1. */
export const DEMO_AI_USAGE_EXTRA_ROWS = 140;

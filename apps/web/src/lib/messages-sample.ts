import type {
  ConversationView,
  CustomerView,
  MessageTabKey,
  ThreadView,
  TriageStats,
} from '../components/messages/message-center';

/**
 * Dữ liệu MẪU cho trang Tin nhắn (chép từ `design/stitch/messages.html`), chỉ dùng ở `/dev/ui/messages`
 * (UI-first 06/11/2026). Mọi tên/số/nội dung gắn "[MẪU]"; không phải khách hay số liệu thật, không đưa vào test.
 */
export const MESSAGES_NOW = new Date('2026-11-06T10:30:00Z');
const H = 3_600_000;
const hoursAgo = (h: number) => new Date(MESSAGES_NOW.getTime() - h * H);

export const MESSAGES_TAB_COUNTS: Record<MessageTabKey, number> = {
  nearDeadline: 3,
  pending: 8,
  needsHuman: 4,
  aiReplying: 14,
  willAutoSend: 2,
  sendFailed: 0,
  done: 320,
  all: 351,
};

export const MESSAGES_STATS: TriageStats = {
  nearDeadline: 3,
  onTimeRate: '[MẪU] 99,4%',
  avgHandle: '[MẪU] 1m 12s',
  automationPct: 82,
  autoRepliesToday: 38,
};

export const MESSAGES_INTENTS = [
  '[MẪU] Tư vấn chọn size',
  '[MẪU] Hỏi báo giá',
  '[MẪU] Khiếu nại giao hàng',
  '[MẪU] Yêu cầu tư vấn viên',
];

export const MESSAGES_CONVERSATIONS: ConversationView[] = [
  {
    id: 'a',
    name: '[MẪU] Khách A',
    platform: 'facebook',
    preview: 'Dạ shop đã gửi bảng size váy hoa nhí cho...',
    previewBy: 'page',
    ago: '18 phút',
    lastCustomerMessageAt: hoursAgo(22.25),
    chip: null,
    fromComment: true,
    intent: '[MẪU] Tư vấn size',
  },
  {
    id: 'b',
    name: '[MẪU] Khách B',
    platform: 'instagram',
    preview: 'Cho mình gặp trực tiếp nhân viên tư vấn ạ',
    previewBy: 'customer',
    ago: '42 phút',
    lastCustomerMessageAt: hoursAgo(20.8),
    chip: 'needsHuman',
    fromComment: false,
    assignee: '[MẪU] An đang xử lý',
    urgentPreview: true,
  },
  {
    id: 'c',
    name: '[MẪU] Khách C',
    platform: 'tiktok',
    preview: 'Shop vừa kiểm tra đơn hàng mã MAU-992...',
    previewBy: 'ai',
    ago: '2 giờ trước',
    lastCustomerMessageAt: hoursAgo(8),
    chip: 'aiAuto',
    fromComment: false,
    intent: '[MẪU] Tra cứu đơn',
  },
  {
    id: 'd',
    name: '[MẪU] Khách D',
    platform: 'facebook',
    preview: 'Mẫu này nam mặc phối đôi có vừa không...',
    previewBy: 'customer',
    ago: '3 giờ trước',
    lastCustomerMessageAt: hoursAgo(3),
    chip: 'pending',
    fromComment: false,
  },
];

export const MESSAGES_THREAD: ThreadView = {
  dayLabel: '[MẪU] Hôm nay • 10:15 SA',
  quotedComment:
    '“[MẪU] Shop tư vấn size giúp mình nhé, mẫu váy hoa nhí be này cao 1m58 mặc đến đâu ạ?”',
  quotedPost: '[MẪU] Bài đăng: BST Nắng Hè • Bình luận lúc 10:14',
  messages: [
    {
      from: 'customer',
      text: '[MẪU] Mình cao 1m58 nặng 52kg thì mặc size M hay L vừa ạ? Mình sợ vòng 2 hơi chật.',
      time: '10:16 SA',
    },
    {
      from: 'ai',
      text: '[MẪU] Dạ chào chị! Với chiều cao 1m58 và cân nặng 52kg thì chị mặc size M là vừa vặn và tôn dáng nhất chị nhé. Chiều dài váy qua gối khoảng 5cm rất thanh lịch ạ!',
      time: '10:17 SA',
      meta: 'Đã gửi tự động qua Messenger',
      confidence: '[MẪU] —',
      source: '[MẪU] Bảng size & thông số váy hoa nhí',
    },
    {
      from: 'customer',
      text: '[MẪU] Vòng eo của size M là bao nhiêu cm vậy shop? Chất vải có co giãn không ạ?',
      time: '10:20 SA (18 phút trước)',
      urgent: true,
    },
  ],
  aiSuggestion:
    '“[MẪU] Dạ số đo vòng eo của size M là 68-72cm bạn nha! Phía sau lưng váy có may bo chun mềm co giãn nhẹ nên ngồi làm việc hay ăn no đều rất thoải mái ạ.”',
  aiSources: ['[MẪU] Bảng thông số kỹ thuật sản phẩm', '[MẪU] FAQ: Co giãn eo lưng'],
  pageName: '[MẪU] Cửa hàng mẫu',
  staffName: '[MẪU] Nhân viên',
};

export const MESSAGES_CUSTOMER: CustomerView = {
  name: '[MẪU] Khách A',
  platform: 'facebook',
  stage: '[MẪU] Khách hàng tiềm năng • Đang cân nhắc',
  interactions: '[MẪU] 2 bình luận',
  firstContact: '[MẪU] 3 ngày trước',
  channelName: 'Facebook Messenger',
  userId: '[MẪU] FB_000000',
  area: '[MẪU] Hà Nội',
  product: { name: '[MẪU] Váy hoa nhí', sku: 'MAU-01', price: '[MẪU] 000.000đ', stock: 12 },
  tags: ['[MẪU] Hỏi size', '[MẪU] Cần chốt nhanh'],
  note: '[MẪU] Ghi chú nội bộ mẫu: khách thích form thoải mái.',
  noteUpdatedBy: '[MẪU] Nhân viên (10:18)',
  pastComments: [
    {
      post: '[MẪU] Bài viết: BST Nắng Hè',
      time: '10:14 SA',
      text: '“[MẪU] Shop tư vấn size giúp mình nhé...”',
      note: 'Đã tự động chuyển thành hội thoại này',
      linked: true,
    },
    {
      post: '[MẪU] Bài viết: Váy Maxi Đi Biển',
      time: '3 ngày trước',
      text: '“[MẪU] Mẫu này có màu đen không shop?”',
      note: 'AI đã phản hồi tự động',
      linked: false,
    },
  ],
};

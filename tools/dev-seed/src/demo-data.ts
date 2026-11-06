// Dữ liệu MẪU cho DB dev (Q-UIF1). Mọi thực thể mang nhãn [MẪU]; KHÔNG có dữ liệu khách thật, SĐT/email thô, token.
// Giá trong bản nháp khớp biến thể bên dưới (nguyên tắc #4: số tiền trong câu AI phải có trong nguồn).

export const DEMO_TAG = '[MẪU]';
export const DEMO_WORKSPACE_NAME = `${DEMO_TAG} Demo Shop`;

export type DemoChannel = {
  key: string;
  platform: 'facebook' | 'instagram' | 'tiktok';
  externalId: string;
  name: string;
};

export const DEMO_CHANNELS: readonly DemoChannel[] = [
  {
    key: 'fb',
    platform: 'facebook',
    externalId: 'demo_fb_page_1',
    name: `${DEMO_TAG} Fanpage Demo Shop`,
  },
  {
    key: 'ig',
    platform: 'instagram',
    externalId: 'demo_ig_account_1',
    name: `${DEMO_TAG} Instagram Demo Shop`,
  },
  {
    key: 'tt',
    platform: 'tiktok',
    externalId: 'demo_tt_account_1',
    name: `${DEMO_TAG} TikTok Demo Shop`,
  },
];

export type DemoPost = {
  key: string;
  channelKey: string;
  externalId: string;
  message: string;
  isAd: boolean;
  hoursAgo: number;
  productKey: string | null;
};

export const DEMO_POSTS: readonly DemoPost[] = [
  {
    key: 'p1',
    channelKey: 'fb',
    externalId: 'demo_post_1',
    message: `${DEMO_TAG} Áo thun basic cotton — mới về, 3 màu, size M-XL`,
    isAd: false,
    hoursAgo: 30,
    productKey: 'ao',
  },
  {
    key: 'p2',
    channelKey: 'fb',
    externalId: 'demo_post_2',
    message: `${DEMO_TAG} Váy hoa nhí mùa hè — số lượng có hạn`,
    isAd: true,
    hoursAgo: 52,
    productKey: 'vay',
  },
  {
    key: 'p3',
    channelKey: 'ig',
    externalId: 'demo_post_3',
    message: `${DEMO_TAG} Sneaker trắng đế êm — freeship đơn từ 500k`,
    isAd: false,
    hoursAgo: 20,
    productKey: 'giay',
  },
  {
    key: 'p4',
    channelKey: 'ig',
    externalId: 'demo_post_4',
    message: `${DEMO_TAG} Túi tote canvas — phối đồ đi học, đi làm`,
    isAd: false,
    hoursAgo: 75,
    productKey: 'tui',
  },
  {
    key: 'p5',
    channelKey: 'fb',
    externalId: 'demo_post_5',
    message: `${DEMO_TAG} Quần jean ống suông — form đẹp, tôn dáng, size 28-32`,
    isAd: false,
    hoursAgo: 100,
    productKey: 'quan',
  },
  {
    key: 'p6',
    channelKey: 'fb',
    externalId: 'demo_post_6',
    message: `${DEMO_TAG} Áo sơ mi linen mát nhẹ — ưu đãi tuần này`,
    isAd: true,
    hoursAgo: 140,
    productKey: 'somi',
  },
  {
    key: 'p7',
    channelKey: 'ig',
    externalId: 'demo_post_7',
    message: `${DEMO_TAG} Áo khoác gió chống nắng — nhẹ như không`,
    isAd: false,
    hoursAgo: 190,
    productKey: 'khoac',
  },
  {
    key: 'p8',
    channelKey: 'tt',
    externalId: 'demo_post_8',
    message: `${DEMO_TAG} Review set đồ thể thao co giãn 4 chiều`,
    isAd: false,
    hoursAgo: 60,
    productKey: 'setdo',
  },
  {
    key: 'p9',
    channelKey: 'tt',
    externalId: 'demo_post_9',
    message: `${DEMO_TAG} Unbox sneaker trắng — đi êm cả ngày`,
    isAd: false,
    hoursAgo: 90,
    productKey: 'giay',
  },
  {
    key: 'p10',
    channelKey: 'fb',
    externalId: 'demo_post_10',
    message: `${DEMO_TAG} Combo mũ lưỡi trai + balo laptop đi học, đi làm`,
    isAd: false,
    hoursAgo: 240,
    productKey: 'balo',
  },
];

export type DemoVariant = {
  sku: string;
  attrs: Record<string, string>;
  priceVnd: number;
  stock: number;
};
export type DemoProduct = {
  key: string;
  sku: string;
  name: string;
  category: string;
  variants: readonly DemoVariant[];
};

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    key: 'ao',
    sku: 'MAU-AO-01',
    name: `${DEMO_TAG} Áo thun basic cotton`,
    category: 'Áo',
    variants: [
      {
        sku: 'MAU-AO-01-M-TRANG',
        attrs: { size: 'M', color: 'Trắng' },
        priceVnd: 199000,
        stock: 14,
      },
      {
        sku: 'MAU-AO-01-L-TRANG',
        attrs: { size: 'L', color: 'Trắng' },
        priceVnd: 199000,
        stock: 9,
      },
      { sku: 'MAU-AO-01-L-DEN', attrs: { size: 'L', color: 'Đen' }, priceVnd: 199000, stock: 0 },
      { sku: 'MAU-AO-01-XL-DEN', attrs: { size: 'XL', color: 'Đen' }, priceVnd: 219000, stock: 5 },
    ],
  },
  {
    key: 'vay',
    sku: 'MAU-VAY-01',
    name: `${DEMO_TAG} Váy hoa nhí`,
    category: 'Váy',
    variants: [
      { sku: 'MAU-VAY-01-S', attrs: { size: 'S', color: 'Hoa nhí' }, priceVnd: 359000, stock: 3 },
      { sku: 'MAU-VAY-01-M', attrs: { size: 'M', color: 'Hoa nhí' }, priceVnd: 359000, stock: 0 },
    ],
  },
  {
    key: 'giay',
    sku: 'MAU-GIAY-01',
    name: `${DEMO_TAG} Sneaker trắng`,
    category: 'Giày',
    variants: [
      { sku: 'MAU-GIAY-01-38', attrs: { size: '38', color: 'Trắng' }, priceVnd: 590000, stock: 6 },
      { sku: 'MAU-GIAY-01-40', attrs: { size: '40', color: 'Trắng' }, priceVnd: 590000, stock: 2 },
    ],
  },
  {
    key: 'tui',
    sku: 'MAU-TUI-01',
    name: `${DEMO_TAG} Túi tote canvas`,
    category: 'Phụ kiện',
    variants: [{ sku: 'MAU-TUI-01-KEM', attrs: { color: 'Kem' }, priceVnd: 249000, stock: 20 }],
  },
  {
    key: 'quan',
    sku: 'MAU-QUAN-01',
    name: `${DEMO_TAG} Quần jean ống suông`,
    category: 'Quần',
    variants: [
      {
        sku: 'MAU-QUAN-01-28',
        attrs: { size: '28', color: 'Xanh nhạt' },
        priceVnd: 429000,
        stock: 8,
      },
      {
        sku: 'MAU-QUAN-01-30',
        attrs: { size: '30', color: 'Xanh nhạt' },
        priceVnd: 429000,
        stock: 11,
      },
      {
        sku: 'MAU-QUAN-01-32',
        attrs: { size: '32', color: 'Xanh đậm' },
        priceVnd: 449000,
        stock: 0,
      },
    ],
  },
  {
    key: 'somi',
    sku: 'MAU-SOMI-01',
    name: `${DEMO_TAG} Áo sơ mi linen`,
    category: 'Áo',
    variants: [
      { sku: 'MAU-SOMI-01-S-BE', attrs: { size: 'S', color: 'Be' }, priceVnd: 329000, stock: 7 },
      { sku: 'MAU-SOMI-01-M-BE', attrs: { size: 'M', color: 'Be' }, priceVnd: 329000, stock: 12 },
      {
        sku: 'MAU-SOMI-01-M-TRANG',
        attrs: { size: 'M', color: 'Trắng' },
        priceVnd: 329000,
        stock: 4,
      },
    ],
  },
  {
    key: 'khoac',
    sku: 'MAU-KHOAC-01',
    name: `${DEMO_TAG} Áo khoác gió`,
    category: 'Áo khoác',
    variants: [
      { sku: 'MAU-KHOAC-01-M', attrs: { size: 'M', color: 'Xám' }, priceVnd: 459000, stock: 6 },
      { sku: 'MAU-KHOAC-01-L', attrs: { size: 'L', color: 'Xám' }, priceVnd: 459000, stock: 3 },
    ],
  },
  {
    key: 'chanvay',
    sku: 'MAU-CHANVAY-01',
    name: `${DEMO_TAG} Chân váy xếp ly`,
    category: 'Váy',
    variants: [
      { sku: 'MAU-CHANVAY-01-S', attrs: { size: 'S', color: 'Đen' }, priceVnd: 289000, stock: 9 },
      { sku: 'MAU-CHANVAY-01-M', attrs: { size: 'M', color: 'Đen' }, priceVnd: 289000, stock: 5 },
    ],
  },
  {
    key: 'non',
    sku: 'MAU-NON-01',
    name: `${DEMO_TAG} Mũ lưỡi trai`,
    category: 'Phụ kiện',
    variants: [
      { sku: 'MAU-NON-01-DEN', attrs: { color: 'Đen' }, priceVnd: 149000, stock: 25 },
      { sku: 'MAU-NON-01-KEM', attrs: { color: 'Kem' }, priceVnd: 149000, stock: 18 },
    ],
  },
  {
    key: 'dep',
    sku: 'MAU-DEP-01',
    name: `${DEMO_TAG} Dép quai ngang`,
    category: 'Giày',
    variants: [
      { sku: 'MAU-DEP-01-38', attrs: { size: '38', color: 'Be' }, priceVnd: 239000, stock: 10 },
      { sku: 'MAU-DEP-01-40', attrs: { size: '40', color: 'Be' }, priceVnd: 239000, stock: 7 },
    ],
  },
  {
    key: 'balo',
    sku: 'MAU-BALO-01',
    name: `${DEMO_TAG} Balo laptop`,
    category: 'Phụ kiện',
    variants: [{ sku: 'MAU-BALO-01-XAM', attrs: { color: 'Xám' }, priceVnd: 549000, stock: 13 }],
  },
  {
    key: 'setdo',
    sku: 'MAU-SETDO-01',
    name: `${DEMO_TAG} Set đồ thể thao`,
    category: 'Thể thao',
    variants: [
      { sku: 'MAU-SETDO-01-M', attrs: { size: 'M', color: 'Đen' }, priceVnd: 399000, stock: 15 },
      { sku: 'MAU-SETDO-01-L', attrs: { size: 'L', color: 'Đen' }, priceVnd: 399000, stock: 1 },
    ],
  },
];

export type DemoDraft = {
  text: string;
  confidence: number;
  action: 'answer' | 'clarify' | 'redirect' | 'handoff';
  needsHuman?: boolean;
  reason?: string;
  /** Mã sản phẩm (key) có giá được nhắc trong câu — để dựng ảnh chụp giá. */
  priceOf?: string;
};

export type DemoComment = {
  externalId: string;
  postKey: string;
  authorName: string;
  text: string;
  lang: 'vi' | 'en';
  label:
    | 'price'
    | 'size'
    | 'stock'
    | 'complaint'
    | 'phone'
    | 'spam'
    | 'praise'
    | 'purchase'
    | 'other';
  labelConfidence: number;
  status: 'new' | 'pending_review' | 'needs_human' | 'spam_suspected' | 'replied' | 'skipped';
  minutesAgo: number;
  draft?: DemoDraft;
};

type Seed = Omit<DemoComment, 'externalId' | 'authorName'>;
const make = (n: number, who: string, s: Seed): DemoComment => ({
  externalId: `demo_cmt_${String(n).padStart(2, '0')}`,
  authorName: `${DEMO_TAG} ${who}`,
  ...s,
});

const price = (text: string, confidence: number, priceOf: string): DemoDraft => ({
  text,
  confidence,
  action: 'answer',
  priceOf,
});

export const DEMO_COMMENTS: readonly DemoComment[] = [
  make(1, 'Khách 01', {
    postKey: 'p1',
    text: 'Áo này giá bao nhiêu vậy shop?',
    lang: 'vi',
    label: 'price',
    labelConfidence: 0.96,
    status: 'pending_review',
    minutesAgo: 12,
    draft: price(
      'Dạ áo thun basic bên mình giá 199.000đ ạ, bạn cần size nào để shop kiểm tra giúp nhé!',
      0.93,
      'ao',
    ),
  }),
  make(2, 'Khách 02', {
    postKey: 'p1',
    text: 'có size L màu đen k shop',
    lang: 'vi',
    label: 'stock',
    labelConfidence: 0.9,
    status: 'pending_review',
    minutesAgo: 18,
    draft: {
      text: 'Dạ size L màu đen hiện đã hết hàng ạ. Bạn tham khảo size L màu trắng, còn hàng nhé!',
      confidence: 0.88,
      action: 'answer',
    },
  }),
  make(3, 'Khách 03', {
    postKey: 'p1',
    text: 'Mình 1m65 nặng 58kg mặc size gì ạ?',
    lang: 'vi',
    label: 'size',
    labelConfidence: 0.92,
    status: 'pending_review',
    minutesAgo: 25,
    draft: {
      text: 'Dạ với 1m65 và 58kg, bạn mặc size M hoặc L tuỳ ý thích mặc rộng hay vừa ạ.',
      confidence: 0.81,
      action: 'answer',
    },
  }),
  make(4, 'Khách 04', {
    postKey: 'p1',
    text: 'How much is this shirt?',
    lang: 'en',
    label: 'price',
    labelConfidence: 0.95,
    status: 'pending_review',
    minutesAgo: 31,
    draft: {
      text: 'Hi! The basic cotton tee is 199.000đ. Which size would you like?',
      confidence: 0.9,
      action: 'answer',
      priceOf: 'ao',
    },
  }),
  make(5, 'Khách 05', {
    postKey: 'p1',
    text: 'Shop ơi inbox mình SĐT 09******21 nhé',
    lang: 'vi',
    label: 'phone',
    labelConfidence: 0.97,
    status: 'needs_human',
    minutesAgo: 40,
    draft: {
      text: 'Dạ shop đã nhận thông tin, nhân viên sẽ liên hệ bạn sớm ạ.',
      confidence: 0.6,
      action: 'handoff',
      needsHuman: true,
      reason: 'Khách để lại số điện thoại',
    },
  }),
  make(6, 'Khách 06', {
    postKey: 'p1',
    text: 'Áo mặc lên rộng quá, giặt xong còn bị xù lông, thất vọng',
    lang: 'vi',
    label: 'complaint',
    labelConfidence: 0.94,
    status: 'needs_human',
    minutesAgo: 55,
    draft: {
      text: 'Shop rất tiếc về trải nghiệm này ạ, nhân viên sẽ liên hệ hỗ trợ bạn ngay.',
      confidence: 0.55,
      action: 'handoff',
      needsHuman: true,
      reason: 'Khiếu nại cần người xử lý',
    },
  }),
  make(7, 'Khách 07', {
    postKey: 'p1',
    text: 'Mua 2 cái được giảm không shop',
    lang: 'vi',
    label: 'purchase',
    labelConfidence: 0.78,
    status: 'pending_review',
    minutesAgo: 62,
    draft: {
      text: 'Dạ về ưu đãi mua nhiều, nhân viên sẽ xác nhận với bạn trực tiếp ạ.',
      confidence: 0.7,
      action: 'redirect',
    },
  }),
  make(8, 'Khách 08', {
    postKey: 'p1',
    text: 'Áo đẹp quá 😍',
    lang: 'vi',
    label: 'praise',
    labelConfidence: 0.9,
    status: 'skipped',
    minutesAgo: 70,
  }),
  make(9, 'Khách 09', {
    postKey: 'p1',
    text: 'Kiếm tiền online 500k/ngày, click link bio để nhận ngay!!!',
    lang: 'vi',
    label: 'spam',
    labelConfidence: 0.98,
    status: 'spam_suspected',
    minutesAgo: 80,
  }),
  make(10, 'Khách 10', {
    postKey: 'p1',
    text: 'Mình lấy 1 cái size M trắng nhé',
    lang: 'vi',
    label: 'purchase',
    labelConfidence: 0.85,
    status: 'replied',
    minutesAgo: 120,
  }),
  make(11, 'Khách 11', {
    postKey: 'p2',
    text: 'váy này nhiu tiền z shop',
    lang: 'vi',
    label: 'price',
    labelConfidence: 0.91,
    status: 'pending_review',
    minutesAgo: 9,
    draft: price(
      'Dạ váy hoa nhí giá 359.000đ ạ. Bạn cần size nào để shop báo tồn kho nhé!',
      0.92,
      'vay',
    ),
  }),
  make(12, 'Khách 12', {
    postKey: 'p2',
    text: 'Còn size M không ạ?',
    lang: 'vi',
    label: 'stock',
    labelConfidence: 0.93,
    status: 'pending_review',
    minutesAgo: 15,
    draft: {
      text: 'Dạ size M hiện đã hết, còn size S ạ. Bạn muốn shop giữ size S không?',
      confidence: 0.89,
      action: 'answer',
    },
  }),
  make(13, 'Khách 13', {
    postKey: 'p2',
    text: 'Do you ship to Da Nang? And is there a size chart?',
    lang: 'en',
    label: 'size',
    labelConfidence: 0.72,
    status: 'pending_review',
    minutesAgo: 22,
    draft: {
      text: 'Hi! Could you tell us your height and weight so we can suggest a size?',
      confidence: 0.64,
      action: 'clarify',
    },
  }),
  make(14, 'Khách 14', {
    postKey: 'p2',
    text: 'Đặt hôm qua mà chưa thấy giao, sao lâu vậy?',
    lang: 'vi',
    label: 'complaint',
    labelConfidence: 0.88,
    status: 'needs_human',
    minutesAgo: 33,
    draft: {
      text: 'Shop xin lỗi bạn, nhân viên sẽ kiểm tra đơn và phản hồi ngay ạ.',
      confidence: 0.5,
      action: 'handoff',
      needsHuman: true,
      reason: 'Hỏi tiến độ đơn hàng',
    },
  }),
  make(15, 'Khách 15', {
    postKey: 'p2',
    text: 'Cho mình xin số để gọi 09******77',
    lang: 'vi',
    label: 'phone',
    labelConfidence: 0.95,
    status: 'needs_human',
    minutesAgo: 47,
    draft: {
      text: 'Dạ nhân viên sẽ liên hệ bạn trong giờ làm việc ạ.',
      confidence: 0.58,
      action: 'handoff',
      needsHuman: true,
      reason: 'Khách để lại số điện thoại',
    },
  }),
  make(16, 'Khách 16', {
    postKey: 'p2',
    text: 'Free ship toàn quốc không bạn?',
    lang: 'vi',
    label: 'other',
    labelConfidence: 0.6,
    status: 'pending_review',
    minutesAgo: 58,
    draft: {
      text: 'Dạ chính sách vận chuyển nhân viên sẽ xác nhận cụ thể với bạn ạ.',
      confidence: 0.52,
      action: 'redirect',
    },
  }),
  make(17, 'Khách 17', {
    postKey: 'p2',
    text: 'Follow me for free followers!!! http://spam.example',
    lang: 'en',
    label: 'spam',
    labelConfidence: 0.99,
    status: 'spam_suspected',
    minutesAgo: 66,
  }),
  make(18, 'Khách 18', {
    postKey: 'p2',
    text: 'Váy xinh, mặc đi biển được luôn',
    lang: 'vi',
    label: 'praise',
    labelConfidence: 0.87,
    status: 'skipped',
    minutesAgo: 90,
  }),
  make(19, 'Khách 19', {
    postKey: 'p2',
    text: 'Mình cần size S, chốt giúp mình nhé',
    lang: 'vi',
    label: 'purchase',
    labelConfidence: 0.89,
    status: 'new',
    minutesAgo: 3,
  }),
  make(20, 'Khách 20', {
    postKey: 'p2',
    text: 'váy bị lỗi đường may, đòi hoàn tiền',
    lang: 'vi',
    label: 'complaint',
    labelConfidence: 0.93,
    status: 'needs_human',
    minutesAgo: 140,
    draft: {
      text: 'Shop rất tiếc ạ, nhân viên sẽ liên hệ xử lý đổi trả cho bạn.',
      confidence: 0.45,
      action: 'handoff',
      needsHuman: true,
      reason: 'Khiếu nại/đổi trả',
    },
  }),
  make(21, 'Khách 21', {
    postKey: 'p3',
    text: 'Giày giá sao shop?',
    lang: 'vi',
    label: 'price',
    labelConfidence: 0.94,
    status: 'pending_review',
    minutesAgo: 6,
    draft: price(
      'Dạ sneaker trắng giá 590.000đ, freeship cho đơn từ 500k ạ. Bạn đi size mấy để shop kiểm tra tồn nhé?',
      0.91,
      'giay',
    ),
  }),
  make(22, 'Khách 22', {
    postKey: 'p3',
    text: 'size 40 còn không',
    lang: 'vi',
    label: 'stock',
    labelConfidence: 0.9,
    status: 'pending_review',
    minutesAgo: 11,
    draft: {
      text: 'Dạ size 40 còn 2 đôi ạ. Bạn muốn chốt không để shop giữ hàng?',
      confidence: 0.9,
      action: 'answer',
    },
  }),
  make(23, 'Khách 23', {
    postKey: 'p3',
    text: 'Chân mình 25cm đi size nào?',
    lang: 'vi',
    label: 'size',
    labelConfidence: 0.88,
    status: 'pending_review',
    minutesAgo: 17,
    draft: { text: 'Dạ chân 25cm bạn thường đi size 40 ạ.', confidence: 0.8, action: 'answer' },
  }),
  make(24, 'Khách 24', {
    postKey: 'p3',
    text: 'Is size 38 in stock?',
    lang: 'en',
    label: 'stock',
    labelConfidence: 0.92,
    status: 'pending_review',
    minutesAgo: 28,
    draft: {
      text: 'Hi! Yes, size 38 is in stock (6 pairs left).',
      confidence: 0.9,
      action: 'answer',
    },
  }),
  make(25, 'Khách 25', {
    postKey: 'p3',
    text: 'Giày đi 1 tuần đã bong đế, quá tệ',
    lang: 'vi',
    label: 'complaint',
    labelConfidence: 0.95,
    status: 'needs_human',
    minutesAgo: 36,
    draft: {
      text: 'Shop xin lỗi bạn, nhân viên sẽ liên hệ kiểm tra bảo hành ngay ạ.',
      confidence: 0.48,
      action: 'handoff',
      needsHuman: true,
      reason: 'Khiếu nại chất lượng',
    },
  }),
  make(26, 'Khách 26', {
    postKey: 'p3',
    text: 'Mình để lại SĐT 09******05 ạ',
    lang: 'vi',
    label: 'phone',
    labelConfidence: 0.96,
    status: 'needs_human',
    minutesAgo: 44,
    draft: {
      text: 'Dạ nhân viên sẽ liên hệ bạn sớm ạ.',
      confidence: 0.57,
      action: 'handoff',
      needsHuman: true,
      reason: 'Khách để lại số điện thoại',
    },
  }),
  make(27, 'Khách 27', {
    postKey: 'p3',
    text: 'Đẹp ghê 🔥🔥',
    lang: 'vi',
    label: 'praise',
    labelConfidence: 0.85,
    status: 'skipped',
    minutesAgo: 52,
  }),
  make(28, 'Khách 28', {
    postKey: 'p3',
    text: 'DM me to win iPhone!!! bit.ly/xxxxx',
    lang: 'en',
    label: 'spam',
    labelConfidence: 0.99,
    status: 'spam_suspected',
    minutesAgo: 61,
  }),
  make(29, 'Khách 29', {
    postKey: 'p3',
    text: 'Cho mình đặt 1 đôi 38 nhé',
    lang: 'vi',
    label: 'purchase',
    labelConfidence: 0.91,
    status: 'replied',
    minutesAgo: 200,
  }),
  make(30, 'Khách 30', {
    postKey: 'p3',
    text: 'bạn ơi có bảo hành không',
    lang: 'vi',
    label: 'other',
    labelConfidence: 0.7,
    status: 'new',
    minutesAgo: 2,
  }),
  make(31, 'Khách 31', {
    postKey: 'p4',
    text: 'Túi bao nhiêu tiền vậy shop',
    lang: 'vi',
    label: 'price',
    labelConfidence: 0.93,
    status: 'pending_review',
    minutesAgo: 14,
    draft: price('Dạ túi tote canvas giá 249.000đ ạ, hiện còn hàng nhé!', 0.94, 'tui'),
  }),
  make(32, 'Khách 32', {
    postKey: 'p4',
    text: 'Túi đựng vừa laptop 14 inch không?',
    lang: 'vi',
    label: 'size',
    labelConfidence: 0.7,
    status: 'pending_review',
    minutesAgo: 21,
    draft: {
      text: 'Dạ shop chưa có kích thước chính xác của túi, nhân viên sẽ xác nhận lại với bạn ạ.',
      confidence: 0.45,
      action: 'handoff',
      needsHuman: true,
      reason: 'Thiếu thông tin kích thước trong kiến thức',
    },
  }),
  make(33, 'Khách 33', {
    postKey: 'p4',
    text: 'Còn hàng màu kem không?',
    lang: 'vi',
    label: 'stock',
    labelConfidence: 0.91,
    status: 'pending_review',
    minutesAgo: 29,
    draft: { text: 'Dạ túi màu kem còn hàng ạ!', confidence: 0.92, action: 'answer' },
  }),
  make(34, 'Khách 34', {
    postKey: 'p4',
    text: 'Price? and do you ship abroad?',
    lang: 'en',
    label: 'price',
    labelConfidence: 0.85,
    status: 'pending_review',
    minutesAgo: 38,
    draft: {
      text: 'Hi! The tote bag is 249.000đ. For international shipping, our team will confirm shortly.',
      confidence: 0.7,
      action: 'answer',
      priceOf: 'tui',
    },
  }),
  make(35, 'Khách 35', {
    postKey: 'p4',
    text: 'Túi bị sút quai sau 2 ngày, shop xử lý sao?',
    lang: 'vi',
    label: 'complaint',
    labelConfidence: 0.94,
    status: 'needs_human',
    minutesAgo: 49,
    draft: {
      text: 'Shop xin lỗi bạn, nhân viên sẽ liên hệ đổi/sửa giúp bạn ạ.',
      confidence: 0.5,
      action: 'handoff',
      needsHuman: true,
      reason: 'Khiếu nại chất lượng',
    },
  }),
  make(36, 'Khách 36', {
    postKey: 'p4',
    text: 'Cần gấp, liên hệ giúp mình 09******63',
    lang: 'vi',
    label: 'phone',
    labelConfidence: 0.95,
    status: 'needs_human',
    minutesAgo: 57,
    draft: {
      text: 'Dạ nhân viên sẽ liên hệ bạn ngay khi có thể ạ.',
      confidence: 0.55,
      action: 'handoff',
      needsHuman: true,
      reason: 'Khách để lại số điện thoại',
    },
  }),
  make(37, 'Khách 37', {
    postKey: 'p4',
    text: 'Cute bag!',
    lang: 'en',
    label: 'praise',
    labelConfidence: 0.88,
    status: 'skipped',
    minutesAgo: 73,
  }),
  make(38, 'Khách 38', {
    postKey: 'p4',
    text: 'Vay tiền nhanh lãi thấp, nhắn tin ngay',
    lang: 'vi',
    label: 'spam',
    labelConfidence: 0.97,
    status: 'spam_suspected',
    minutesAgo: 85,
  }),
  make(39, 'Khách 39', {
    postKey: 'p4',
    text: 'Lấy giúp mình 2 cái nhé',
    lang: 'vi',
    label: 'purchase',
    labelConfidence: 0.86,
    status: 'new',
    minutesAgo: 5,
  }),
  make(40, 'Khách 40', {
    postKey: 'p4',
    text: 'ok',
    lang: 'vi',
    label: 'other',
    labelConfidence: 0.4,
    status: 'skipped',
    minutesAgo: 95,
  }),
  make(41, 'Khách 41', {
    postKey: 'p1',
    text: 'Is the white one see-through?',
    lang: 'en',
    label: 'other',
    labelConfidence: 0.62,
    status: 'new',
    minutesAgo: 1,
  }),
  make(42, 'Khách 42', {
    postKey: 'p2',
    text: 'váy này ship COD được không shop',
    lang: 'vi',
    label: 'other',
    labelConfidence: 0.66,
    status: 'new',
    minutesAgo: 4,
  }),
];

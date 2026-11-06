import Link from 'next/link';
import { Icon, type IconName } from '../ui/icon';
import { Meter } from '../ui/tw-parts';
import { SectionHead } from './pub-parts';

/** Các khối giữa trang Landing (design/stitch/landing-pricing.html). Giá, hạn mức, số liệu: [MẪU], không phải cam kết thật. */

const CARD = 'bg-surface-container-lowest rounded-xl shadow-sm';

const BENEFITS: readonly {
  icon: IconName;
  iconBox: string;
  title: string;
  body: string;
}[] = [
  {
    icon: 'shield_person',
    iconBox: 'bg-error-container text-on-error-container',
    title: 'Chống cướp khách',
    body: 'Quy tắc quét bình luận chứa SĐT, mã vận đơn hoặc link spam mạo danh và gắn cờ để nhân viên xử lý — AI không tự ẩn bình luận. Đồng thời gợi ý inbox tư vấn 1-1 và ghi vào danh sách khách tiềm năng.',
  },
  {
    icon: 'auto_stories',
    iconBox: 'bg-secondary-fixed text-on-secondary-fixed',
    title: 'Trả lời đúng ngữ cảnh của shop',
    body: 'Đồng bộ dữ liệu sản phẩm, kho hàng, link website hoặc file Excel bảng giá. AI chỉ nói những gì có trong nguồn, luôn trích dẫn nguồn tham chiếu.',
  },
  {
    icon: 'tune',
    iconBox: 'bg-primary-fixed text-on-primary-fixed',
    title: 'Kiểm soát linh hoạt - Bạn là người làm chủ',
    body: 'Chọn 3 cấp độ: Tắt (dừng hẳn) - Chạy thử (AI soạn, nhân viên duyệt) - Tự động. Có nút Dừng khẩn cấp (Emergency Stop) ngay trên màn hình.',
  },
];

const STEPS: readonly {
  code: string;
  codeTone: string;
  icon: IconName;
  iconTone: string;
  title: string;
  body: string;
  foot: string;
  footIcon: IconName;
  footTone: string;
}[] = [
  {
    code: 'BƯỚC 01',
    codeTone: 'bg-surface-container text-primary',
    icon: 'hub',
    iconTone: 'text-primary',
    title: 'Tiếp nhận đa kênh',
    body: 'Lắng nghe và thu nạp bình luận & tin nhắn Messenger, Instagram Direct theo thời gian thực qua Webhooks chính thức.',
    foot: 'Độ trễ trung bình: [MẪU] —',
    footIcon: 'speed',
    footTone: 'text-on-surface-variant',
  },
  {
    code: 'BƯỚC 02',
    codeTone: 'bg-secondary-fixed text-on-secondary-fixed',
    icon: 'psychology',
    iconTone: 'text-secondary',
    title: 'AI phân loại thông minh',
    body: 'Tự động nhận diện ý định khách hàng và gán nhãn: Hỏi giá, Tư vấn, Mua hàng, Khiếu nại, Spam, Khác, kèm độ tin cậy do hệ thống tính.',
    foot: '6 nhãn hành vi người mua',
    footIcon: 'label',
    footTone: 'text-secondary',
  },
  {
    code: 'BƯỚC 03',
    codeTone: 'bg-tertiary-fixed text-on-tertiary-fixed',
    icon: 'rule_folder',
    iconTone: 'text-tertiary',
    title: 'Soạn câu trả lời chuẩn xác',
    body: 'Truy vấn cơ sở kiến thức đối chiếu bài đăng, tồn kho thực tế và chính sách giao hàng của shop để viết câu phản hồi tự nhiên.',
    foot: 'Trích dẫn nguồn chính xác',
    footIcon: 'menu_book',
    footTone: 'text-tertiary',
  },
  {
    code: 'BƯỚC 04',
    codeTone: 'bg-primary-fixed text-on-primary-fixed',
    icon: 'send_and_archive',
    iconTone: 'text-primary',
    title: 'Tự gửi an toàn / Duyệt 1-chạm',
    body: 'Gửi tin qua API chính thức của Meta, tuân thủ cửa sổ 24 giờ nhắn tin, ghi nhật ký hoạt động để quản lý toàn diện.',
    foot: 'Chỉ dùng API chính thức',
    footIcon: 'verified_user',
    footTone: 'text-primary',
  },
];

type Feature = { text: string; strong?: string; on: boolean };

const PLANS: readonly {
  name: string;
  tag: string;
  tagTone: string;
  body: string;
  priceTone: string;
  note: string;
  noteTone: string;
  features: readonly Feature[];
  cta: string;
  featured?: boolean;
}[] = [
  {
    name: '[MẪU] STARTER',
    tag: 'Khởi nghiệp',
    tagTone: 'bg-surface-container text-on-surface',
    body: 'Dành cho shop mới mở, lượng bình luận vừa phải, cần kiểm duyệt kỹ lưỡng trước khi gửi.',
    priceTone: 'text-on-surface',
    note: '[MẪU] Giá và hạn mức thật lấy từ bảng gói',
    noteTone: 'text-primary',
    features: [
      { strong: '[MẪU] n Kênh kết nối', text: '(Fanpage Facebook)', on: true },
      { strong: '[MẪU] n lượt phản hồi AI', text: '/ tháng', on: true },
      { text: 'Gợi ý câu trả lời AI (Duyệt tay 1-chạm)', on: true },
      { text: 'Chống cướp khách cơ bản (Gắn cờ SĐT)', on: true },
      { text: 'Tự động gửi', on: false },
      { text: 'Đồng bộ Shopify & Web Crawler', on: false },
    ],
    cta: 'Chọn gói Starter',
  },
  {
    name: '[MẪU] GROWTH',
    tag: 'Tăng trưởng nhanh',
    tagTone: 'bg-secondary-fixed text-on-secondary-fixed font-semibold',
    body: 'Hoàn hảo cho shop đang chạy quảng cáo mạnh, cần hỗ trợ cả bình luận và tin nhắn.',
    priceTone: 'text-primary',
    note: '[MẪU] Dùng thử miễn phí',
    noteTone: 'text-secondary font-bold',
    features: [
      { strong: '[MẪU] n Kênh kết nối', text: '(FB, Instagram)', on: true },
      { strong: '[MẪU] n lượt phản hồi AI', text: '/ tháng', on: true },
      { strong: 'Tự động gửi', text: 'bình luận & inbox khi Chủ shop bật', on: true },
      { text: 'Đồng bộ Shopify & Web Crawler dữ liệu', on: true },
      { text: 'Phân quyền Nhân viên che SĐT chống tuồn khách', on: true },
      { text: 'Hỗ trợ nút Dừng khẩn cấp Emergency Stop', on: true },
    ],
    cta: 'Dùng thử miễn phí',
    featured: true,
  },
  {
    name: '[MẪU] BUSINESS',
    tag: 'Doanh nghiệp / Agency',
    tagTone: 'bg-surface-container text-on-surface',
    body: 'Giải pháp chuyên sâu cho các nhãn hàng lớn và Agency vận hành nhiều nhãn hiệu song song.',
    priceTone: 'text-on-surface',
    note: 'Quản trị đa Workspace',
    noteTone: 'text-primary',
    features: [
      { strong: '[MẪU] n Kênh kết nối', text: 'đa nền tảng', on: true },
      { strong: '[MẪU] n lượt phản hồi AI', text: '/ tháng', on: true },
      { text: 'Đa Workspace riêng biệt cho từng Brand khách hàng', on: true },
      { text: 'API Tùy chỉnh & Xuất Lead trực tiếp Webhook CRM', on: true },
      { text: 'Đội ngũ Kỹ sư AI đồng hành thiết lập 1-1 riêng biệt', on: true },
    ],
    cta: 'Chọn gói Business',
  },
];

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'AI có tự ý trả lời bậy bạ hoặc vi phạm chính sách làm mất Fanpage không?',
    a: 'AI chỉ soạn câu từ cơ sở kiến thức và dữ liệu sản phẩm của shop; việc tự gửi do hệ thống quyết định theo quy tắc bạn bật, mặc định luôn là duyệt tay. Nút Emergency Stop cho phép ngắt toàn bộ tự động chỉ với 1 cú click.',
  },
  {
    q: 'Dữ liệu khách hàng và sản phẩm của shop có bị chia sẻ cho đối thủ không?',
    a: '[MẪU] Nội dung chờ duyệt pháp lý.',
  },
  {
    q: 'Chính sách cửa sổ 24 giờ của Facebook Messenger hoạt động thế nào?',
    a: 'Theo quy định của Meta, Trang chỉ được gửi tin nhắn trực tiếp nếu khách hàng đã nhắn tin trong vòng 24 giờ qua. Hệ thống nhận biết trạng thái cửa sổ này; ngoài 24 giờ, tin sẽ chuyển cho nhân viên tiếp quản. [MẪU] Chi tiết chờ duyệt.',
  },
  {
    q: 'Hết hạn dùng thử có bị tự động trừ tiền không?',
    a: '[MẪU] Nội dung chờ duyệt (điều khoản thanh toán chưa chốt).',
  },
];

export function Benefits() {
  return (
    <section className="py-space-xl lg:py-24 bg-surface max-w-7xl mx-auto px-margin w-full">
      <SectionHead
        pill="Giá trị cốt lõi"
        title="3 Lợi ích vượt trội cho Shop & Agency"
        body="Không chỉ là chatbot trả lời sẵn theo mẫu khô khan. CommentFlow AI vận hành như một chuyên viên chăm sóc khách hàng giàu kinh nghiệm, bảo vệ doanh thu từng giây."
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
        {BENEFITS.map((b, i) => (
          <div
            key={b.title}
            className={`${CARD} p-space-xl hover:shadow-md transition-shadow flex flex-col justify-between`}
          >
            <div>
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-space-lg ${b.iconBox}`}
              >
                <Icon name={b.icon} size={26} />
              </div>
              <h3 className="font-title-md text-title-md text-on-surface font-bold mb-space-xs">
                {b.title}
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md">
                {b.body}
              </p>
            </div>
            {i === 0 ? (
              <div className="bg-surface-container-low p-space-md rounded-lg">
                <div className="flex items-center justify-between text-on-surface font-label-sm text-label-sm mb-1">
                  <span className="font-semibold text-primary">Tỉ lệ phát hiện SĐT cướp Lead</span>
                  <span className="font-bold text-on-surface">[MẪU] —</span>
                </div>
                <Meter pct={0} />
              </div>
            ) : null}
            {i === 1 ? (
              <div className="bg-surface-container-low p-space-md rounded-lg flex items-center gap-space-sm text-secondary">
                <Icon name="verified" size={22} />
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  Không bịa đặt thông tin kho hay khuyến mãi ngoài dữ liệu shop cung cấp.
                </span>
              </div>
            ) : null}
            {i === 2 ? (
              <div className="bg-surface-container-low p-space-md rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-error animate-pulse" />
                  <span className="font-label-sm text-label-sm text-on-surface font-bold">
                    Emergency Stop
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-code-sm text-code-sm">
                  Ngắt tức thì
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function FlowSteps() {
  return (
    <section className="py-space-xl lg:py-24 bg-surface-container-low">
      <div className="max-w-7xl mx-auto px-margin">
        <SectionHead
          tone="secondary"
          pill="Kiến trúc công nghệ"
          title="Vòng lặp vận hành AI 4 bước khép kín"
          body="Đảm bảo tốc độ phản hồi nhanh nhưng tuyệt đối tuân thủ chính sách nền tảng và kiểm soát chất lượng."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {STEPS.map((s) => (
            <div
              key={s.code}
              className={`${CARD} p-space-lg flex flex-col justify-between relative group hover:shadow-md transition-all`}
            >
              <div>
                <div className="flex items-center justify-between mb-space-md">
                  <span
                    className={`font-code-sm text-code-sm px-2 py-1 rounded font-bold ${s.codeTone}`}
                  >
                    {s.code}
                  </span>
                  <Icon name={s.icon} size={24} className={s.iconTone} />
                </div>
                <h4 className="font-title-md text-title-md text-on-surface font-bold mb-space-xs">
                  {s.title}
                </h4>
                <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                  {s.body}
                </p>
              </div>
              <div
                className={`mt-space-md pt-space-sm border-t border-surface-container flex items-center gap-1 font-label-sm text-label-sm ${s.footTone}`}
              >
                <Icon name={s.footIcon} size={16} className="text-primary" />
                <span>{s.foot}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PricingTable() {
  return (
    <section
      id="bang-gia"
      className="py-space-xl lg:py-24 bg-surface max-w-7xl mx-auto px-margin w-full"
    >
      <SectionHead
        pill="Bảng giá minh bạch"
        title="Đầu tư thông minh, bứt phá doanh số"
        body="[MẪU] Giá và hạn mức thật lấy từ bảng gói khi có trang công khai. Thanh toán qua VietQR (sắp có)."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg items-stretch">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={`bg-surface-container-lowest rounded-xl p-space-xl flex flex-col justify-between ${p.featured ? 'shadow-xl relative ring-2 ring-primary' : 'shadow-sm'}`}
          >
            {p.featured ? (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-space-md py-1 rounded-full bg-primary text-on-primary font-label-sm text-label-sm uppercase font-bold shadow-md flex items-center gap-1">
                <Icon name="star" size={14} />
                <span>Khuyên dùng nhiều nhất</span>
              </div>
            ) : null}
            <div>
              <div
                className={`flex items-center justify-between mb-space-sm ${p.featured ? 'pt-2' : ''}`}
              >
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  {p.name}
                </h3>
                <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm ${p.tagTone}`}>
                  {p.tag}
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-lg">
                {p.body}
              </p>
              <div className="mb-space-lg pb-space-md border-b border-surface-container">
                <div className="flex items-baseline gap-1">
                  <span className={`font-headline-lg text-headline-lg font-bold ${p.priceTone}`}>
                    [MẪU] — đ
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">/ tháng</span>
                </div>
                <p className={`font-label-sm text-label-sm mt-1 ${p.noteTone}`}>{p.note}</p>
              </div>
              <ul className="flex flex-col gap-space-sm mb-space-xl">
                {p.features.map((f) => (
                  <li
                    key={f.text}
                    className={`flex items-start gap-space-xs font-body-md text-body-md ${f.on ? 'text-on-surface' : 'text-on-surface-variant'}`}
                  >
                    <Icon
                      name={f.on ? 'check_circle' : 'cancel'}
                      size={18}
                      className={`mt-0.5 ${f.on ? 'text-primary' : 'text-outline-variant'}`}
                    />
                    <span className={f.on ? '' : 'line-through'}>
                      {f.strong ? <strong>{f.strong}</strong> : null} {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/register"
              className={
                p.featured
                  ? 'w-full inline-flex items-center justify-center gap-space-xs py-3 rounded-lg bg-primary text-on-primary font-title-sm text-title-sm hover:bg-primary-container shadow-md transition-all'
                  : 'w-full inline-flex items-center justify-center py-2.5 rounded-lg bg-surface-container-highest text-on-surface font-title-sm text-title-sm hover:bg-surface-container transition-colors'
              }
            >
              {p.featured ? <Icon name="bolt" size={18} /> : null}
              {p.cta}
            </Link>
          </div>
        ))}
      </div>
      <div className="mt-space-xl p-space-lg rounded-xl bg-surface-container-low flex flex-col md:flex-row items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md">
          <div className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shrink-0">
            <Icon name="add_circle" size={22} />
          </div>
          <div>
            <h4 className="font-title-sm text-title-sm text-on-surface font-bold">
              Gói nạp thêm lượt AI linh hoạt
            </h4>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              <strong>[MẪU] — đ / +[MẪU] n lượt AI</strong>. Khi hết hạn ngạch tháng, tin nhắn và
              bình luận vẫn đổ về đầy đủ, không mất tương tác khách hàng.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest shadow-sm text-primary">
            <Icon name="qr_code_2" size={18} />
            <span className="font-label-sm text-label-sm text-on-surface font-semibold">
              VietQR (sắp có)
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FaqList() {
  return (
    <section className="py-space-xl lg:py-24 bg-surface-container-low">
      <div className="max-w-4xl mx-auto px-margin">
        <SectionHead
          tone="secondary"
          pill="Giải đáp thắc mắc"
          title="Câu hỏi thường gặp (FAQ)"
          body="Những điều các chủ shop thường quan tâm nhất trước khi tích hợp trợ lý AI vào quy trình."
        />
        <div className="flex flex-col gap-space-md">
          {FAQ.map((f) => (
            <details key={f.q} className={`${CARD} p-space-lg group`}>
              <summary className="w-full text-left flex items-center justify-between gap-space-sm cursor-pointer list-none">
                <span className="font-title-md text-title-md text-on-surface font-bold">{f.q}</span>
                <Icon
                  name="expand_more"
                  size={24}
                  className="text-primary transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="mt-space-sm pt-space-sm border-t border-surface-container text-on-surface-variant font-body-md text-body-md leading-relaxed">
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

const CONTACTS: readonly { icon: IconName; text: string }[] = [
  { icon: 'support_agent', text: 'Hotline Kỹ thuật: [MẪU] —' },
  { icon: 'chat', text: 'Zalo Kỹ thuật viên hỗ trợ 1-1: [MẪU] —' },
  { icon: 'security', text: 'Dùng API chính thức của Meta' },
];

export function FinalCta() {
  return (
    <section className="py-space-xl lg:py-24 bg-surface max-w-7xl mx-auto px-margin w-full">
      <div className="relative rounded-2xl bg-gradient-to-br from-primary to-primary-container p-space-xl lg:p-16 text-on-primary shadow-xl overflow-hidden">
        <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute top-0 right-1/3 w-64 h-64 rounded-full bg-secondary/20 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl flex flex-col items-start gap-space-md">
          <span className="px-3 py-1 rounded-full bg-on-primary-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">
            Sẵn sàng bắt đầu ngay hôm nay
          </span>
          <h2 className="font-headline-lg text-headline-lg lg:text-[38px] lg:leading-[46px] font-bold text-on-primary">
            Sẵn sàng trả lời khách nhanh hơn và bảo vệ khách hàng của bạn ngay hôm nay?
          </h2>
          <p className="font-body-lg text-body-lg text-on-primary-container max-w-2xl leading-relaxed">
            Đăng ký và cài đặt nhanh. Không cần thẻ tín dụng, trải nghiệm miễn phí để xem AI làm
            việc với dữ liệu của shop bạn.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-space-md mt-space-sm w-full sm:w-auto">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-space-xs px-space-xl py-3.5 rounded-lg bg-surface-container-lowest text-primary font-title-md text-title-md hover:bg-surface-bright shadow-lg transition-transform active:scale-95 font-bold"
            >
              <Icon name="rocket_launch" size={22} />
              <span>Bắt đầu dùng thử - Không cần thẻ tín dụng</span>
            </Link>
          </div>
          <div className="pt-space-md border-t border-on-primary/10 flex flex-wrap items-center gap-space-lg text-on-primary-container font-label-sm text-label-sm">
            {CONTACTS.map((c) => (
              <div key={c.text} className="flex items-center gap-1.5">
                <Icon name={c.icon} size={18} />
                <span>{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicShell } from '../../../../components/public/public-shell';

const BENEFITS = [
  {
    title: 'Chống cướp khách',
    body: 'Quy tắc phát hiện bình luận chứa số điện thoại, link của đối thủ để bạn kiểm soát — AI không tự ẩn bình luận.',
  },
  {
    title: 'Trả lời đúng ngữ cảnh shop',
    body: 'AI chỉ soạn câu từ kho kiến thức, giá và tồn kho đọc từ dữ liệu sản phẩm; không có nguồn thì chuyển người.',
  },
  {
    title: 'Kiểm soát hoạt động',
    body: 'Bạn chọn mức tự động theo từng kênh và từng loại bình luận; mặc định luôn là duyệt tay.',
  },
] as const;

const STEPS = [
  ['Tiếp nhận', 'Nhận bình luận và tin nhắn qua API chính thức của nền tảng.'],
  ['Phân loại', 'Gắn nhãn ý định để xếp ưu tiên.'],
  ['Soạn câu', 'AI gợi ý câu trả lời từ cơ sở kiến thức.'],
  [
    'Gửi an toàn',
    'Nhân viên duyệt, hoặc tự gửi khi Chủ shop bật và qua kiểm tra lại ngay trước khi gửi.',
  ],
] as const;

const PLANS = [
  {
    name: '[MẪU] Gói 1',
    price: '[MẪU] — đ / tháng',
    hot: false,
    items: ['[MẪU] Số kênh', '[MẪU] Lượt AI / tháng'],
  },
  {
    name: '[MẪU] Gói 2',
    price: '[MẪU] — đ / tháng',
    hot: true,
    items: ['[MẪU] Số kênh', '[MẪU] Lượt AI / tháng', '[MẪU] Tự động gửi'],
  },
  {
    name: '[MẪU] Gói 3',
    price: '[MẪU] — đ / tháng',
    hot: false,
    items: ['[MẪU] Số kênh', '[MẪU] Lượt AI / tháng'],
  },
] as const;

const FAQ = [
  [
    'AI có tự trả lời bậy hoặc vi phạm chính sách không?',
    'AI chỉ soạn câu từ kho kiến thức; việc tự gửi do hệ thống quyết định theo quy tắc bạn bật.',
  ],
  ['Dữ liệu khách hàng có bị chia sẻ không?', '[MẪU] Nội dung chờ duyệt pháp lý.'],
  ['Chính sách cửa sổ 24 giờ của Messenger hoạt động thế nào?', '[MẪU] Nội dung chờ duyệt.'],
] as const;

/**
 * Giao diện Landing + Bảng giá (design/stitch/landing-pricing.png) với DỮ LIỆU MẪU — CHỈ khi
 * `NODE_ENV !== 'production'` (QRL1). Bỏ huy hiệu "Meta Tech Partner", "98.6%", số shop, giá thật, nút Google/Facebook.
 */
export default function DevLandingPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <PublicShell>
      <p className="badge badge-off">
        [MẪU] Trang mẫu — chưa phải trang công khai thật (chờ PUBLIC-PAGES).
      </p>
      <section className="rl-hero">
        <p className="rl-pill">Quản lý bình luận &amp; tin nhắn bằng AI</p>
        <h1>
          Trả lời khách nhanh hơn, <em>vẫn đúng giọng của shop</em>
        </h1>
        <p className="muted">
          Gợi ý trả lời từ cơ sở kiến thức của bạn; nhân viên duyệt hoặc tự gửi khi bạn bật.
        </p>
        <div className="rl-cta">
          <Link className="rl-btn" href="/register">
            Dùng thử miễn phí
          </Link>
          <Link className="rl-btn rl-btn-ghost" href="/dev/ui/comments">
            Xem giao diện mẫu
          </Link>
        </div>
      </section>

      <section className="stack" aria-label="Lợi ích">
        <div className="rl-section-title">
          <p className="rl-pill">Giá trị cốt lõi</p>
          <h2>3 lợi ích cho shop &amp; agency</h2>
        </div>
        <div className="rl-cards-3">
          {BENEFITS.map((b) => (
            <article key={b.title} className="rl-card">
              <h3>{b.title}</h3>
              <p className="muted">{b.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="stack" aria-label="Vòng lặp vận hành">
        <div className="rl-section-title">
          <p className="rl-pill rl-pill-ai">Cách hoạt động</p>
          <h2>Vòng lặp 4 bước</h2>
        </div>
        <div className="rl-cards-3">
          {STEPS.map(([title, body], i) => (
            <article key={title} className="rl-card">
              <p className="rl-eyebrow">Bước {i + 1}</p>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="bang-gia" className="stack" aria-label="Bảng giá">
        <div className="rl-section-title">
          <p className="rl-pill">Bảng giá</p>
          <h2>Chọn gói theo quy mô</h2>
          <p className="muted">[MẪU] Giá và hạn mức thật lấy từ bảng gói khi có trang công khai.</p>
        </div>
        <div className="rl-cards-3">
          {PLANS.map((plan) => (
            <article key={plan.name} className={`rl-card rl-plan${plan.hot ? ' rl-plan-hot' : ''}`}>
              <h3>{plan.name}</h3>
              <p className="rl-price">{plan.price}</p>
              <ul>
                {plan.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link className={plan.hot ? 'rl-btn' : 'rl-btn rl-btn-ghost'} href="/register">
                Chọn gói
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="stack rl-faq" aria-label="Câu hỏi thường gặp">
        <div className="rl-section-title">
          <h2>Câu hỏi thường gặp</h2>
        </div>
        {FAQ.map(([q, a]) => (
          <details key={q} className="rl-card">
            <summary>{q}</summary>
            <p className="muted">{a}</p>
          </details>
        ))}
      </section>

      <section className="rl-band">
        <h2>Sẵn sàng thử cho shop của bạn?</h2>
        <Link className="rl-btn" href="/register">
          Bắt đầu dùng thử
        </Link>
      </section>
    </PublicShell>
  );
}

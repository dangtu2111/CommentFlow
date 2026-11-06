import { notFound } from 'next/navigation';

/** Mọi chữ/số ở trang mẫu dev đều gắn "[MẪU]" (không đi qua i18n vì không phải giao diện thật). */
const KPIS = [
  {
    label: 'Tổng tương tác xử lý',
    value: '[MẪU] 0',
    hint: '[MẪU] Bình luận / tin nhắn',
    ai: false,
  },
  {
    label: 'Tỷ lệ AI tự động xử lý',
    value: '[MẪU] 0%',
    hint: '[MẪU] Tự gửi qua cổng an toàn',
    ai: true,
  },
  { label: 'SLA phản hồi trung vị', value: '[MẪU] 0 phút', hint: '[MẪU] Thời gian chờ', ai: false },
  {
    label: 'Khách có số điện thoại',
    value: '[MẪU] 0',
    hint: '[MẪU] Từ chat & bình luận',
    ai: false,
  },
] as const;

const BARS = [
  { day: 1, auto: 38, review: 30 },
  { day: 2, auto: 45, review: 28 },
  { day: 3, auto: 42, review: 33 },
  { day: 4, auto: 55, review: 25 },
  { day: 5, auto: 50, review: 30 },
  { day: 6, auto: 62, review: 22 },
  { day: 7, auto: 58, review: 24 },
  { day: 8, auto: 66, review: 20 },
] as const;

const INTENTS = [
  { label: 'Hỏi giá sản phẩm', pct: 44 },
  { label: 'Tư vấn size / chất liệu', pct: 28 },
  { label: 'Ý định mua hàng', pct: 14 },
  { label: 'Khiếu nại / vận chuyển', pct: 8 },
  { label: 'Nghi ngờ spam / khác', pct: 6 },
] as const;

const POSTS = [
  { name: '[MẪU] Bài viết A', channel: 'Facebook', product: '[MẪU] Sản phẩm 1', n: 0 },
  { name: '[MẪU] Bài viết B', channel: 'Instagram', product: '[MẪU] Sản phẩm 2', n: 0 },
  { name: '[MẪU] Bài viết C', channel: 'Facebook', product: 'Chưa gắn sản phẩm', n: 0 },
] as const;

const STAFF = [
  { name: '[MẪU] Nhân viên A', detail: '[MẪU] 0 câu đã duyệt', edit: '[MẪU] Sửa AI: 0%' },
  { name: '[MẪU] Nhân viên B', detail: '[MẪU] 0 câu đã duyệt', edit: '[MẪU] Sửa AI: 0%' },
] as const;

/**
 * Giao diện Báo cáo (design/stitch/reports.png) với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`
 * (UI-first 06/11/2026, QRL1). Không có chức năng; trang thật chờ REPORTS (FR-083).
 */
export default function DevReportsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="app-page app-page-wide stack">
      <p className="badge badge-off">
        [MẪU] Dữ liệu mẫu — không phải số liệu thật. Trang thật chờ REPORTS (FR-083).
      </p>
      <section className="rl-card rl-report-head" aria-label="[MẪU] Bộ lọc báo cáo">
        <div>
          <h1 className="auth-title">Báo cáo hiệu suất &amp; đo lường AI</h1>
          <p className="muted">
            Theo dõi tốc độ phản hồi, tỷ lệ tự động hóa AI và hiệu suất nhân viên.
          </p>
        </div>
        <div className="stack">
          <div className="rl-segment">
            <span>Hôm nay</span>
            <span>7 ngày qua</span>
            <span className="is-on" aria-current="true">
              30 ngày qua
            </span>
          </div>
          <div className="rl-cta">
            <span className="rl-btn rl-btn-ghost">Tất cả kênh</span>
            <span className="rl-btn rl-btn-ghost">Tóm tắt email tuần</span>
            <span className="rl-btn rl-btn-ghost">Xuất CSV</span>
          </div>
        </div>
      </section>

      <section className="rl-kpis" aria-label="[MẪU] Chỉ số chính">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className={`rl-card${kpi.ai ? ' rl-kpi-ai' : ''}`}>
            <p className="rl-eyebrow">{kpi.label}</p>
            <p className="rl-kpi-value">{kpi.value}</p>
            <p className="muted">{kpi.hint}</p>
          </div>
        ))}
      </section>

      <div className="rl-grid-2">
        <section className="rl-card" aria-label="[MẪU] Xu hướng xử lý">
          <h2 className="auth-title">Xu hướng xử lý tương tác theo ngày</h2>
          <ul className="rl-legend">
            <li>
              <span className="rl-dot" />
              AI tự động
            </li>
            <li>
              <span className="rl-dot rl-dot-ai" />
              Duyệt &amp; gửi
            </li>
            <li>
              <span className="rl-dot rl-dot-muted" />
              Bỏ qua / spam
            </li>
          </ul>
          <div className="rl-bars" role="img" aria-label="[MẪU] Biểu đồ cột minh họa">
            {BARS.map((bar) => (
              <div
                key={bar.day}
                className="rl-bar"
                style={{ height: `${bar.auto + bar.review + 12}%` }}
              >
                <div className="rl-bar-review" style={{ height: `${bar.review}%` }} />
                <div className="rl-bar-auto" style={{ height: `${bar.auto}%` }} />
              </div>
            ))}
          </div>
        </section>

        <section className="rl-card" aria-label="[MẪU] Phân bố ý định">
          <h2 className="auth-title">Phân bố nhãn ý định</h2>
          <p className="muted">[MẪU] Tỷ lệ minh họa, không phải số liệu thật.</p>
          <ul className="rl-rows">
            {INTENTS.map((intent) => (
              <li key={intent.label} className="rl-row">
                <div className="rl-row-head">
                  <span>{intent.label}</span>
                  <strong>[MẪU] {intent.pct}%</strong>
                </div>
                <div className="rl-meter">
                  <span style={{ width: `${intent.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rl-card" aria-label="[MẪU] Top bài viết">
          <h2 className="auth-title">Top bài viết nhiều bình luận hỏi giá</h2>
          <table className="rl-table">
            <thead>
              <tr>
                <th scope="col">Bài viết &amp; kênh</th>
                <th scope="col">Sản phẩm liên kết</th>
                <th scope="col">Bình luận hỏi giá</th>
              </tr>
            </thead>
            <tbody>
              {POSTS.map((post) => (
                <tr key={post.name}>
                  <td>
                    {post.name}
                    <br />
                    <span className="muted">{post.channel}</span>
                  </td>
                  <td>
                    <span
                      className={`rl-pill${post.product.startsWith('Chưa') ? ' rl-pill-warn' : ''}`}
                    >
                      {post.product}
                    </span>
                  </td>
                  <td>[MẪU] {post.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rl-card" aria-label="[MẪU] Hiệu suất nhân viên">
          <h2 className="auth-title">Hiệu suất nhân viên CSKH</h2>
          <ul className="rl-rows">
            {STAFF.map((member) => (
              <li key={member.name} className="rl-row-head rl-callout">
                <span>
                  <strong>{member.name}</strong>
                  <br />
                  <span className="muted">{member.detail}</span>
                </span>
                <span className="rl-pill rl-pill-ai">{member.edit}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rl-card rl-insight" aria-label="[MẪU] Gợi ý cơ sở kiến thức">
        <p className="rl-eyebrow">Gợi ý từ AI</p>
        <h2 className="auth-title">Đề xuất tối ưu cơ sở kiến thức</h2>
        <p>[MẪU] Câu hỏi khách hỏi nhiều nhưng chưa có trong kho kiến thức sẽ hiện ở đây.</p>
        <span className="rl-btn">Thêm vào cơ sở kiến thức</span>
      </section>
    </main>
  );
}

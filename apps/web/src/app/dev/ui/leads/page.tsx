import { notFound } from 'next/navigation';

/** Mọi chữ ở trang mẫu dev đều gắn "[MẪU]" (không đi qua i18n vì không phải giao diện thật). */
const SAMPLE = {
  banner: '[MẪU] Dữ liệu mẫu — không phải số liệu thật. Trang thật chờ bảng leads (LEADS-KANBAN).',
  title: '[MẪU] Khách tiềm năng',
  kpis: '[MẪU] Chỉ số',
  board: '[MẪU] Bảng Kanban',
  detail: '[MẪU] Chi tiết khách',
  ai: '[MẪU] AI trích xuất',
  name: '[MẪU] Khách A',
  fullName: '[MẪU] Họ và tên',
  phoneLabel: '[MẪU] Số điện thoại',
  phone: '09xx.xxx.xxx',
  productLabel: '[MẪU] Sản phẩm',
  product: '[MẪU] Sản phẩm mẫu',
} as const;

const KPIS = [
  { label: '[MẪU] Tổng leads tháng này', value: '[MẪU] 00' },
  { label: '[MẪU] Tự động trích xuất', value: '[MẪU] 00' },
  { label: '[MẪU] Đã chốt đơn', value: '[MẪU] 00' },
  { label: '[MẪU] Doanh thu ước tính', value: '[MẪU] 0 đ' },
] as const;

const COLUMNS = [
  {
    key: 'new',
    title: '[MẪU] Mới (chờ liên hệ)',
    cards: [{ who: '[MẪU] Khách A', phone: '09xx.xxx.xxx', ai: true }],
  },
  {
    key: 'talking',
    title: '[MẪU] Đang tư vấn',
    cards: [{ who: '[MẪU] Khách B', phone: '09xx.xxx.xxx', ai: true }],
  },
  {
    key: 'won',
    title: '[MẪU] Đã chốt đơn',
    cards: [{ who: '[MẪU] Khách C', phone: '09xx.xxx.xxx', ai: false }],
  },
  { key: 'lost', title: '[MẪU] Hủy / không nghe', cards: [] },
] as const;

/**
 * Giao diện Khách tiềm năng (design/stitch/leads.png) với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`
 * (UI-first 06/11/2026, QAL1). Không có chức năng; trang thật chờ bảng leads.
 */
export default function DevLeadsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="app-page app-page-wide stack">
      <p className="badge badge-off">{SAMPLE.banner}</p>
      <h1 className="auth-title">{SAMPLE.title}</h1>
      <section className="leads-kpis" aria-label={SAMPLE.kpis}>
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="leads-kpi">
            <p className="muted">{kpi.label}</p>
            <p className="leads-kpi-value">{kpi.value}</p>
          </div>
        ))}
      </section>
      <div className="leads-layout">
        <section className="leads-board" aria-label={SAMPLE.board}>
          {COLUMNS.map((col) => (
            <div key={col.key} className="leads-col">
              <p className="leads-col-head">{col.title}</p>
              {col.cards.map((card) => (
                <article key={card.who} className="leads-card">
                  {card.ai ? <span className="leads-card-ai">{SAMPLE.ai}</span> : null}
                  <strong>{card.who}</strong>
                  <span>{card.phone}</span>
                </article>
              ))}
            </div>
          ))}
        </section>
        <aside className="leads-detail" aria-label={SAMPLE.detail}>
          <h2>{SAMPLE.name}</h2>
          <dl>
            <dt>{SAMPLE.fullName}</dt>
            <dd>{SAMPLE.name}</dd>
            <dt>{SAMPLE.phoneLabel}</dt>
            <dd>{SAMPLE.phone}</dd>
            <dt>{SAMPLE.productLabel}</dt>
            <dd>{SAMPLE.product}</dd>
          </dl>
        </aside>
      </div>
    </main>
  );
}

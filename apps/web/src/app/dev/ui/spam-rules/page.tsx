import { notFound } from 'next/navigation';
import { SpamRuleBuilder } from '../../../../components/spam-rules/spam-rule-builder';

/** Mọi chữ ở trang mẫu dev đều gắn "[MẪU]" (không đi qua i18n vì không phải giao diện thật). */
const SAMPLE = {
  banner:
    '[MẪU] Dữ liệu mẫu — không phải số liệu thật. Danh sách quy tắc chờ giao diện nối bảng `rules`.',
  title: '[MẪU] Quy tắc spam',
  list: '[MẪU] Quy tắc đang chạy',
  on: '[MẪU] Đang bật',
  off: '[MẪU] Tắt',
} as const;

const RULES = [
  {
    name: '[MẪU] Chặn số điện thoại lạ',
    meta: '[MẪU] Loại: số điện thoại · Hành động: đánh dấu',
    on: true,
  },
  { name: '[MẪU] Chặn link lạ', meta: '[MẪU] Loại: mẫu regex · Hành động: bỏ qua', on: true },
  { name: '[MẪU] Từ khóa xúc phạm', meta: '[MẪU] Loại: từ khóa · Hành động: đánh dấu', on: false },
] as const;

/**
 * Giao diện Quy tắc spam (design/stitch/spam-rules.png) với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`
 * (UI-first 06/11/2026, QAL1). Danh sách là mẫu không chức năng; trình tạo quy tắc là thành phần thật.
 */
export default function DevSpamRulesPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="app-page app-page-wide spam-page">
      <p className="badge badge-off">{SAMPLE.banner}</p>
      <h1 className="auth-title">{SAMPLE.title}</h1>
      <ul className="spam-rule-list" aria-label={SAMPLE.list}>
        {RULES.map((rule) => (
          <li key={rule.name} className="spam-rule-item">
            <div>
              <h2 className="spam-rule-title">{rule.name}</h2>
              <p className="spam-rule-meta">{rule.meta}</p>
            </div>
            <span className={rule.on ? 'badge badge-on' : 'badge badge-off'}>
              {rule.on ? SAMPLE.on : SAMPLE.off}
            </span>
          </li>
        ))}
      </ul>
      <SpamRuleBuilder />
    </main>
  );
}

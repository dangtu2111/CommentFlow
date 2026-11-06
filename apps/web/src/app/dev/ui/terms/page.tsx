import { notFound } from 'next/navigation';
import { PublicShell } from '../../../../components/public/public-shell';

const TOC = [
  ['tos', 'Phần I: Điều khoản dịch vụ'],
  ['workspace', 'Tài khoản & phân quyền'],
  ['platform', 'Chính sách nền tảng'],
  ['ai', 'Cơ chế AI & trách nhiệm'],
  ['dpa', 'Phần II: Thỏa thuận xử lý dữ liệu (DPA)'],
  ['retention', 'Dữ liệu xử lý & thời hạn lưu'],
] as const;

const TLDR = [
  'Không bao giờ tự ý đăng bình luận ngoài quy tắc bạn bật.',
  'AI không tự ẩn bình luận.',
  'Xóa dữ liệu theo yêu cầu của khách.',
  'Dữ liệu mỗi shop tách biệt với shop khác.',
] as const;

/**
 * Giao diện Điều khoản & DPA (design/stitch/terms-dpa.png), DỮ LIỆU MẪU, CHỈ dev (QRL1). Điều khoản thật do luật
 * sư soạn; bỏ MST, chữ ký số, người đại diện, hotline, "SOC2/ISO" chưa có thật.
 */
export default function DevTermsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <PublicShell>
      <p className="badge badge-off">[MẪU] Trang mẫu — văn bản pháp lý thật chờ luật sư duyệt.</p>
      <header className="stack">
        <h1 className="auth-title">Điều khoản dịch vụ &amp; Thỏa thuận xử lý dữ liệu (DPA)</h1>
        <p className="rl-pill">[MẪU] Phiên bản / ngày hiệu lực</p>
      </header>
      <div className="rl-legal">
        <nav className="rl-card rl-legal-toc" aria-label="Mục lục">
          <p className="rl-eyebrow">Mục lục</p>
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <div className="rl-legal-body">
          <section className="rl-card stack" aria-label="Tóm tắt">
            <p className="rl-eyebrow">Tóm tắt nhanh</p>
            <ul className="rl-steps">
              {TLDR.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          {TOC.map(([id, label]) => (
            <section key={id} id={id} className="rl-card stack">
              <h2>{label}</h2>
              <p className="muted">[MẪU] Nội dung điều khoản — chờ văn bản pháp lý đã duyệt.</p>
            </section>
          ))}
          <section className="rl-card rl-callout">
            <h2>Thông tin pháp nhân</h2>
            <p className="muted">
              [MẪU] Tên công ty, mã số thuế, người đại diện — chờ chủ dự án cung cấp.
            </p>
          </section>
        </div>
      </div>
    </PublicShell>
  );
}

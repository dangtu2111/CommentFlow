import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicShell } from '../../../../components/public/public-shell';

const DELETED_BLOCKS = [
  [
    'Token truy cập Page / người dùng',
    'Toàn bộ token xác thực của kênh đã kết nối',
    'Thu hồi và xóa',
  ],
  [
    'Bình luận và lịch sử tin nhắn',
    'Nội dung, tên và mã người dùng của khách',
    'Xóa trắng nội dung, giữ dòng nhật ký',
  ],
  ['Dữ liệu ngữ cảnh AI', 'Đoạn kiến thức và vector của workspace', 'Xóa khỏi kho vector'],
] as const;

const STEPS = [
  'Đăng nhập tài khoản Facebook quản lý Page.',
  'Vào Cài đặt & Quyền riêng tư → Cài đặt.',
  'Tìm mục Tích hợp doanh nghiệp (Business Integrations).',
  'Tìm ứng dụng này và nhấn Gỡ (Remove).',
  'Meta gọi URL Data Deletion Callback; hệ thống xóa dữ liệu và trả mã xác nhận.',
] as const;

/**
 * Giao diện Quyền riêng tư & tra cứu xóa dữ liệu (design/stitch/privacy-data-deletion.png), DỮ LIỆU MẪU, CHỈ dev
 * (QRL1). Bỏ "Meta Data Deletion Callback: Active", chứng nhận, hotline, địa chỉ, MST, mã `DEL-…` như thật.
 */
export default function DevPrivacyPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <PublicShell>
      <p className="badge badge-off">
        [MẪU] Trang mẫu — nội dung pháp lý chờ duyệt, tra cứu chưa hoạt động.
      </p>
      <header className="stack">
        <p className="rl-pill rl-pill-ai">Quyền riêng tư của khách hàng</p>
        <h1 className="auth-title">Dữ liệu, điều khoản &amp; tra cứu yêu cầu xóa dữ liệu</h1>
        <p className="muted">
          [MẪU] Cam kết tôn trọng quyền riêng tư theo quy định của nền tảng và pháp luật hiện hành.
        </p>
      </header>

      <section className="rl-card stack" aria-label="[MẪU] Tra cứu xóa dữ liệu">
        <p className="rl-eyebrow">Công cụ tra cứu</p>
        <h2 className="auth-title">Kiểm tra tiến trình xóa dữ liệu</h2>
        <p className="muted">Nhập mã xác nhận được cấp sau khi gửi yêu cầu xóa.</p>
        <form className="rl-search" aria-label="[MẪU] Tra cứu">
          <input type="text" placeholder="[MẪU] Mã xác nhận" aria-label="Mã xác nhận" disabled />
          <button className="rl-btn" type="button" disabled>
            Tra cứu trạng thái
          </button>
        </form>
        <p className="muted">[MẪU] Chức năng tra cứu chờ callback xóa dữ liệu của Meta.</p>
      </section>

      <section className="rl-card stack" aria-label="[MẪU] Báo cáo xóa">
        <h2 className="auth-title">
          [MẪU] Mã yêu cầu <span className="rl-pill rl-pill-ok">Đã hoàn tất</span>
        </h2>
        <table className="rl-table">
          <thead>
            <tr>
              <th scope="col">Hạng mục</th>
              <th scope="col">Phạm vi</th>
              <th scope="col">Phương thức</th>
            </tr>
          </thead>
          <tbody>
            {DELETED_BLOCKS.map(([item, scope, how]) => (
              <tr key={item}>
                <td>{item}</td>
                <td>{scope}</td>
                <td>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="rl-grid-2">
        <section className="rl-card stack">
          <h2 className="auth-title">Gỡ ứng dụng &amp; kích hoạt xóa tự động trên Facebook</h2>
          <ol className="rl-steps">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
        <section className="rl-card stack">
          <h2 className="auth-title">Gửi yêu cầu xóa trực tiếp</h2>
          <p className="muted">
            Nếu không còn quyền truy cập Facebook, gửi email cho đội ngũ hỗ trợ.
          </p>
          <p className="rl-callout">[MẪU] Địa chỉ email liên hệ DPO — chờ chủ dự án cung cấp.</p>
          <Link className="rl-link" href="/dev/ui/terms">
            Xem Điều khoản &amp; DPA
          </Link>
        </section>
      </div>

      <section className="stack" aria-label="[MẪU] Liên hệ">
        <h2 className="auth-title">Đội ngũ bảo vệ dữ liệu</h2>
        <div className="rl-cards-3">
          {['Email pháp lý & DPO', 'Thời gian phản hồi', 'Công ty'].map((label) => (
            <article key={label} className="rl-card">
              <p className="rl-eyebrow">{label}</p>
              <p className="muted">[MẪU] Chờ thông tin thật</p>
            </article>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}

'use client';

import { useState } from 'react';
import { cn } from '../../lib/cn';
import { Icon, type IconName } from '../ui/icon';
import { LegalNote, PENDING_LEGAL } from './pub-parts';

/** Quyền riêng tư & xóa dữ liệu (design/stitch/privacy-data-deletion.html). Mọi giá trị cụ thể là [MẪU]; nội dung pháp lý chờ duyệt. */

type Tab = 'tracker' | 'policy';

type DeletionRecord = {
  code: string;
  platform: string;
  status: string;
  statusClass: string;
  received: string;
  completed: string;
  hash: string;
};

const RECORDS: readonly DeletionRecord[] = [
  {
    code: 'DEL-FB-98421',
    platform: 'Facebook Fanpage Graph API',
    status: 'ĐÃ HOÀN TẤT XÓA',
    statusClass: 'bg-surface-container-high text-primary',
    received: '[MẪU] 2000-01-01 00:00:00 UTC',
    completed: '[MẪU] 2000-01-01 00:00:08 UTC',
    hash: '[MẪU] sha256:…',
  },
  {
    code: 'DEL-IG-10492',
    platform: 'Instagram Direct & Comments',
    status: 'ĐANG XỬ LÝ',
    statusClass: 'bg-secondary-fixed text-on-secondary-fixed',
    received: '[MẪU] 2000-01-01 00:10:00 UTC',
    completed: '[MẪU] Đang xử lý…',
    hash: '[MẪU] sha256:…',
  },
  {
    code: 'DEL-TT-00215',
    platform: 'TikTok Business Shop API (sắp có)',
    status: 'ĐÃ TIẾP NHẬN YÊU CẦU',
    statusClass: 'bg-surface-container text-on-surface',
    received: '[MẪU] 2000-01-01 00:20:00 UTC',
    completed: '[MẪU] Đang xếp hàng…',
    hash: '[MẪU] sha256:…',
  },
];

const PURGED: readonly {
  icon: IconName;
  item: string;
  scope: string;
  how: string;
  state: string;
}[] = [
  {
    icon: 'key_off',
    item: 'Page Access Tokens & User Token',
    scope: 'Toàn bộ token xác thực Graph API của Fanpage',
    how: 'Thu hồi và xóa',
    state: 'Đã tiêu hủy',
  },
  {
    icon: 'forum',
    item: 'Bộ nhớ đệm tin nhắn & Lịch sử bình luận',
    scope: 'ID bình luận, nội dung văn bản khách hỏi',
    how: 'Xóa nội dung khỏi cơ sở dữ liệu',
    state: 'Đã tiêu hủy',
  },
  {
    icon: 'psychology',
    item: 'Dữ liệu ngữ cảnh AI & Vector Embeddings',
    scope: 'Vector tri thức sinh ra từ dữ liệu của shop',
    how: 'Xóa khỏi kho vector',
    state: 'Đã tiêu hủy',
  },
  {
    icon: 'link_off',
    item: 'Webhook Subscriptions',
    scope: 'Đăng ký sự kiện feed, messages, mentions',
    how: 'Gửi lệnh Unsubscribe qua Meta Graph API',
    state: 'Đã hủy liên kết',
  },
];

const FB_STEPS: readonly string[] = [
  'Đăng nhập tài khoản cá nhân quản lý Fanpage trên Facebook máy tính hoặc ứng dụng di động.',
  'Truy cập Cài đặt & Quyền riêng tư (Settings & Privacy) > chọn Cài đặt (Settings).',
  'Tìm mục Tiện ích tích hợp cho doanh nghiệp (Business Integrations) hoặc Ứng dụng và Trang web (Apps and Websites).',
  'Tìm ứng dụng này, tích chọn và nhấn nút Gỡ (Remove).',
  'Meta sẽ gửi yêu cầu xóa dữ liệu tới URL callback của hệ thống và hiển thị mã xác nhận cho bạn. [MẪU] URL callback chờ Meta duyệt.',
];

const TOC: readonly { id: string; label: string }[] = [
  { id: 'sec-1', label: '1. Giới thiệu & Phạm vi áp dụng' },
  { id: 'sec-2', label: '2. Dữ liệu thu thập & KHÔNG thu thập' },
  { id: 'sec-3', label: '3. Mục đích sử dụng & Cam kết AI' },
  { id: 'sec-4', label: '4. Quyền của chủ thể & Xóa dữ liệu' },
  { id: 'sec-5', label: '5. Tiêu chuẩn lưu trữ & Mã hóa' },
  { id: 'sec-6', label: '6. Chia sẻ đối tác & Kiểm toán bảo mật' },
  { id: 'sec-7', label: '7. Thông tin liên hệ DPO & Pháp lý' },
];

const COLLECT: readonly string[] = [
  'Quyền truy cập API Token do Facebook / Instagram cấp phát có thời hạn.',
  'ID bình luận công khai, ID bài viết, nội dung bình luận cần phản hồi.',
  'Tên người dùng hiển thị công khai và ID người dùng theo ứng dụng.',
  'Thời điểm gửi bình luận hoặc tin nhắn.',
];

const NEVER: readonly string[] = [
  'Mật khẩu tài khoản cá nhân Facebook, Instagram hoặc TikTok.',
  'Danh bạ điện thoại, vị trí GPS của người mua hàng.',
  'Dữ liệu thẻ ngân hàng, CVV.',
  'Nội dung bài viết cá nhân ngoài các Fanpage được phân quyền quản trị.',
];

const PURPOSES: readonly { icon: IconName; text: string }[] = [
  {
    icon: 'bolt',
    text: 'Gợi ý câu trả lời dựa theo bảng giá, tồn kho và kho kiến thức do chính doanh nghiệp thiết lập.',
  },
  {
    icon: 'filter_alt',
    text: 'Phát hiện bình luận chứa số điện thoại và gắn cờ để nhân viên xử lý theo cấu hình của shop (AI không tự ẩn).',
  },
  {
    icon: 'query_stats',
    text: 'Báo cáo hiệu suất thời gian phản hồi của nhân viên CSKH.',
  },
];

const STORAGE: readonly { icon: IconName; title: string; body: string }[] = [
  { icon: 'lock', title: 'Mã hóa token', body: '[MẪU] Chi tiết thuật toán chờ duyệt kỹ thuật.' },
  { icon: 'vpn_lock', title: 'Mã hóa đường truyền', body: '[MẪU] Chi tiết chờ duyệt kỹ thuật.' },
  { icon: 'database', title: 'Vị trí máy chủ', body: '[MẪU] Chưa chốt nhà cung cấp hạ tầng.' },
];

const DPO_BOXES: readonly { icon: IconName; title: string; main: string; sub: string }[] = [
  {
    icon: 'mark_email_read',
    title: 'Email Pháp lý & DPO',
    main: '[MẪU] —',
    sub: 'Thời gian phản hồi: [MẪU]',
  },
  {
    icon: 'support_agent',
    title: 'Hotline Giải quyết Khiếu nại',
    main: '[MẪU] —',
    sub: '[MẪU] Giờ làm việc',
  },
  { icon: 'apartment', title: 'Trụ sở Công ty', main: '[MẪU] —', sub: '[MẪU] Địa chỉ chưa có' },
  {
    icon: 'badge',
    title: 'Đăng ký Doanh nghiệp',
    main: 'Mã số thuế: [MẪU] —',
    sub: '[MẪU] Chưa có thông tin',
  },
];

const TAB_BASE =
  'flex items-center gap-space-xs px-space-lg py-2.5 rounded-lg font-title-sm text-title-sm transition-all';
const FIELD_LABEL = 'font-label-sm text-label-sm text-on-surface-variant uppercase font-medium';
const SOON_BTN = 'cursor-not-allowed opacity-70';

function ArticleHead({ n, title }: { n: string; title: string }) {
  return (
    <>
      <div className="flex items-center gap-space-xs text-primary font-label-md text-label-md font-bold uppercase tracking-wider">
        <span>Mục {n}</span>
      </div>
      <h2 className="font-headline-md text-headline-md text-on-surface font-bold">{title}</h2>
    </>
  );
}

function TrackerTab() {
  const [code, setCode] = useState(RECORDS[0]?.code ?? '');
  const [active, setActive] = useState(RECORDS[0]);
  const lookup = (c: string) => setActive(RECORDS.find((r) => r.code === c) ?? RECORDS[0]);
  if (!active) return null;
  return (
    <section className="w-full py-space-xl px-margin">
      <div className="max-w-7xl mx-auto flex flex-col gap-space-xl">
        <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-md flex flex-col gap-space-lg">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
            <div className="max-w-2xl">
              <span className="font-label-sm text-label-sm text-primary uppercase font-bold tracking-wider">
                Công cụ theo quy chế Meta Developer
              </span>
              <h2 className="font-headline-md text-headline-md text-on-surface mt-1">
                Kiểm tra tiến trình hủy bỏ &amp; xóa dữ liệu người dùng
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Nhập mã định danh yêu cầu xóa dữ liệu (Confirmation Code) được cấp từ Facebook
                Business Integrations hoặc cung cấp sau khi gửi đơn yêu cầu xóa thủ công.
              </p>
            </div>
            <div className="flex items-center gap-space-sm p-space-sm rounded-lg bg-surface-container-low shrink-0 text-secondary">
              <Icon name="sync_saved_locally" size={24} />
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm font-bold text-on-surface">
                  Cơ chế Callback tự động
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  [MẪU] Chưa bật — chờ Meta duyệt
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-space-sm">
            <div className="relative flex-1">
              <Icon
                name="fingerprint"
                size={20}
                className="absolute left-space-md top-1/2 -translate-y-1/2 text-outline"
              />
              <input
                className="w-full pl-11 pr-space-md py-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-code-sm text-code-sm focus:outline-none focus:bg-surface-container-lowest shadow-inner transition-colors"
                placeholder="Ví dụ: DEL-FB-98421 hoặc CF-REQ-2024..."
                type="text"
                aria-label="Mã xác nhận xóa dữ liệu"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => lookup(code.trim())}
              className="flex items-center justify-center gap-space-xs px-space-xl py-3 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md transition-colors shadow-sm shrink-0"
            >
              <Icon name="search" size={18} />
              <span>Tra cứu trạng thái ngay</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-space-md text-on-surface-variant font-body-sm text-body-sm">
            <span className="flex items-center gap-1">
              <Icon name="check_circle" size={16} className="text-primary" />
              Mã mẫu thử nghiệm:
            </span>
            {RECORDS.map((r, i) => (
              <span key={r.code} className="contents">
                {i > 0 ? <span className="text-outline-variant">•</span> : null}
                <button
                  type="button"
                  className="underline hover:text-primary font-code-sm"
                  onClick={() => {
                    setCode(r.code);
                    setActive(r);
                  }}
                >
                  {r.code} (
                  {r.status === 'ĐÃ HOÀN TẤT XÓA'
                    ? 'Đã hoàn tất'
                    : r.status === 'ĐANG XỬ LÝ'
                      ? 'Đang xử lý'
                      : 'Đã tiếp nhận'}
                  )
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-md flex flex-col gap-space-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md pb-space-md bg-surface-container-lowest">
            <div className="flex items-center gap-space-md">
              <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
                <Icon name="task_alt" size={26} />
              </div>
              <div>
                <div className="flex items-center gap-space-xs">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {active.code}
                  </span>
                  <span
                    className={cn(
                      'px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-bold uppercase',
                      active.statusClass,
                    )}
                  >
                    {active.status}
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  [MẪU] Yêu cầu xóa dữ liệu phát sinh qua Meta Webhook Data Deletion Request
                  Callback.
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-disabled="true"
              title="Sắp có"
              tabIndex={-1}
              className={cn(
                'inline-flex items-center gap-space-xs px-space-md py-2 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md shadow-sm',
                SOON_BTN,
              )}
            >
              <Icon name="download_for_offline" size={18} />
              <span>Tải Biên bản xác nhận (PDF)</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
            <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col justify-between">
              <span className={FIELD_LABEL}>Nền tảng khởi tạo</span>
              <div className="flex items-center gap-space-xs mt-space-sm">
                <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold font-code-sm text-code-sm">
                  f
                </div>
                <span className="font-title-md text-title-md text-on-surface">
                  {active.platform}
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                App Scoped User ID (ASID)
              </span>
            </div>
            <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col justify-between">
              <span className={FIELD_LABEL}>Thời điểm tiếp nhận Webhook</span>
              <div className="flex items-center gap-space-xs mt-space-sm text-primary">
                <Icon name="schedule" size={20} />
                <span className="font-title-md text-title-md text-on-surface font-code-sm">
                  {active.received}
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                Xác thực chữ ký yêu cầu
              </span>
            </div>
            <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col justify-between">
              <span className={FIELD_LABEL}>Thời điểm hoàn tất xóa sạch</span>
              <div className="flex items-center gap-space-xs mt-space-sm text-primary">
                <Icon name="check_circle" size={20} />
                <span className="font-title-md text-title-md text-on-surface font-code-sm">
                  {active.completed}
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                Thời gian xử lý: [MẪU] —
              </span>
            </div>
            <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col justify-between">
              <span className={FIELD_LABEL}>Mã hàm băm kiểm toán (Audit Hash)</span>
              <div className="flex items-center gap-space-xs mt-space-sm truncate font-code-sm text-code-sm text-primary font-bold">
                <Icon name="verified" size={18} />
                <span className="truncate">{active.hash}</span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                Lưu vết theo quy chế: [MẪU]
              </span>
            </div>
          </div>
          <div className="p-space-lg rounded-xl bg-surface-container-low flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <h3 className="font-title-md text-title-md text-on-surface font-bold">
                Báo cáo kiểm kê các khối dữ liệu đã tiêu hủy
              </h3>
              <span className="font-label-sm text-label-sm text-primary font-semibold">
                [MẪU] Quy trình xóa
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead>
                  <tr className="bg-surface-container text-on-surface font-label-md text-label-md">
                    <th className="py-2.5 px-3 rounded-l-lg">Hạng mục dữ liệu</th>
                    <th className="py-2.5 px-3">Phạm vi tác động</th>
                    <th className="py-2.5 px-3">Phương thức xử lý</th>
                    <th className="py-2.5 px-3 rounded-r-lg text-right">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y-0 text-on-surface-variant">
                  {PURGED.map((row) => (
                    <tr key={row.item} className="hover:bg-surface-container/50">
                      <td className="py-2.5 px-3 font-semibold text-on-surface">
                        <span className="flex items-center gap-2">
                          <Icon name={row.icon} size={16} className="text-primary" />
                          {row.item}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{row.scope}</td>
                      <td className="py-2.5 px-3 font-code-sm">{row.how}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-semibold">
                          {row.state}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
          <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-md flex flex-col gap-space-md">
            <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
              <Icon name="settings_applications" size={22} />
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Cách gỡ ứng dụng &amp; Kích hoạt xóa dữ liệu tự động trên Facebook
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Người dùng sở hữu trang có thể chủ động hủy kết nối bất kỳ lúc nào trực tiếp trên giao
              diện của Meta theo các bước sau:
            </p>
            <ol className="flex flex-col gap-space-sm pl-0 list-none mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
              {FB_STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-space-sm">
                  <span className="w-5 h-5 rounded-full bg-surface-container text-primary font-bold flex items-center justify-center shrink-0 text-xs">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-md flex flex-col gap-space-md justify-between">
            <div className="flex flex-col gap-space-md">
              <div className="w-10 h-10 rounded-lg bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed">
                <Icon name="contact_support" size={22} />
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                Gửi yêu cầu xóa dữ liệu trực tiếp đến Đội ngũ Kỹ thuật
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Nếu bạn không còn quyền truy cập tài khoản Facebook hoặc muốn yêu cầu xóa hồ sơ, hóa
                đơn và lịch sử trao đổi trên máy chủ, vui lòng gửi biểu mẫu xác minh:
              </p>
              <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-xs text-on-surface">
                <div className="flex items-center gap-space-xs text-primary font-title-sm text-title-sm">
                  <Icon name="mail" size={18} />
                  <span>[MẪU] Email quyền riêng tư — chưa có</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Tiêu đề thư: <code>[Data Deletion Request] - &lt;Tên Fanpage&gt;</code>. Thời gian
                  phản hồi: [MẪU] chờ chốt.
                </p>
              </div>
            </div>
            <div className="p-space-sm rounded-lg bg-surface-container flex items-center gap-space-sm text-secondary">
              <Icon name="security_update_good" size={22} />
              <span className="font-body-sm text-body-sm text-on-surface">
                Hướng tới đáp ứng <strong>Chính sách Nền tảng của Meta</strong> và quyền được xóa dữ
                liệu cá nhân theo luật hiện hành. {PENDING_LEGAL}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PolicyTab() {
  return (
    <section className="w-full py-space-xl px-margin">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        <aside className="lg:col-span-4 sticky top-24 flex flex-col gap-space-md">
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-md">
            <div className="flex items-center gap-space-xs text-primary font-title-sm text-title-sm">
              <Icon name="format_list_bulleted" size={18} />
              <span>Mục lục Văn bản Pháp lý</span>
            </div>
            <nav className="flex flex-col gap-1 font-body-sm text-body-sm">
              {TOC.map((t, i) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    i === 0
                      ? 'text-primary bg-surface-container font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low',
                  )}
                >
                  {t.label}
                </a>
              ))}
            </nav>
            <div className="pt-space-sm bg-surface-container-lowest">
              <div className="p-space-sm rounded-lg bg-surface-container-low text-on-surface flex flex-col gap-1">
                <span className="font-label-sm text-label-sm uppercase text-outline font-semibold">
                  Tình trạng văn bản
                </span>
                <span className="font-title-sm text-title-sm text-primary">
                  Có hiệu lực từ: [MẪU] —
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Phiên bản: [MẪU] bản nháp chờ duyệt
                </span>
              </div>
            </div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center gap-space-sm text-primary">
            <Icon name="verified" size={28} />
            <div>
              <div className="font-title-sm text-title-sm text-on-surface font-bold">
                [MẪU] Chưa có chứng nhận đối tác
              </div>
              <div className="font-body-sm text-body-sm text-on-surface-variant">
                Chỉ dùng API chính thức của nền tảng
              </div>
            </div>
          </div>
        </aside>

        <article className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-space-xl shadow-md flex flex-col gap-space-xl">
          <section className="flex flex-col gap-space-sm scroll-mt-24" id="sec-1">
            <ArticleHead n="01" title="1. Giới thiệu & Phạm vi áp dụng" />
            <LegalNote>
              Văn bản này chi phối việc thu thập, lưu trữ, xử lý dữ liệu khi khách hàng kết nối
              Fanpage Facebook hoặc tài khoản chuyên nghiệp Instagram vào nền tảng. {PENDING_LEGAL}
            </LegalNote>
            <LegalNote>
              Bằng việc cấp quyền qua Meta OAuth Dialog, bạn đồng ý với chính sách này cùng Điều
              khoản dành cho nhà phát triển của Meta (Meta Platform Terms).
            </LegalNote>
          </section>

          <section className="flex flex-col gap-space-sm scroll-mt-24" id="sec-2">
            <ArticleHead n="02" title="2. Dữ liệu chúng tôi thu thập (và KHÔNG BAO GIỜ thu thập)" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md mt-space-xs">
              <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-xs text-primary font-title-sm text-title-sm font-bold">
                  <Icon name="check_circle" size={20} />
                  <span>Dữ liệu CHÚNG TÔI THU THẬP:</span>
                </div>
                <ul className="list-none pl-0 flex flex-col gap-1.5 font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {COLLECT.map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              </div>
              <div className="p-space-md rounded-xl bg-surface-container flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-xs text-error font-title-sm text-title-sm font-bold">
                  <Icon name="block" size={20} />
                  <span>Dữ liệu TUYỆT ĐỐI KHÔNG THU THẬP:</span>
                </div>
                <ul className="list-none pl-0 flex flex-col gap-1.5 font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {NEVER.map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-space-sm scroll-mt-24" id="sec-3">
            <ArticleHead n="03" title="3. Mục đích sử dụng dữ liệu & Cam kết đạo đức AI" />
            <div className="p-space-lg rounded-xl bg-secondary-fixed text-on-secondary-fixed flex flex-col gap-space-xs shadow-sm">
              <div className="flex items-center gap-space-xs font-title-md text-title-md font-bold">
                <Icon name="auto_awesome" size={20} />
                <span>CAM KẾT VỀ AI</span>
              </div>
              <p className="font-body-md text-body-md leading-relaxed">
                &quot;Hệ thống chỉ đọc bình luận và tin nhắn qua API chính thức của Meta để gợi ý và
                hỗ trợ nhân viên trả lời. AI chỉ soạn câu; <strong>KHÔNG BAO GIỜ</strong> tự ẩn bình
                luận, không bán dữ liệu khách hàng cho bên thứ ba. [MẪU] Cam kết về huấn luyện mô
                hình chờ duyệt pháp lý.&quot;
              </p>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mt-2">
              Mục đích thu thập giới hạn ở các tác vụ:
            </p>
            <ul className="list-none pl-0 flex flex-col gap-2 font-body-sm text-body-sm text-on-surface-variant">
              {PURPOSES.map((p) => (
                <li key={p.text} className="flex items-start gap-2">
                  <Icon name={p.icon} size={18} className="text-primary" />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-space-sm scroll-mt-24" id="sec-4">
            <ArticleHead n="04" title="4. Quyền của chủ thể dữ liệu & Cơ chế xóa dữ liệu" />
            <LegalNote>
              Chủ sở hữu dữ liệu có quyền yêu cầu truy cập, chỉnh sửa, hạn chế xử lý hoặc xóa thông
              tin của mình. Để phục vụ việc xóa dữ liệu theo chính sách nền tảng Meta:
            </LegalNote>
            <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-sm">
              <span className="font-title-sm text-title-sm text-on-surface font-bold">
                Cơ chế Data Deletion Callback URL:
              </span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Endpoint:{' '}
                <code className="font-code-sm bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface">
                  [MẪU] https://…/data-deletion-callback
                </code>
                . Khi quản trị viên gỡ ứng dụng, hệ thống kiểm tra chữ ký, xóa dữ liệu liên quan và
                trả về URL theo dõi trạng thái kèm Confirmation Code dạng{' '}
                <code className="font-code-sm bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface">
                  DEL-FB-xxxxx
                </code>
                .
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-space-sm scroll-mt-24" id="sec-5">
            <ArticleHead n="05" title="5. Tiêu chuẩn lưu trữ & Mã hóa bảo mật" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
              {STORAGE.map((s) => (
                <div
                  key={s.title}
                  className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1"
                >
                  <Icon name={s.icon} size={24} className="text-primary" />
                  <span className="font-title-sm text-title-sm text-on-surface font-bold">
                    {s.title}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {s.body}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-space-sm scroll-mt-24" id="sec-6">
            <ArticleHead n="06" title="6. Cơ chế kiểm toán và chia sẻ bên thứ ba" />
            <LegalNote>
              Chúng tôi không cho thuê hoặc chuyển nhượng cơ sở dữ liệu khách hàng. Việc chia sẻ chỉ
              phát sinh với đối tác hạ tầng thiết yếu dưới thỏa thuận xử lý dữ liệu (DPA).{' '}
              {PENDING_LEGAL}
            </LegalNote>
          </section>

          <section className="flex flex-col gap-space-sm scroll-mt-24" id="sec-7">
            <ArticleHead n="07" title="7. Thông tin liên hệ Cán bộ bảo vệ dữ liệu (DPO)" />
            <LegalNote>
              Mọi thắc mắc về quyền bảo mật dữ liệu, thực hiện quyền chủ thể hoặc khiếu nại vui lòng
              gửi tới văn phòng DPO theo thông tin ở mục bên dưới.
            </LegalNote>
          </section>
        </article>
      </div>
    </section>
  );
}

/** Trang Quyền riêng tư & xóa dữ liệu: hai tab (Tra cứu / Chính sách) + khối liên hệ DPO. */
export function PrivacyView() {
  const [tab, setTab] = useState<Tab>('tracker');
  return (
    <>
      <section className="w-full bg-surface-container-high py-space-sm px-margin">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-on-primary">
              <Icon name="verified_user" size={16} />
            </span>
            <div className="flex flex-wrap items-center gap-x-space-sm gap-y-0 text-on-surface">
              <span className="font-label-md text-label-md font-bold uppercase tracking-wider text-primary">
                [MẪU] Chưa có chứng nhận tuân thủ
              </span>
              <span className="hidden sm:inline text-outline-variant">•</span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Chỉ dùng API chính thức của Meta; mô tả tuân thủ chờ duyệt pháp lý.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-space-md shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-lowest text-primary font-label-sm text-label-sm shadow-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-outline" />
              Meta Data Deletion Callback: [MẪU] chưa bật
            </span>
            <span className="text-on-surface-variant font-code-sm text-code-sm">
              [MẪU] phiên bản
            </span>
          </div>
        </div>
      </section>

      <section className="w-full bg-surface-container-low pt-space-xl pb-space-lg px-margin">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-space-lg">
            <div className="inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm uppercase tracking-wider mb-space-xs font-semibold">
              <Icon name="shield" size={14} />
              Cổng Pháp lý &amp; Quyền riêng tư Khách hàng
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
              Minh bạch Dữ liệu, Điều khoản &amp; Tra cứu Yêu cầu Xóa Dữ liệu
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-space-xs">
              Chúng tôi tôn trọng quyền riêng tư người dùng theo quy định của Meta và pháp luật Việt
              Nam về bảo vệ dữ liệu cá nhân. {PENDING_LEGAL}
            </p>
          </div>
          <div className="flex items-center gap-space-sm p-1 rounded-xl bg-surface-container w-fit shadow-sm">
            <button
              type="button"
              onClick={() => setTab('tracker')}
              className={cn(
                TAB_BASE,
                tab === 'tracker'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Icon name="manage_search" size={18} />
              <span>Tra cứu xóa dữ liệu (Deletion Tracker)</span>
              <span className="px-1.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm">
                Meta Review
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('policy')}
              className={cn(
                TAB_BASE,
                tab === 'policy'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Icon name="gavel" size={18} />
              <span>Chính sách quyền riêng tư &amp; Thỏa thuận DPA</span>
            </button>
          </div>
        </div>
      </section>

      {tab === 'tracker' ? <TrackerTab /> : <PolicyTab />}

      <section className="w-full bg-surface-container py-space-xl px-margin">
        <div className="max-w-7xl mx-auto flex flex-col gap-space-lg">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-sm">
            <div>
              <span className="font-label-sm text-label-sm text-primary uppercase font-bold tracking-wider">
                Văn phòng Tuân thủ &amp; Khiếu nại
              </span>
              <h2 className="font-headline-md text-headline-md text-on-surface font-bold mt-1">
                Đội ngũ Bảo vệ Dữ liệu (Data Protection Officer)
              </h2>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md">
              Giải quyết các phản ánh về an toàn thông tin, yêu cầu trích xuất hồ sơ và phối hợp
              kiểm toán nền tảng. [MẪU] Thông tin liên hệ chưa có.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
            {DPO_BOXES.map((b) => (
              <div
                key={b.title}
                className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-xs"
              >
                <Icon name={b.icon} size={28} className="text-primary" />
                <span className="font-title-sm text-title-sm text-on-surface font-bold mt-space-xs">
                  {b.title}
                </span>
                <span className="font-body-md text-body-md text-on-surface font-semibold">
                  {b.main}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">{b.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

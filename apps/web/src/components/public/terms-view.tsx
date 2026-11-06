'use client';

import { useState } from 'react';
import { cn } from '../../lib/cn';
import { Icon, type IconName } from '../ui/icon';
import { PENDING_LEGAL } from './pub-parts';

/** Điều khoản & DPA (design/stitch/terms-dpa.html). Nội dung điều khoản là bản nháp [MẪU] chờ duyệt pháp lý; mọi thông tin pháp nhân là [MẪU]. */

type View = 'all' | 'tos' | 'dpa';

type Clause = { label?: string; text: string };

const TOS_TOC: readonly string[] = [
  '1. Định nghĩa & Phạm vi áp dụng',
  '2. Tài khoản & Quyền Workspace',
  '3. Tuân thủ Meta & TikTok API',
  '4. Cơ chế AI & Giới hạn trách nhiệm',
  '5. Gói cước & Thanh toán QR',
  '6. Chấm dứt & Tạm ngưng dịch vụ',
];
const DPA_TOC: readonly string[] = [
  '7. Vai trò Kiểm soát vs Xử lý',
  '8. Dữ liệu xử lý & Mục đích',
  '9. Kỹ thuật an ninh',
  '10. Quyền chủ thể & Xóa dữ liệu',
  '11. Vi phạm dữ liệu (Data Breach)',
  '12. Chuyển giao & Bên thứ ba',
];

const TLDR: readonly { icon: IconName; tone: string; title: string; body: string }[] = [
  {
    icon: 'do_not_disturb_on',
    tone: 'bg-primary text-on-primary',
    title: '1. Không bao giờ tự ý đăng bài',
    body: 'Hệ thống chỉ lắng nghe bình luận và tin nhắn đến, không tạo bài viết mới hoặc can thiệp quảng cáo.',
  },
  {
    icon: 'visibility_off',
    tone: 'bg-primary text-on-primary',
    title: '2. Không chia sẻ dữ liệu cho đối thủ',
    body: 'Dữ liệu sản phẩm và hội thoại của mỗi shop được cách ly theo từng workspace.',
  },
  {
    icon: 'delete_sweep',
    tone: 'bg-secondary text-on-secondary',
    title: '3. Xóa dữ liệu khi bạn yêu cầu',
    body: 'Khi bạn gỡ quyền Fanpage hoặc gửi yêu cầu xóa, hệ thống xóa dữ liệu liên quan. [MẪU] Thời hạn chờ chốt.',
  },
  {
    icon: 'psychology',
    tone: 'bg-secondary text-on-secondary',
    title: '4. Kiến thức thuộc về Shop',
    body: 'Tài liệu bạn nạp vào cơ sở kiến thức là của bạn. [MẪU] Cam kết về huấn luyện mô hình chờ duyệt pháp lý.',
  },
];

const TOS_CLAUSES: readonly {
  id: string;
  code: string;
  title: string;
  clauses: readonly Clause[];
}[] = [
  {
    id: 'dieu-1',
    code: 'SEC-TOS-01',
    title: 'Điều 1. Định nghĩa & Phạm vi Áp dụng',
    clauses: [
      { label: '1.1. Giải thích từ ngữ:', text: PENDING_LEGAL },
      { label: '1.2. Thỏa thuận bắt buộc:', text: PENDING_LEGAL },
    ],
  },
  {
    id: 'dieu-2',
    code: 'SEC-TOS-02',
    title: 'Điều 2. Tài khoản Doanh nghiệp & Phân quyền Workspace',
    clauses: [
      {
        label: '2.1. Cấu trúc không gian làm việc (Workspace):',
        text: 'Mỗi tổ chức có một Workspace với nhiều người dùng (Chủ shop, Nhân viên). Chủ shop chịu trách nhiệm về quyền hạn phân bổ cho nhân viên của mình.',
      },
      {
        label: '2.2. Bảo mật khóa truy cập & Token:',
        text: 'Khách hàng bảo mật thông tin đăng nhập, bật xác thực 2 lớp (2FA) và không chia sẻ token của Meta cho bên thứ ba không được ủy quyền.',
      },
    ],
  },
];

const TOS_CLAUSES_LATE: readonly {
  id: string;
  code: string;
  title: string;
  clauses: readonly Clause[];
}[] = [
  {
    id: 'dieu-5',
    code: 'SEC-TOS-05',
    title: 'Điều 5. Gói cước, Hạn mức Xử lý & Thanh toán QR VietQR',
    clauses: [
      { label: '5.1. Mô hình tính phí:', text: PENDING_LEGAL },
      { label: '5.2. Thanh toán & Hóa đơn điện tử:', text: PENDING_LEGAL },
      { label: '5.3. Chính sách hoàn tiền:', text: PENDING_LEGAL },
    ],
  },
  {
    id: 'dieu-6',
    code: 'SEC-TOS-06',
    title: 'Điều 6. Chấm dứt & Tạm ngưng Cung cấp Dịch vụ',
    clauses: [
      {
        label: '6.1. Tự nguyện chấm dứt:',
        text: 'Khách hàng có thể hủy gói bất cứ lúc nào tại trang quản trị tài khoản.',
      },
      { label: '6.2. Quyền đình chỉ:', text: PENDING_LEGAL },
    ],
  },
];

const RETENTION: readonly {
  item: string;
  scope: string;
  purpose: string;
  enc: string;
  keep: string;
  masked?: boolean;
}[] = [
  {
    item: 'Định danh MXH (Meta PSID/TikTok OpenID)',
    scope: 'id, name, scoped_id',
    purpose: 'Định tuyến tin nhắn phản hồi đúng đối tượng',
    enc: '[MẪU]',
    keep: '[MẪU] Theo vòng đời tài khoản hoặc khi xóa',
  },
  {
    item: 'Bình luận & Lịch sử chat',
    scope: 'message_text, attachments, timestamp',
    purpose: 'Cung cấp ngữ cảnh cho AI soạn câu',
    enc: '[MẪU]',
    keep: '[MẪU] Thời hạn chờ chốt',
  },
  {
    item: 'Vector Embeddings (Kiến thức Shop)',
    scope: 'vector, đoạn kiến thức',
    purpose: 'Tìm kiếm ngữ nghĩa trong kho kiến thức',
    enc: '[MẪU]',
    keep: 'Xóa khi chủ shop xóa tài liệu',
  },
  {
    item: 'Thông tin Nhận dạng Cá nhân (PII)',
    scope: 'Số điện thoại, địa chỉ nhận hàng',
    purpose: 'Đối soát đơn / chuyển sang hệ thống bán hàng',
    enc: 'Che mờ (Masked)',
    keep: '[MẪU] Thời hạn chờ chốt',
    masked: true,
  },
];

const SECURITY: readonly { icon: IconName; tone: string; title: string; body: string }[] = [
  {
    icon: 'lock',
    tone: 'text-primary',
    title: 'Mã hóa đường truyền & lưu trữ',
    body: '[MẪU] Chi tiết chờ duyệt kỹ thuật.',
  },
  {
    icon: 'shield',
    tone: 'text-primary',
    title: 'Hạ tầng',
    body: '[MẪU] Nhà cung cấp và chứng chỉ hạ tầng chưa chốt.',
  },
  {
    icon: 'key',
    tone: 'text-secondary',
    title: 'Kiểm soát Truy cập theo vai trò',
    body: 'Phân quyền theo vai trò (Chủ shop / Nhân viên); thay đổi cấu hình được ghi nhật ký hoạt động.',
  },
];

const SUBPROCESSORS: readonly string[] = [
  '[MẪU] Nhà cung cấp hạ tầng máy chủ — chưa chốt.',
  '[MẪU] Nhà cung cấp mô hình ngôn ngữ — chưa chốt.',
  '[MẪU] Nhà cung cấp cơ sở dữ liệu vector — chưa chốt.',
];

const DIFF: readonly { tone: string; title: string; body: string }[] = [
  {
    tone: 'bg-secondary-fixed/40 text-on-secondary-fixed',
    title: 'Mục 3.2 (Mới): [MẪU]',
    body: '[MẪU] Nhật ký thay đổi chờ duyệt pháp lý.',
  },
  {
    tone: 'bg-surface-container-low text-on-surface',
    title: 'Mục 8.4 (Cập nhật): [MẪU]',
    body: '[MẪU] Nhật ký thay đổi chờ duyệt pháp lý.',
  },
  {
    tone: 'bg-secondary-fixed/40 text-on-secondary-fixed',
    title: 'Mục 10.3 (Mới): [MẪU]',
    body: '[MẪU] Nhật ký thay đổi chờ duyệt pháp lý.',
  },
];

const TOC_LINK =
  'px-2.5 py-1.5 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors flex items-center justify-between';
const BODY = 'space-y-space-sm font-body-md text-body-md text-on-surface leading-relaxed';
const ARTICLE = 'bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col';
const SOON_BTN = 'cursor-not-allowed opacity-70';

function TocGroup({
  id,
  title,
  tone,
  items,
  first,
}: {
  id: string;
  title: string;
  tone: string;
  items: readonly string[];
  first: number;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1',
        first > 1 && 'pt-2 border-t border-surface-container-low',
      )}
      id={id}
    >
      <div
        className={cn(
          'px-2 py-1 font-label-sm text-label-sm font-bold uppercase tracking-wider rounded',
          tone,
        )}
      >
        {title}
      </div>
      <nav className="flex flex-col gap-0.5 mt-1 font-body-sm text-body-sm">
        {items.map((label, i) => (
          <a key={label} className={TOC_LINK} href={`#dieu-${first + i}`}>
            <span>{label}</span>
            <Icon name="chevron_right" size={14} className="opacity-40" />
          </a>
        ))}
      </nav>
    </div>
  );
}

function ClauseArticle({
  data,
  tone,
}: {
  data: { id: string; code: string; title: string; clauses: readonly Clause[] };
  tone: string;
}) {
  return (
    <article className={cn(ARTICLE, 'gap-space-sm')} id={data.id}>
      <ArticleTitle code={data.code} title={data.title} tone={tone} />
      <div className={BODY}>
        {data.clauses.map((c) => (
          <p key={c.text + (c.label ?? '')}>
            {c.label ? <strong>{c.label}</strong> : null} {c.text}
          </p>
        ))}
      </div>
    </article>
  );
}

function ArticleTitle({ code, title, tone }: { code: string; title: string; tone: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className={cn('font-title-md text-title-md font-bold', tone)}>{title}</h3>
      <span className="font-code-sm text-code-sm text-outline">{code}</span>
    </div>
  );
}

function Callout({
  icon,
  title,
  body,
  box,
  head,
  text,
}: {
  icon: IconName;
  title: string;
  body: string;
  box: string;
  head: string;
  text: string;
}) {
  return (
    <div className={cn('p-space-md rounded-lg flex flex-col gap-space-xs', box)}>
      <div className={cn('flex items-center gap-2 font-title-sm text-title-sm font-bold', head)}>
        <Icon name={icon} size={20} />
        <span>{title}</span>
      </div>
      <p className={cn('font-body-md text-body-md', text)}>{body}</p>
    </div>
  );
}

function PartHeading({
  tone,
  bar,
  title,
  sub,
}: {
  tone: string;
  bar: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className={cn('flex items-center gap-space-sm pb-2 border-b-2', tone)}>
      <span className={cn('w-3 h-7 rounded-sm inline-block', bar)} />
      <div className="flex flex-col">
        <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
          {title}
        </h2>
        {sub ? (
          <span className="font-label-sm text-label-sm text-on-surface-variant">{sub}</span>
        ) : null}
      </div>
    </div>
  );
}

function TosPart() {
  return (
    <section className="flex flex-col gap-space-lg" id="legal-section-tos">
      <PartHeading
        tone="border-primary"
        bar="bg-primary"
        title="Phần I: Điều khoản Dịch vụ Chung (Terms of Service)"
      />
      {TOS_CLAUSES.map((d) => (
        <ClauseArticle key={d.id} data={d} tone="text-primary" />
      ))}
      <article className={cn(ARTICLE, 'gap-space-md')} id="dieu-3">
        <ArticleTitle
          code="SEC-TOS-03"
          title="Điều 3. Tuân thủ Chính sách Meta Platforms & TikTok API"
          tone="text-primary"
        />
        <Callout
          icon="policy"
          title="Thông báo về Meta App Review"
          body="Hệ thống hoạt động trong khuôn khổ API chính thức của Meta, KHÔNG sử dụng kỹ thuật thu thập dữ liệu trái phép (scraping). [MẪU] Trạng thái duyệt Meta App Review chưa có."
          box="bg-surface-container-low text-on-surface"
          head="text-primary"
          text="text-on-surface-variant"
        />
        <div className={BODY}>
          <p>
            <strong>3.1. Cửa sổ nhắn tin 24 giờ:</strong> Khách hàng chấp hành quy chuẩn 24 giờ của
            Meta Messenger Platform; hệ thống không gửi tin ngoài khung 24 giờ khi không đủ điều
            kiện theo chính sách của Meta.
          </p>
          <p>
            <strong>3.2. Cấm hành vi Spam &amp; Tin nhắn Rác:</strong> {PENDING_LEGAL}
          </p>
          <p>
            <strong>3.3. Tự động ngắt kết nối:</strong> Nếu người dùng thu hồi quyền trong cài đặt
            ứng dụng của Facebook, hệ thống sẽ hủy đăng ký kết nối. [MẪU] Thời hạn chờ chốt.
          </p>
        </div>
      </article>
      <article className={cn(ARTICLE, 'gap-space-md')} id="dieu-4">
        <ArticleTitle
          code="SEC-TOS-04"
          title="Điều 4. Cơ chế Vận hành AI, Kiến thức & Giới hạn Trách nhiệm"
          tone="text-primary"
        />
        <Callout
          icon="auto_awesome"
          title="Kiến trúc AI & Điểm Tin cậy (Confidence Score)"
          body="AI chỉ truy vấn trong dữ liệu do chính Chủ shop nạp vào (sản phẩm, bảng giá, chính sách). Độ tin cậy do hệ thống tính; khi chưa đủ chắc chắn, bản nháp được chuyển cho nhân viên thay vì tự gửi."
          box="bg-secondary-fixed/30 text-on-secondary-fixed"
          head="text-secondary"
          text="text-on-secondary-fixed"
        />
        <div className={BODY}>
          <p>
            <strong>4.1. Bản chất xác suất của AI:</strong> Mô hình ngôn ngữ có thể đôi khi sinh câu
            trả lời chưa tối ưu. Khách hàng có toàn quyền rà soát và đặt quy tắc duyệt tay trước khi
            gửi.
          </p>
          <p>
            <strong>4.2. Miễn trừ trách nhiệm:</strong> {PENDING_LEGAL}
          </p>
        </div>
      </article>
      {TOS_CLAUSES_LATE.map((d) => (
        <ClauseArticle key={d.id} data={d} tone="text-primary" />
      ))}
    </section>
  );
}

function DpaPart() {
  return (
    <section className="flex flex-col gap-space-lg pt-space-lg" id="legal-section-dpa">
      <PartHeading
        tone="border-secondary"
        bar="bg-secondary"
        title="Phần II: Thỏa thuận Xử lý Dữ liệu (Data Processing Agreement - DPA)"
        sub="Theo quy định pháp luật Việt Nam về bảo vệ dữ liệu cá nhân & chuẩn dữ liệu Meta. [MẪU] chờ duyệt pháp lý"
      />
      <article className={cn(ARTICLE, 'gap-space-sm')} id="dieu-7">
        <ArticleTitle
          code="SEC-DPA-07"
          title="Điều 7. Phân định Vai trò Pháp lý (Kiểm soát vs Xử lý Dữ liệu)"
          tone="text-secondary"
        />
        <div className={BODY}>
          <p>{PENDING_LEGAL}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-2">
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1">
              <span className="font-title-sm text-title-sm text-primary font-bold">
                Khách hàng (Bên kiểm soát Dữ liệu - Data Controller)
              </span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Là chủ sở hữu Fanpage và cơ sở khách hàng. Khách hàng quyết định mục đích, phương
                tiện xử lý và đảm bảo việc thu thập dữ liệu cá nhân có sự đồng ý phù hợp.
              </p>
            </div>
            <div className="p-space-md rounded-lg bg-secondary-fixed/40 flex flex-col gap-1">
              <span className="font-title-sm text-title-sm text-secondary font-bold">
                Hệ thống (Bên xử lý Dữ liệu - Data Processor)
              </span>
              <p className="font-body-sm text-body-sm text-on-secondary-fixed">
                Chỉ xử lý dữ liệu thay mặt và theo cấu hình của Khách hàng; không dùng dữ liệu này
                cho mục đích kinh doanh riêng hay bán cho đơn vị quảng cáo.
              </p>
            </div>
          </div>
        </div>
      </article>

      <article className={cn(ARTICLE, 'gap-space-md')} id="dieu-8">
        <ArticleTitle
          code="SEC-DPA-08"
          title="Điều 8. Các Loại Dữ liệu Được Xử lý & Ma trận Thời hạn Lưu trữ"
          tone="text-secondary"
        />
        <div className="p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-sm">
          <Icon name="encrypted" size={20} className="text-primary flex-shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="font-title-sm text-title-sm text-on-surface font-bold">
              Cơ chế che số điện thoại & Chống cướp đơn
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Hệ thống che số điện thoại trong dữ liệu gửi cho AI và nhật ký; bình luận chứa số điện
              thoại được gắn cờ để nhân viên xử lý (AI không tự ẩn bình luận).
            </span>
          </div>
        </div>
        <p className="font-body-md text-body-md text-on-surface">
          Chi tiết các loại dữ liệu, cơ chế kỹ thuật và thời hạn lưu trữ ở bảng ma trận dưới đây:
        </p>
        <div className="overflow-x-auto rounded-lg bg-surface-container-low p-1">
          <table className="w-full text-left font-body-sm text-body-sm">
            <thead>
              <tr className="bg-surface-container-high text-on-surface font-title-sm text-title-sm">
                <th className="p-3 rounded-l-md">Hạng mục dữ liệu</th>
                <th className="p-3">Phạm vi trường dữ liệu</th>
                <th className="p-3">Mục đích xử lý kỹ thuật</th>
                <th className="p-3">Mã hóa tại chỗ</th>
                <th className="p-3 rounded-r-md">Thời hạn lưu giữ</th>
              </tr>
            </thead>
            <tbody className="text-on-surface-variant divide-y-0">
              {RETENTION.map((r) => (
                <tr key={r.item} className="hover:bg-surface-container/60 transition-colors">
                  <td className="p-3 font-semibold text-on-surface">{r.item}</td>
                  <td className="p-3 font-code-sm text-code-sm">{r.scope}</td>
                  <td className="p-3">{r.purpose}</td>
                  <td className="p-3">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded font-code-sm text-code-sm',
                        r.masked
                          ? 'bg-secondary-fixed text-on-secondary-fixed font-bold'
                          : 'bg-surface-container',
                      )}
                    >
                      {r.enc}
                    </span>
                  </td>
                  <td className="p-3">{r.keep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className={cn(ARTICLE, 'gap-space-sm')} id="dieu-9">
        <ArticleTitle
          code="SEC-DPA-09"
          title="Điều 9. Tiêu chuẩn Kỹ thuật & An ninh Bảo mật Đa Tầng"
          tone="text-secondary"
        />
        <div className={BODY}>
          <p>Biện pháp an ninh thông tin nhằm phòng ngừa rủi ro rò rỉ dữ liệu: {PENDING_LEGAL}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md pt-1">
            {SECURITY.map((s) => (
              <div
                key={s.title}
                className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1"
              >
                <div className={cn('flex items-center gap-1.5 font-bold', s.tone)}>
                  <Icon name={s.icon} size={18} />
                  <span>{s.title}</span>
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant">{s.body}</span>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className={cn(ARTICLE, 'gap-space-md')} id="dieu-10">
        <ArticleTitle
          code="SEC-DPA-10"
          title="Điều 10. Quyền của Chủ thể Dữ liệu & Cơ chế Xóa Dữ liệu (Deletion Tracker)"
          tone="text-secondary"
        />
        <div className={BODY}>
          <p>
            <strong>10.1. Tôn trọng các quyền của chủ thể dữ liệu:</strong> quyền được biết, đồng ý,
            truy cập, rút lại sự đồng ý, xóa dữ liệu và khiếu nại. {PENDING_LEGAL}
          </p>
          <p>
            <strong>
              10.2. Quy trình Xóa Dữ liệu tự động của Meta (User Data Deletion Callback):
            </strong>{' '}
            Khi người dùng gỡ ứng dụng khỏi tài khoản Facebook, Meta gửi yêu cầu có chữ ký tới
            Endpoint của hệ thống, hệ thống sẽ:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-on-surface-variant font-body-md text-body-md">
            <li>Xóa các bản ghi trò chuyện gắn với User ID đó.</li>
            <li>
              Sinh mã biên nhận (Confirmation Code) và URL kiểm tra trạng thái xóa trả về cho Meta.
            </li>
            <li>Chủ thể dữ liệu truy cập URL này để xác minh quá trình xóa đã hoàn tất.</li>
          </ul>
        </div>
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-sm">
          <div className="flex items-center justify-between">
            <span className="font-title-sm text-title-sm text-on-surface font-bold flex items-center gap-1.5">
              <Icon name="find_in_page" size={18} className="text-primary" />
              Tra Cứu Trạng Thái Xóa Dữ Liệu (Meta Deletion Verification Portal)
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Sắp có</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              className="w-full sm:flex-1 px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
              placeholder="Nhập mã xác nhận (Ví dụ: DEL-2024-8849-VN)"
              type="text"
              aria-label="Mã xác nhận xóa dữ liệu"
              aria-disabled="true"
              readOnly
            />
            <button
              type="button"
              aria-disabled="true"
              title="Sắp có"
              tabIndex={-1}
              className={cn(
                'w-full sm:w-auto px-space-lg py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold flex items-center justify-center gap-1',
                SOON_BTN,
              )}
            >
              <Icon name="search" size={16} />
              <span>Kiểm tra</span>
            </button>
          </div>
        </div>
      </article>

      <article className={cn(ARTICLE, 'gap-space-sm')} id="dieu-11">
        <ArticleTitle
          code="SEC-DPA-11"
          title="Điều 11. Xử lý Sự cố Vi phạm Dữ liệu (Data Breach Notification)"
          tone="text-secondary"
        />
        <div className={BODY}>
          <p>
            <strong>11.1. Mốc thời gian thông báo:</strong> [MẪU] Thời hạn chờ chốt. {PENDING_LEGAL}
          </p>
          <p>
            <strong>11.2. Báo cáo khắc phục:</strong> Báo cáo sự cố gồm: (a) Mô tả bản chất vi phạm
            và các bên bị ảnh hưởng; (b) Biện pháp kỹ thuật khoanh vùng sự cố; (c) Khuyến nghị cho
            Shop để bảo vệ khách hàng cuối.
          </p>
        </div>
      </article>

      <article className={cn(ARTICLE, 'gap-space-sm')} id="dieu-12">
        <ArticleTitle
          code="SEC-DPA-12"
          title="Điều 12. Chuyển giao Dữ liệu ra Nước ngoài & Bên thứ ba Xử lý phụ"
          tone="text-secondary"
        />
        <div className={BODY}>
          <p>
            <strong>12.1. Danh mục Bên xử lý phụ (Sub-processors):</strong>
          </p>
          <ul className="list-disc pl-5 space-y-1 text-on-surface-variant font-body-md text-body-md">
            {SUBPROCESSORS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p>
            <strong>12.2. Hồ sơ đánh giá tác động:</strong> {PENDING_LEGAL}
          </p>
        </div>
      </article>
    </section>
  );
}

function CompanyBlock() {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-space-xl shadow-md flex flex-col gap-space-lg">
      <div className="flex items-center justify-between pb-space-sm border-b border-surface-container-high">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary">
            <Icon name="corporate_fare" size={24} />
          </div>
          <div className="flex flex-col">
            <h3 className="font-title-md text-title-md text-on-surface font-bold uppercase tracking-wide">
              Thông Tin Đại Diện Pháp Nhân &amp; Cam Kết Thực Thi
            </h3>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              [MẪU] Thông tin pháp nhân chưa có
            </span>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-code-sm text-code-sm font-semibold">
          MST: [MẪU] —
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg font-body-sm text-body-sm">
        <div className="flex flex-col gap-2 text-on-surface-variant">
          <span className="font-bold text-on-surface text-title-sm font-title-sm">
            ĐƠN VỊ PHÁT HÀNH NỀN TẢNG
          </span>
          <p className="font-semibold text-on-surface">[MẪU] Tên công ty</p>
          <p>
            <strong>Trụ sở chính:</strong> [MẪU] —
          </p>
          <p>
            <strong>Giấy phép ĐKKD:</strong> [MẪU] —
          </p>
          <p>
            <strong>Đại diện pháp luật:</strong> [MẪU] —
          </p>
          <p>
            <strong>Bộ phận Tuân thủ (Compliance):</strong> [MẪU] —
          </p>
        </div>
        <div className="flex flex-col justify-between p-space-md rounded-lg bg-surface-container-low">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase font-bold text-primary">
              Chứng thư Số
            </span>
            <span className="flex items-center gap-1 font-label-sm text-label-sm text-secondary font-semibold">
              <Icon name="done_all" size={14} />
              [MẪU] Chưa ký điện tử
            </span>
          </div>
          <div className="my-3 p-3 rounded-lg bg-surface-container-lowest flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-primary flex items-center justify-center text-primary flex-shrink-0 font-bold text-xs text-center leading-tight">
              DẤU
              <br />
              [MẪU]
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-on-surface text-body-sm font-body-sm">
                [MẪU] Tên công ty
              </span>
              <span className="font-code-sm text-code-sm text-outline">Ký ngày: [MẪU] —</span>
              <span className="font-label-sm text-label-sm text-primary">
                Thuật toán ký: [MẪU] —
              </span>
            </div>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            [MẪU] Giá trị pháp lý của văn bản điện tử chờ duyệt pháp lý.
          </p>
        </div>
      </div>
      <div className="pt-space-sm border-t border-surface-container-high flex flex-col sm:flex-row items-center justify-between gap-space-sm">
        <span className="font-body-sm text-body-sm text-on-surface-variant text-center sm:text-left">
          Bạn có câu hỏi hoặc cần ký phụ lục thỏa thuận DPA song phương riêng biệt (Enterprise DPA)?
        </span>
        <span
          aria-disabled="true"
          title="Sắp có"
          className={cn(
            'inline-flex items-center gap-1 px-space-md py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold',
            SOON_BTN,
          )}
        >
          <Icon name="mail" size={16} />
          <span>Liên hệ Đội ngũ Pháp chế</span>
        </span>
      </div>
    </section>
  );
}

function DiffModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-inverse-surface/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nhật ký thay đổi phiên bản"
    >
      <div className="bg-surface-container-lowest rounded-xl max-w-2xl w-full p-space-xl shadow-xl flex flex-col gap-space-md max-h-[870px] overflow-y-auto">
        <div className="flex items-center justify-between pb-space-sm border-b border-surface-container-high">
          <div className="flex items-center gap-space-xs text-secondary">
            <Icon name="history_toggle_off" size={24} />
            <h3 className="font-title-md text-title-md text-on-surface font-bold">
              Nhật ký Thay đổi Phiên bản (v2.3 → v2.4)
            </h3>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-container-low text-on-surface-variant"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
          <p className="font-semibold text-on-surface">
            [MẪU] Các thay đổi trọng yếu giữa hai phiên bản (dữ liệu mẫu):
          </p>
          {DIFF.map((d) => (
            <div key={d.title} className={cn('p-space-sm rounded-lg flex flex-col gap-1', d.tone)}>
              <span className="font-bold">{d.title}</span>
              <span>{d.body}</span>
            </div>
          ))}
        </div>
        <div className="pt-space-sm flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}

const VIEW_TABS: readonly { key: View; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'tos', label: 'Chỉ Điều khoản (TOS)' },
  { key: 'dpa', label: 'Chỉ Thỏa thuận DPA' },
];

/** Trang Điều khoản & DPA: thanh tiêu đề + bộ lọc, mục lục, tóm tắt, hai phần văn bản, khối pháp nhân. */
export function TermsView() {
  const [view, setView] = useState<View>('all');
  const [diffOpen, setDiffOpen] = useState(false);
  return (
    <>
      <section className="w-full bg-surface-container-lowest shadow-sm relative z-30">
        <div className="max-w-7xl mx-auto px-margin py-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              <span>Trung tâm Tuân thủ &amp; Pháp lý</span>
              <span className="text-outline">/</span>
              <span className="text-primary font-bold">Văn bản Pháp chế Hợp nhất</span>
            </div>
            <div className="flex items-center gap-space-sm flex-wrap">
              <h1 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">
                Điều khoản Dịch vụ &amp; Thỏa thuận DPA
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-code-sm text-code-sm font-semibold">
                [MẪU] Bản nháp (Hiệu lực: chưa có)
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">
                <Icon name="verified_user" size={14} />
                <span>Chờ duyệt pháp lý</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-space-sm flex-wrap">
            <div className="inline-flex rounded-lg bg-surface-container-low p-1 gap-1">
              {VIEW_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setView(t.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-md font-label-md text-label-md transition-all',
                    view === t.key
                      ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="h-6 w-px bg-surface-container-high hidden sm:block" />
            <div className="flex items-center gap-space-xs">
              <button
                type="button"
                onClick={() => window.print()}
                title="In văn bản"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md transition-colors"
              >
                <Icon name="print" size={16} />
                <span className="hidden lg:inline">In</span>
              </button>
              <button
                type="button"
                aria-disabled="true"
                title="Sắp có"
                tabIndex={-1}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md',
                  SOON_BTN,
                )}
              >
                <Icon name="download" size={16} />
                <span className="hidden lg:inline">PDF Ký số</span>
              </button>
              <button
                type="button"
                onClick={() => setDiffOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-label-md text-label-md transition-colors shadow-sm"
              >
                <Icon name="compare_arrows" size={16} />
                <span>So sánh v2.3</span>
              </button>
            </div>
          </div>
        </div>
      </section>
      {diffOpen ? <DiffModal onClose={() => setDiffOpen(false)} /> : null}

      <div className="max-w-7xl mx-auto px-margin py-space-xl w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
          <aside className="lg:col-span-4 xl:col-span-3 sticky top-24 self-start flex flex-col gap-space-md">
            <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-md">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                <span className="font-title-sm text-title-sm text-on-surface font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Icon name="toc" size={18} className="text-primary" />
                  Mục Lục Điều Khoản
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">12 Điều</span>
              </div>
              {view !== 'dpa' ? (
                <TocGroup
                  id="toc-group-tos"
                  title="Phần I: Điều khoản Dịch vụ (TOS)"
                  tone="text-primary bg-surface-container-low"
                  items={TOS_TOC}
                  first={1}
                />
              ) : null}
              {view !== 'tos' ? (
                <TocGroup
                  id="toc-group-dpa"
                  title="Phần II: Thỏa thuận DPA"
                  tone="text-secondary bg-secondary-fixed/50"
                  items={DPA_TOC}
                  first={7}
                />
              ) : null}
              <div className="mt-2 p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-primary">
                  <Icon name="verified" size={18} />
                  <span className="font-label-sm text-label-sm font-bold">Kiểm chứng Tuân thủ</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Văn bản hướng tới chính sách nhà phát triển của Meta và quy định pháp luật Việt
                  Nam về bảo vệ dữ liệu cá nhân. {PENDING_LEGAL}
                </p>
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Bộ phận Bảo vệ Dữ liệu (DPO)
              </span>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-sm">
                  <Icon name="security" size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="font-title-sm text-title-sm text-on-surface font-bold">
                    [MẪU] Tên cán bộ DPO
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    [MẪU] email DPO
                  </span>
                </div>
              </div>
              <span className="font-label-sm text-label-sm text-outline">
                Đường dây nóng khiếu nại bảo mật: [MẪU] —
              </span>
            </div>
          </aside>

          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-space-xl">
            <div className="rounded-xl p-space-lg bg-surface-container-lowest shadow-md flex flex-col gap-space-md">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-surface-container-high">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary">
                    <Icon name="lightbulb" size={20} />
                  </div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Tóm Tắt Nhanh Dành Cho Chủ Doanh Nghiệp &amp; Nhà Bán Hàng (TL;DR)
                  </h2>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
                  Cam kết 4 Không &amp; 4 Đảm bảo
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                {TLDR.map((t) => (
                  <div
                    key={t.title}
                    className="p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-sm"
                  >
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                        t.tone,
                      )}
                    >
                      <Icon name={t.icon} size={16} />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-title-sm text-title-sm text-on-surface font-bold">
                        {t.title}
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        {t.body}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {view !== 'dpa' ? <TosPart /> : null}
            {view !== 'tos' ? <DpaPart /> : null}
            <CompanyBlock />
          </div>
        </div>
      </div>
    </>
  );
}

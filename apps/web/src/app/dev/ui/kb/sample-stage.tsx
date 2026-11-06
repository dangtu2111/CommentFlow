import { Icon } from '../../../../components/ui/icon';
import { Pill } from '../../../../components/ui/pill';

/**
 * Các khối "ô nội dung" của design/stitch/knowledge-base.html chưa có chức năng thật (Shopify, nguồn URL, sản phẩm
 * trích xuất, Live Playground). Chỉ dựng ở route DEV với chữ MẪU của HTML; nút chỉ để xem bố cục (vô hiệu, "Sắp có").
 * Ảnh sản phẩm trong HTML là ảnh CDN ngoài → thay bằng khung trống (CSP, không gọi CDN).
 */
const card = 'space-y-space-lg rounded-xl bg-surface-container-lowest p-space-xl shadow-sm';
const soft =
  'flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-surface-container px-3 py-2 font-title-sm text-title-sm text-on-surface opacity-60 shadow-sm';
const strong =
  'flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary-container px-3 py-2 font-title-sm text-title-sm text-on-primary opacity-60 shadow-sm';
const stat = 'flex items-center gap-space-md rounded-lg bg-surface-container-low p-space-md';

const URL_ROWS = [
  {
    url: 'https://annhienstore.vn/chinh-sach-doi-tra',
    kind: 'Đổi trả hàng',
    status: 'Đã đọc (100%)',
    updated: '2 giờ trước',
    pending: false,
  },
  {
    url: 'https://annhienstore.vn/phi-van-chuyen',
    kind: 'Vận chuyển',
    status: 'Đã đọc (100%)',
    updated: 'Hôm qua',
    pending: false,
  },
  {
    url: 'https://annhienstore.vn/huong-dan-chon-size',
    kind: 'FAQ & Size',
    status: 'Có thay đổi chờ duyệt',
    updated: '35 phút trước',
    pending: true,
  },
] as const;

export function KbSampleStage() {
  return (
    <div className="tw space-y-space-xl">
      <p className="rounded-lg bg-tertiary-fixed px-space-md py-space-sm font-label-md text-label-md text-on-tertiary-fixed">
        [MẪU] Mọi số liệu, tên shop và đường dẫn bên dưới là dữ liệu mẫu — không phải số liệu thật.
      </p>
      <div className="flex items-center justify-between gap-space-md rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tertiary-fixed text-on-tertiary-fixed">
            <Icon name="sync_problem" size={20} />
          </div>
          <div>
            <div className="font-title-sm text-title-sm text-on-surface">
              Có 1 thay đổi từ nguồn website chờ duyệt
            </div>
            <div className="font-body-sm text-body-sm text-on-surface-variant">
              URL: annhienstore.vn/huong-dan-chon-size đã bổ sung bảng số đo váy suông hè 2025.
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="cursor-not-allowed rounded-lg bg-surface-container-lowest px-3 py-1.5 font-title-sm text-title-sm text-primary opacity-60 shadow-sm"
            aria-disabled="true"
            title="Sắp có"
          >
            Xem so sánh
          </span>
          <span
            className="cursor-not-allowed rounded-lg bg-primary-container px-3 py-1.5 font-title-sm text-title-sm text-on-primary opacity-60 shadow-sm"
            aria-disabled="true"
            title="Sắp có"
          >
            Chấp nhận
          </span>
        </div>
      </div>

      <section className={card}>
        <div className="flex flex-col justify-between gap-space-md sm:flex-row sm:items-center">
          <div className="flex items-center gap-space-md">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary-container">
              <Icon name="shopping_cart" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-title-md text-title-md text-on-surface">
                  Kết nối Shopify Store
                </span>
                <Pill tone="primary">Đã kết nối</Pill>
              </div>
              <div className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                annhien-fashion.myshopify.com • Đồng bộ lần cuối lúc 10:15 hôm nay (Thành công)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={strong} aria-disabled="true" title="Sắp có">
              <Icon name="sync" size={16} />
              <span>Đồng bộ ngay</span>
            </span>
            <span className={soft} aria-disabled="true" title="Sắp có">
              <Icon name="tune" size={16} />
              <span>Cài đặt phạm vi</span>
            </span>
            <span
              className="cursor-not-allowed rounded-lg p-2 text-error opacity-60"
              aria-disabled="true"
              title="Ngắt kết nối"
            >
              <Icon name="link_off" size={16} />
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
          {[
            ['checkroom', 'text-primary', '128', 'Sản phẩm đã nạp vào Vector DB'],
            ['verified_user', 'text-secondary', '4', 'Chính sách bán hàng đồng bộ'],
            ['pages', 'text-tertiary', '2', 'Trang blog & Giới thiệu shop'],
          ].map(([icon, tone, value, label]) => (
            <div key={label} className={stat}>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-lowest shadow-sm ${tone}`}
              >
                <Icon name={icon as 'pages'} size={20} />
              </div>
              <div>
                <div className="font-headline-md text-headline-md text-on-surface">{value}</div>
                <div className="font-label-sm text-label-sm text-on-surface-variant">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-col justify-between gap-space-md sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-primary">
              <Icon name="language" size={20} />
            </span>
            <div>
              <div className="font-title-md text-title-md text-on-surface">
                Website & Nguồn URL Web Crawling
              </div>
              <div className="font-body-sm text-body-sm text-on-surface-variant">
                Tự động cập nhật thông tin trang tĩnh theo chu kỳ 6 giờ/lần
              </div>
            </div>
          </div>
          <span className={`${soft} self-start sm:self-auto`} aria-disabled="true" title="Sắp có">
            <Icon name="add_link" size={16} />
            <span>+ Thêm liên kết mới</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                <th className="rounded-l-lg px-space-md py-space-sm">Địa chỉ URL</th>
                <th className="px-space-md py-space-sm">Phân loại</th>
                <th className="px-space-md py-space-sm">Trạng thái AI</th>
                <th className="px-space-md py-space-sm">Cập nhật</th>
                <th className="rounded-r-lg px-space-md py-space-sm text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {URL_ROWS.map((row) => (
                <tr
                  key={row.url}
                  className={`transition-colors hover:bg-surface-container-low ${row.pending ? 'bg-tertiary-fixed/20' : ''}`}
                >
                  <td className="px-space-md py-space-md">
                    <div className="flex items-center gap-2">
                      <span className={row.pending ? 'text-tertiary' : 'text-on-surface-variant'}>
                        <Icon name={row.pending ? 'priority_high' : 'link'} size={16} />
                      </span>
                      <span className="font-title-sm text-title-sm text-primary">{row.url}</span>
                    </div>
                  </td>
                  <td className="px-space-md py-space-md">
                    <Pill tone={row.pending ? 'accent' : 'surface'} shape="box">
                      {row.kind}
                    </Pill>
                  </td>
                  <td className="px-space-md py-space-md">
                    {row.pending ? (
                      <Pill tone="warn" className="font-semibold">
                        {row.status}
                      </Pill>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span className="font-body-sm text-body-sm text-on-surface">
                          {row.status}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-space-md py-space-md font-body-sm text-body-sm text-on-surface-variant">
                    {row.updated}
                  </td>
                  <td className="px-space-md py-space-md text-right">
                    {row.pending ? (
                      <span
                        className="cursor-not-allowed rounded bg-primary-container px-2 py-1 font-label-sm text-label-sm text-on-primary opacity-60"
                        aria-disabled="true"
                        title="Sắp có"
                      >
                        So sánh
                      </span>
                    ) : (
                      <span className="inline-flex gap-1 text-on-surface-variant opacity-60">
                        <Icon name="refresh" size={16} />
                        <Icon name="delete" size={16} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} !space-y-space-md`}>
        <div className="flex flex-col justify-between gap-space-sm sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-primary">
                <Icon name="inventory" size={20} />
              </span>
              <span className="font-title-md text-title-md text-on-surface">
                Xem trước Sản phẩm trích xuất (Bảng mini)
              </span>
            </div>
            <div className="font-body-sm text-body-sm text-on-surface-variant">
              Dữ liệu thực thể được ánh xạ vào RAG. Trường khóa sẽ đồng bộ tự động từ Shopify.
            </div>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Hiển thị 1 trên 128 sản phẩm
          </span>
        </div>
        <div className="space-y-space-md rounded-xl bg-surface-container-low p-space-lg">
          <div className="flex flex-col justify-between gap-space-lg md:flex-row md:items-start">
            <div className="flex items-start gap-space-md">
              <div className="h-24 w-20 shrink-0 rounded-lg bg-surface-container shadow-sm" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-title-md text-title-md text-on-surface">
                    Váy hoa nhí vintage tay bồng
                  </span>
                  <Pill tone="primary">Đang bán</Pill>
                </div>
                <div className="font-body-sm text-body-sm text-on-surface-variant">
                  SKU: AN-VH2025-01 • Danh mục: Váy thiết kế hè
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="flex items-center gap-1 rounded bg-surface-container-lowest px-2.5 py-1 text-on-surface shadow-sm">
                    <span className="font-title-sm text-title-sm font-bold text-primary">
                      349.000đ
                    </span>
                    <span
                      className="text-on-surface-variant"
                      title="Đồng bộ từ Shopify (Bị khóa sửa)"
                    >
                      <Icon name="lock" size={14} />
                    </span>
                  </div>
                  <div className="rounded bg-surface-container-lowest px-2.5 py-1 font-body-sm text-body-sm text-on-surface shadow-sm">
                    Tồn kho: <strong>42 chiếc</strong>
                  </div>
                  <div className="rounded bg-surface-container-lowest px-2.5 py-1 font-body-sm text-body-sm text-on-surface shadow-sm">
                    Biến thể: <strong>S, M, L (3 phân loại)</strong>
                  </div>
                </div>
              </div>
            </div>
            <Pill tone="accent" className="shrink-0 self-end px-2.5 py-1 md:self-auto">
              <Icon name="auto_awesome" size={14} />
              Vector Embeddings: Đã tạo
            </Pill>
          </div>
          <div className="space-y-1 rounded-lg bg-surface-container-lowest p-space-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-title-sm text-title-sm text-secondary">
                <Icon name="psychology" size={16} />
                <span>Ghi chú riêng cho AI (Agent Hint Override)</span>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Áp dụng tức thì cho kịch bản tư vấn
              </span>
            </div>
            <textarea
              className="w-full resize-none rounded-lg bg-surface-container-low p-2.5 font-body-sm text-body-sm text-on-surface focus:outline-none"
              rows={2}
              readOnly
              aria-label="[MẪU] Ghi chú riêng cho AI"
              defaultValue="Sản phẩm chủ đạo mùa hè, tặng kèm scrunchies cùng màu cho mỗi đơn đặt trong tuần này. Nếu khách hỏi chiều cao dưới 1m58 thì ưu tiên khuyên lấy size S để tôn dáng."
            />
          </div>
        </div>
      </section>

      <section className={`${card} !space-y-space-md`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-on-secondary">
              <Icon name="science" size={18} />
            </div>
            <div>
              <div className="font-title-md text-title-md text-on-surface">
                Widget Chạy thử nghiệm AI (Live Playground)
              </div>
              <div className="font-body-sm text-body-sm text-on-surface-variant">
                Mô phỏng tức thì phản hồi của bot với cơ sở tri thức hiện tại
              </div>
            </div>
          </div>
          <span className="rounded bg-surface-container px-2 py-0.5 font-code-sm text-code-sm text-on-surface-variant">
            LLM: Gemini 1.5 Pro (Temperature: 0.2)
          </span>
        </div>
        <div className="space-y-space-md rounded-xl bg-surface-container-low p-space-md">
          <div className="flex items-center gap-2 rounded-lg bg-surface-container-lowest p-1.5 shadow-sm">
            <span className="pl-2 text-on-surface-variant">
              <Icon name="contact_support" size={20} />
            </span>
            <input
              className="w-full bg-transparent px-2 py-1.5 font-body-md text-body-md text-on-surface focus:outline-none"
              type="text"
              readOnly
              aria-label="[MẪU] Câu hỏi test"
              defaultValue="Shop có freeship đơn 350k không?"
            />
            <span
              className="flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-secondary px-4 py-2 font-title-sm text-title-sm text-on-secondary opacity-60"
              aria-disabled="true"
              title="Sắp có"
            >
              <Icon name="play_arrow" size={16} />
              <span>Kiểm thử</span>
            </span>
          </div>
          <div className="space-y-space-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                Trích xuất tri thức:
              </span>
              <span className="flex items-center gap-1 rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-primary">
                <Icon name="attachment" size={12} />
                Nguồn: Website &gt; Chính sách vận chuyển (annhienstore.vn/phi-van-chuyen)
              </span>
              <Pill tone="primary" shape="box" className="font-semibold">
                Độ tin cậy: 98.4%
              </Pill>
              <Pill tone="accent" shape="box">
                Độ trễ: 340ms
              </Pill>
            </div>
            <div className="space-y-2 rounded-lg bg-surface-container-lowest p-space-md shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-title-sm text-title-sm text-secondary">
                  <Icon name="smart_toy" size={16} />
                  <span>Câu trả lời dự kiến của Bot:</span>
                </div>
                <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold text-on-primary-fixed-variant">
                  Trả lời đạt yêu cầu!
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface">
                “Dạ chào bạn! Shop{' '}
                <strong>
                  miễn phí vận chuyển toàn quốc cho tất cả đơn hàng từ 300.000đ trở lên
                </strong>{' '}
                nha. Đơn của bạn 350.000đ là đủ điều kiện nhận ưu đãi freeship rồi ạ! Bạn có muốn
                shop tư vấn thêm chọn size hay chốt đơn luôn không ạ? 🥰”
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

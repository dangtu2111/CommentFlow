import { Icon } from '../../../../components/ui/icon';
import { Pill } from '../../../../components/ui/pill';

/**
 * Cột phải "Cấu hình bài viết & AI" của design/stitch/posts.html với chữ MẪU của HTML (chỉ route DEV). Mọi ô vô hiệu
 * ("Sắp có"); ảnh CDN trong HTML thay bằng khung trống.
 */
const radio = 'flex cursor-not-allowed items-start gap-3 rounded-lg p-2.5 opacity-80';
const modes = [
  {
    title: 'Theo cài đặt mặc định của Kênh',
    body: 'Tự động trả lời ngay khi độ tin cậy AI >= 85%. Không cần nhân viên duyệt lại.',
    checked: true,
  },
  {
    title: 'Luôn duyệt tay trước khi gửi (Draft Only)',
    body: 'AI soạn sẵn câu trả lời vào hàng đợi, nhân viên ấn Duyệt mới bắn tin cho khách. An toàn tối đa cho bài Livestream/KOL.',
    checked: false,
  },
  {
    title: 'Tắt hoàn toàn AI trên bài này',
    body: 'Không quét và không tự động phản hồi bài viết này.',
    checked: false,
  },
] as const;

const disabledSoft =
  'cursor-not-allowed rounded-lg bg-surface-container-low px-4 py-2 font-title-sm text-title-sm text-on-surface opacity-60';

export function SampleConfigPanel() {
  return (
    <section
      aria-label="[MẪU] Cấu hình bài viết & AI"
      className="sticky top-20 space-y-space-lg rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-5"
    >
      <div className="flex items-start justify-between gap-space-sm pb-space-sm">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-primary">
              <Icon name="tune" size={18} />
            </span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              Cấu hình bài viết & AI
            </h2>
          </div>
          <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
            Đang thiết lập dữ liệu ngữ cảnh cho bài Facebook ID <code>89321487291</code>
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 font-label-md text-label-md text-primary">
          <span>Xem gốc</span>
          <Icon name="open_in_new" size={12} />
        </span>
      </div>

      <div className="flex items-center gap-space-md rounded-lg bg-surface-container-low p-space-sm">
        <div className="h-14 w-14 shrink-0 rounded bg-surface-container" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-title-sm text-title-sm text-on-surface">
            BST Nắng Hè 2025 - Nét Dịu Dàng Nữ Tính
          </div>
          <div className="mt-0.5 font-label-sm text-label-sm text-on-surface-variant">
            Kênh: FB Fanpage • Đăng: 10:24 AM hôm nay
          </div>
        </div>
      </div>

      <div className="space-y-space-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-title-sm text-title-sm text-on-surface">
            <span className="text-primary">
              <Icon name="inventory_2" size={16} />
            </span>
            <span>Sản phẩm gắn kèm cho bài</span>
          </span>
          <span className="font-label-sm text-label-sm text-primary">
            Đồng bộ Shopify: Sẵn sàng
          </span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            <Icon name="search" size={16} />
          </span>
          <input
            disabled
            aria-label="[MẪU] Tìm sản phẩm"
            placeholder="Tìm theo tên sản phẩm hoặc mã SKU kho..."
            className="w-full cursor-not-allowed rounded-lg bg-surface-container-low py-2 pl-9 pr-4 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant"
            type="text"
          />
        </div>
        <div className="flex items-center justify-between gap-space-sm rounded-lg bg-surface-container p-space-sm">
          <div className="flex min-w-0 items-center gap-space-sm">
            <div className="h-11 w-11 shrink-0 rounded bg-surface-container-lowest" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-title-sm text-title-sm text-on-surface">
                  Váy hoa nhí Vintage tay bồng
                </span>
                <Pill tone="primary" shape="box" className="shrink-0">
                  Chính
                </Pill>
              </div>
              <div className="mt-0.5 flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
                <span>SKU: VHN-01</span>
                <span>•</span>
                <span className="font-semibold text-primary">349.000₫</span>
                <span>•</span>
                <span className="text-tertiary">Còn 42 chiếc</span>
              </div>
            </div>
          </div>
          <span className="text-on-surface-variant" title="Gỡ sản phẩm">
            <Icon name="delete" size={16} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-space-sm rounded-lg bg-surface-container-low p-space-sm">
          <div className="flex min-w-0 items-center gap-space-sm">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-surface-container text-on-surface-variant">
              <Icon name="redeem" size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-title-sm text-title-sm text-on-surface">
                  Scrunchies vải lụa tặng kèm
                </span>
                <Pill tone="muted" shape="box" className="shrink-0">
                  Quà tặng 0₫
                </Pill>
              </div>
              <div className="mt-0.5 flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
                <span>SKU: PK-04</span>
                <span>•</span>
                <span>Cross-sell</span>
                <span>•</span>
                <span>Còn 120 chiếc</span>
              </div>
            </div>
          </div>
          <span className="text-on-surface-variant" title="Gỡ sản phẩm">
            <Icon name="close" size={16} />
          </span>
        </div>
        <span
          className="flex w-full cursor-not-allowed items-center justify-center gap-1 rounded-lg bg-surface-container-low py-2 font-title-sm text-title-sm text-primary opacity-60"
          aria-disabled="true"
          title="Sắp có"
        >
          <Icon name="add" size={16} />
          <span>+ Gắn thêm sản phẩm phụ / Cross-sell</span>
        </span>
      </div>

      <div className="space-y-space-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-title-sm text-title-sm text-on-surface">
            <span className="text-secondary">
              <Icon name="psychology" size={16} />
            </span>
            <span>Ghi chú riêng cho bài viết (AI Override Hint)</span>
          </span>
          <span
            className="text-on-surface-variant"
            title="Quy tắc này sẽ ghi đè quy tắc chung của shop khi khách hỏi bài này"
          >
            <Icon name="help" size={14} />
          </span>
        </div>
        <textarea
          readOnly
          rows={3}
          aria-label="[MẪU] Ghi chú riêng cho bài viết"
          placeholder="Ví dụ: Áp dụng mã FREESHIP2025 cho khách hỏi bài này. Khách nặng trên 55kg tư vấn size L trở lên..."
          className="w-full rounded-lg bg-surface-container-low p-2.5 font-body-sm text-body-sm leading-relaxed text-on-surface focus:outline-none"
          defaultValue="Áp dụng mã FREESHIP2025 cho khách hỏi bài này. Khách nặng trên 55kg hoặc ngực >88cm tư vấn size L trở lên để mặc thoải mái."
        />
        <div className="flex items-center justify-between pt-1 font-label-sm text-label-sm text-on-surface-variant">
          <span className="flex items-center gap-1">
            <Icon name="timer" size={12} />
            <span>Hiệu lực: Đến 23:59 ngày 31/05/2025</span>
          </span>
          <span className="text-primary">Đổi thời hạn</span>
        </div>
      </div>

      <div className="space-y-space-sm">
        <span className="flex items-center gap-1.5 font-title-sm text-title-sm text-on-surface">
          <span className="text-primary">
            <Icon name="smart_toy" size={16} />
          </span>
          <span>Chế độ AI trả lời riêng cho bài này</span>
        </span>
        <div className="space-y-2">
          {modes.map((mode) => (
            <label
              key={mode.title}
              className={`${radio} ${mode.checked ? 'bg-surface-container-low' : 'bg-surface-container-lowest'}`}
            >
              <input
                type="radio"
                name="mau-ai-mode"
                disabled
                defaultChecked={mode.checked}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div className="flex-1">
                <div className="font-title-sm text-title-sm font-semibold text-on-surface">
                  {mode.title}
                </div>
                <div className="font-body-sm text-body-sm text-on-surface-variant">{mode.body}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-surface-container p-space-sm text-on-surface-variant">
        <span className="shrink-0 text-primary">
          <Icon name="info" size={16} />
        </span>
        <span className="font-label-sm text-label-sm leading-tight">
          <strong>Nguyên tắc phân tầng:</strong> AI sẽ ưu tiên: <em>Ghi chú riêng của bài</em> →{' '}
          <em>Sản phẩm gắn kèm</em> → <em>Cơ sở kiến thức chung của Shop</em>.
        </span>
      </div>

      <div className="flex items-center justify-end gap-space-sm pt-space-xs">
        <span className={disabledSoft} aria-disabled="true" title="Sắp có">
          Hủy thay đổi
        </span>
        <span
          className="flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary-container px-5 py-2 font-title-sm text-title-sm text-on-primary opacity-60 shadow-sm"
          aria-disabled="true"
          title="Sắp có"
        >
          <Icon name="save" size={16} />
          <span>Lưu cấu hình bài viết</span>
        </span>
      </div>
    </section>
  );
}

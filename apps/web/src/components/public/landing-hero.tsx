import Link from 'next/link';
import { Icon, type IconName } from '../ui/icon';
import { DemoModal } from './demo-modal';

const TRUST: readonly { icon: IconName; text: string }[] = [
  { icon: 'credit_card_off', text: 'Không cần thẻ tín dụng' },
  { icon: 'schedule', text: 'Cài đặt nhanh' },
  { icon: 'lock', text: 'Cam kết không tự ý đăng bài' },
];

/** Khối hero + mô phỏng chu trình 3 bước (design/stitch/landing-pricing.html). Số liệu trong mô phỏng là [MẪU]. */
export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-surface via-surface-container-low to-surface py-space-xl lg:py-24">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-fixed/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-80 h-80 bg-secondary-fixed/40 rounded-full blur-3xl pointer-events-none" />
      <div className="max-w-7xl mx-auto px-margin">
        <div className="flex justify-center mb-space-lg">
          <div className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-full bg-surface-container-high/90 shadow-sm backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-label-sm text-label-sm text-primary uppercase font-bold tracking-wider">
              [MẪU] Chưa có chứng nhận đối tác
            </span>
            <span className="text-outline-variant font-body-sm">•</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
              AI Engine thế hệ mới cho Shop &amp; Agency Việt Nam
            </span>
          </div>
        </div>
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-space-md mb-space-xl">
          <h1 className="font-headline-lg text-headline-lg text-on-surface lg:text-[44px] lg:leading-[52px] tracking-tight font-bold">
            Trả lời khách nhanh hơn, <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-primary via-primary-container to-secondary bg-clip-text text-transparent">
              vẫn chuẩn xác đúng giọng của shop
            </span>
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl leading-relaxed">
            Hỗ trợ phản hồi bình luận và tin nhắn trên Facebook, Instagram và TikTok (sắp có) với
            trợ lý AI soạn câu từ chính dữ liệu sản phẩm, chính sách và bảng giá của cửa hàng bạn.
            Bạn hoàn toàn chủ động quyết định mức độ tự động.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-space-md mt-space-sm w-full sm:w-auto">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-space-xs px-space-xl py-3 rounded-lg bg-primary text-on-primary font-title-sm text-title-sm hover:bg-primary-container shadow-md hover:shadow-lg transition-all duration-200"
            >
              <Icon name="bolt" size={20} />
              <span>Dùng thử miễn phí</span>
            </Link>
            <DemoModal />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-space-lg gap-y-1 text-on-surface-variant font-label-md text-label-md mt-space-xs">
            {TRUST.map((t, i) => (
              <span key={t.text} className="contents">
                {i > 0 ? <span className="text-outline-variant">•</span> : null}
                <span className="inline-flex items-center gap-1">
                  <Icon name={t.icon} size={16} className="text-primary" />
                  {t.text}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="relative mt-space-lg max-w-6xl mx-auto">
          <div className="absolute -top-3 left-6 z-20 hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-lowest shadow-md text-on-surface font-label-sm text-label-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
            <span>[MẪU] Đang lắng nghe Webhook</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-code-sm text-code-sm">
              Độ trễ —
            </span>
          </div>
          <div className="bg-surface-container-lowest rounded-xl shadow-xl p-space-md lg:p-space-lg overflow-hidden">
            <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-surface-container">
              <div className="flex items-center gap-space-sm">
                <span className="w-3 h-3 rounded-full bg-error" />
                <span className="w-3 h-3 rounded-full bg-tertiary-fixed-dim" />
                <span className="w-3 h-3 rounded-full bg-primary-fixed" />
                <span className="font-title-sm text-title-sm text-on-surface font-semibold ml-2">
                  [MẪU] Mô phỏng chu trình bảo vệ và chốt đơn
                </span>
              </div>
              <div className="flex items-center gap-space-xs bg-secondary-fixed text-on-secondary-fixed px-space-sm py-1 rounded-full font-label-sm text-label-sm font-semibold">
                <Icon name="auto_awesome" size={14} />
                <span>Chế độ mẫu</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md relative">
              <div className="flex flex-col bg-surface-container-low rounded-lg p-space-md">
                <div className="flex items-center justify-between mb-space-sm">
                  <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-label-sm text-label-sm font-bold flex items-center gap-1">
                    <Icon name="public" size={14} className="text-primary" /> Facebook Ads Post
                  </span>
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    10:42:01 AM
                  </span>
                </div>
                <div className="bg-surface-container-lowest p-space-sm rounded-lg shadow-sm mb-space-sm">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center font-bold text-primary font-label-sm text-label-sm">
                      TN
                    </div>
                    <div>
                      <p className="font-title-sm text-title-sm text-on-surface font-semibold leading-tight">
                        Thanh Nga
                      </p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">
                        Khách bình luận công khai
                      </p>
                    </div>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface leading-snug">
                    Áo Blazer Linen be còn size M không shop? Ship về Cầu Giấy bn thế ạ? SĐT mình:{' '}
                    <span className="bg-error-container text-on-error-container font-semibold px-1 rounded">
                      0982.341.***
                    </span>{' '}
                    tư vấn giúp m nhé!
                  </p>
                </div>
                <div className="mt-auto flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm">
                  <Icon name="warning" size={16} className="text-tertiary" />
                  <span>Nguy cơ: Đối thủ quét SĐT cướp đơn</span>
                </div>
              </div>

              <div className="flex flex-col bg-surface-container-low rounded-lg p-space-md relative">
                <div className="flex items-center justify-between mb-space-sm">
                  <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-bold flex items-center gap-1">
                    <Icon name="shield" size={14} /> Chống cướp khách
                  </span>
                  <span className="font-code-sm text-code-sm text-primary font-bold">
                    [MẪU] Tức thì
                  </span>
                </div>
                <div className="bg-surface-container-lowest p-space-sm rounded-lg shadow-sm mb-space-sm">
                  <div className="flex items-center gap-2 mb-2 text-primary font-label-sm text-label-sm font-bold">
                    <Icon name="visibility_off" size={16} />
                    <span>Đã gắn cờ để nhân viên xem: bình luận có SĐT</span>
                  </div>
                  <div className="p-2 rounded bg-surface-container-highest/60 text-on-surface-variant font-body-sm text-body-sm italic mb-2">
                    &quot;Nhân viên được nhắc xem bình luận này; việc ẩn do người của shop quyết
                    định.&quot;
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      Phân loại AI:
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold">
                      [Hỏi giá + SĐT Lead]
                    </span>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between text-on-surface font-label-sm text-label-sm">
                  <span className="text-primary font-bold">Độ tin cậy: [MẪU] —</span>
                  <span className="text-on-surface-variant">Tự tạo khách tiềm năng [MẪU]</span>
                </div>
              </div>

              <div className="flex flex-col bg-surface-container rounded-lg p-space-md">
                <div className="flex items-center justify-between mb-space-sm">
                  <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold flex items-center gap-1">
                    <Icon name="smart_toy" size={14} /> Phản hồi chuẩn xác
                  </span>
                  <span className="font-code-sm text-code-sm text-on-secondary-fixed-variant font-semibold">
                    Gợi ý để duyệt
                  </span>
                </div>
                <div className="bg-surface-container-lowest p-space-sm rounded-lg shadow-sm mb-space-sm">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-label-sm text-label-sm text-primary font-bold flex items-center gap-1">
                      <Icon name="menu_book" size={14} /> Nguồn: [MẪU] Dữ liệu sản phẩm
                    </span>
                    <span className="text-on-surface-variant font-label-sm text-label-sm">
                      Tồn kho: [MẪU] —
                    </span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface leading-snug">
                    Dạ chào chị Nga, Áo Blazer Linen tone Be size M bên em hiện vẫn còn sẵn ạ! [MẪU]
                    Em đã gửi bảng thông số chi tiết qua tin nhắn riêng cho chị rồi nha ❤️
                  </p>
                  <div className="mt-2 pt-2 border-t border-surface-container flex items-center justify-between">
                    <span className="font-label-sm text-label-sm text-primary font-medium flex items-center gap-1">
                      <Icon name="send" size={14} /> Nhắn riêng do nhân viên bấm gửi
                    </span>
                    <Icon name="done_all" size={16} className="text-primary" />
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-1 text-on-surface font-label-sm text-label-sm">
                  <Icon name="inventory_2" size={16} className="text-primary" />
                  <span className="font-medium text-primary">
                    Đồng bộ vào bảng Quản lý Khách Hàng
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

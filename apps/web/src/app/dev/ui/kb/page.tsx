import { notFound } from 'next/navigation';
import { KbFrameView } from '../../../../components/kb/kb-frame-view';
import type { RailGroup, RailItem } from '../../../../components/ui/rail-nav';
import { KbSampleStage } from './sample-stage';

type SampleRail = Pick<RailItem, 'key' | 'label' | 'icon' | 'count'> & { current?: boolean };

const STRUCTURE: SampleRail[] = [
  { key: 'sources', label: 'Nguồn dữ liệu', icon: 'cloud_sync', count: '2', current: true },
  { key: 'store', label: 'Thông tin cửa hàng', icon: 'storefront' },
  { key: 'products', label: 'Sản phẩm', icon: 'inventory_2', count: '128' },
  { key: 'policy', label: 'Chính sách', icon: 'policy', count: '4' },
  { key: 'faq', label: 'Hỏi – đáp FAQ', icon: 'quiz', count: '45' },
  { key: 'docs', label: 'Tài liệu', icon: 'description', count: '2 PDF' },
];
const TUNING: SampleRail[] = [
  { key: 'voice', label: 'Giọng văn thương hiệu', icon: 'record_voice_over' },
  { key: 'rules', label: 'Quy tắc & Giới hạn', icon: 'rule' },
  { key: 'abbr', label: 'Từ điển viết tắt', icon: 'spellcheck', count: '18 từ' },
  { key: 'versions', label: 'Kiểm thử & Phiên bản', icon: 'history_edu' },
];

const toItem = (item: SampleRail): RailItem => ({
  key: item.key,
  href: '#',
  label: item.label,
  current: Boolean(item.current),
  disabled: !item.current,
  ...(item.icon ? { icon: item.icon } : {}),
  ...(item.count ? { count: item.count } : {}),
});

const GROUPS: RailGroup[] = [
  { key: 'structure', title: 'Cấu trúc tri thức', items: STRUCTURE.map(toItem) },
  { key: 'tuning', title: 'Tinh chỉnh hành vi', items: TUNING.map(toItem) },
];

/**
 * Xem khung Cơ sở kiến thức với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`. Không đọc DB/phiên; chữ và số lấy
 * từ design/stitch/knowledge-base.html (đo bằng `pnpm ui:fidelity knowledge-base /dev/ui/kb`). Mọi số liệu là [MẪU].
 */
export default function DevKbPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="app-page app-page-wide">
      <KbFrameView
        title="Cơ sở kiến thức AI"
        versionBadge="RAG Engine v12.4"
        draftNote="Bản nháp — 3 thay đổi chưa xuất bản (v12)"
        scope={{ label: 'Áp dụng cho:', value: 'Tất cả kênh (3 kênh)' }}
        diff={{ label: 'Xem thay đổi (Diff)', count: '3' }}
        test={{ label: 'Chạy kiểm thử (Test Cases)', href: '#' }}
        publish={{ label: 'Xuất bản v13', href: '#' }}
        soon="Sắp có"
        completeness={{
          label: 'Độ đầy đủ kiến thức',
          score: 88,
          aria: 'Độ đầy đủ kiến thức: 88%',
          hint: 'Gợi ý: Bổ sung chính sách đổi trả hàng sale • Tối ưu tỷ lệ giải đáp tự động thêm +6.4%',
          detailLabel: 'Tối ưu ngay',
          detailHref: '#',
        }}
        rail={{
          label: 'Cấu trúc kiến thức',
          groups: GROUPS,
        }}
      >
        <KbSampleStage />
      </KbFrameView>
    </main>
  );
}

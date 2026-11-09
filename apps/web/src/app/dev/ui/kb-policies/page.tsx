import { notFound } from 'next/navigation';
import { PolicyFactsPanel } from '../../../../components/kb/policy-facts-panel';
import { buildPolicyFactsView, type PolicyFactRowView } from '../../../../lib/kb-policy-view';

const ship = {
  kind: 'nationwide',
  label: 'Toàn quốc',
  feeMinor: 30000,
  currency: 'VND',
  daysMin: 2,
  daysMax: 4,
  cod: true,
  feeMode: 'fixed',
};
const base = {
  evidence: null,
  sourceRef: null,
  rev: 1,
} as const;

/** Dữ liệu [MẪU] cho xem trước giao diện (không phải số liệu thật). */
const SAMPLE_ROWS: PolicyFactRowView[] = [
  {
    ...base,
    id: 's1',
    kind: 'ship_region',
    slot: 'toan quoc',
    data: ship,
    status: 'approved',
    origin: 'manual',
  },
  {
    ...base,
    id: 's2',
    kind: 'ship_region',
    slot: 'noi thanh ha noi',
    data: {
      ...ship,
      kind: 'city',
      city: 'Hà Nội',
      label: 'Nội thành Hà Nội',
      feeMode: 'free_over',
      freeOverMinor: 500000,
      daysMin: 1,
      daysMax: 1,
    },
    status: 'approved',
    origin: 'manual',
  },
  {
    ...base,
    id: 'r1',
    kind: 'returns',
    slot: 'returns',
    data: { days: 7, conditions: ['Còn nguyên tem mác', 'Chưa qua giặt tẩy'], needsReview: true },
    status: 'draft',
    origin: 'text_suggested',
    evidence:
      'Khách hàng được đổi trả trong vòng 7 ngày nếu sản phẩm còn nguyên tem mác và chưa giặt.',
  },
  {
    ...base,
    id: 'p1',
    kind: 'payment',
    slot: 'payment',
    data: { methods: ['cod', 'bank_transfer'] },
    status: 'approved',
    origin: 'manual',
  },
];

/** Xem trang Chính sách có cấu trúc với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`; không đọc DB/phiên. So Stitch: `pnpm ui:fidelity kb-policies-structured /dev/ui/kb-policies`. */
export default async function DevKbPoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { staff } = await searchParams;
  return (
    <main className="app-page app-page-wide">
      <div className="tw">
        <p className="mb-space-md inline-block rounded-full bg-surface-container px-3 py-1 font-label-sm text-label-sm text-on-surface-variant">
          Dữ liệu mẫu
        </p>
        <PolicyFactsPanel view={buildPolicyFactsView(SAMPLE_ROWS)} isOwner={staff === undefined} />
      </div>
    </main>
  );
}

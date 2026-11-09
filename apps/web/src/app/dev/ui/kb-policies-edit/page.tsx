import { notFound } from 'next/navigation';
import { PolicyValueForm } from '../../../../components/kb/policy-value-form';
import {
  type EditableKind,
  isEditableKind,
  policyFormDefaults,
} from '../../../../lib/kb-policy-form';

const SAMPLE: Record<EditableKind, unknown> = {
  ship_region: {
    kind: 'city',
    label: 'Nội thành Hà Nội',
    city: 'Hà Nội',
    currency: 'VND',
    feeMinor: 20000,
    daysMin: 1,
    daysMax: 2,
    cod: true,
    destinations: ['VN'],
  },
  cod: { value: true },
  returns: {
    days: 7,
    conditions: ['Còn nguyên tem mác', 'Chưa qua giặt tẩy'],
    refundTo: 'original_payment',
    returnShippingPaidBy: 'shop',
  },
  warranty: { months: 3, scope: 'đường may' },
  payment: { methods: ['cod', 'bank_transfer'] },
};

async function noop() {
  'use server';
}

/** Xem biểu mẫu Sửa tay với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`; không đọc DB/phiên. Dùng để kiểm giá trị điền sẵn hiển thị trong trình duyệt. */
export default async function DevKbPoliciesEditPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { kind } = await searchParams;
  const picked: EditableKind = isEditableKind(kind) ? kind : 'returns';
  return (
    <main className="app-page app-page-wide">
      <div className="tw">
        <PolicyValueForm
          kind={picked}
          defaults={policyFormDefaults(picked, SAMPLE[picked])}
          action={noop}
          cancelHref="/dev/ui/kb-policies"
          draft={{ id: 'sample', rev: 1 }}
          labelEditable={false}
          heading="edit"
        />
      </div>
    </main>
  );
}

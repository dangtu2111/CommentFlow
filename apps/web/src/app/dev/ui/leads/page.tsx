import { notFound } from 'next/navigation';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { LeadsView } from '../../../../components/leads/leads-view';
import { TwPage } from '../../../../components/ui/tw-parts';

/**
 * Giao diện Khách tiềm năng với DỮ LIỆU MẪU — chỉ khi `NODE_ENV !== 'production'`; dùng đúng `LeadsView` của trang
 * thật. Không có dòng thật nên thẻ/số đếm lấy từ lib/leads-sample.ts (chép từ design/stitch/leads.html).
 */
export default function DevLeadsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <DevShell>
      <TwPage>
        <p className="font-label-md text-label-md text-on-surface-variant" role="note">
          {DEV_SAMPLE_NOTE}
        </p>
        <LeadsView leads={[]} counts={{ new: 0, contacted: 0, won: 0, lost: 0 }} sample />
      </TwPage>
    </DevShell>
  );
}

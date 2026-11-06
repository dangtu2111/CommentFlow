import { notFound } from 'next/navigation';
import { PrivacyView } from '../../../../components/public/privacy-view';
import { PublicShell } from '../../../../components/public/public-shell';

/**
 * Quyền riêng tư & xóa dữ liệu (design/stitch/privacy-data-deletion.html, Tailwind) với DỮ LIỆU MẪU — CHỈ khi
 * `NODE_ENV !== 'production'` (QRL1, QTWAL1). Bỏ chứng nhận, mã số thuế, địa chỉ, số liệu không có thật.
 */
export default function DevPrivacyPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <PublicShell>
      <PrivacyView />
    </PublicShell>
  );
}

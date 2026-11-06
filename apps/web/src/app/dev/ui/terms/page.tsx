import { notFound } from 'next/navigation';
import { PublicShell } from '../../../../components/public/public-shell';
import { TermsView } from '../../../../components/public/terms-view';

/**
 * Điều khoản & DPA (design/stitch/terms-dpa.html, Tailwind) với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`
 * (QRL1, QTWAL1). Điều khoản là bản nháp "[MẪU] chờ duyệt pháp lý"; không có thông tin pháp nhân/chứng thư thật.
 */
export default function DevTermsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <PublicShell>
      <TermsView />
    </PublicShell>
  );
}

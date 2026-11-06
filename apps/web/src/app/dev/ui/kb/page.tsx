import { notFound } from 'next/navigation';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { Card } from '../../../../components/ui/card';
import { PageHeader } from '../../../../components/ui/page-header';

/**
 * Xem khung Cơ sở kiến thức với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`. Không đọc DB/phiên;
 * mọi số liệu là [MẪU], không bao giờ là số liệu thật (dùng để đo bố cục so với design/stitch/knowledge-base.html).
 */
export default function DevKbPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kb" completeness={{ score: 64, ready: false, minPercent: 70 }}>
        <header className="kb-head">
          <PageHeader
            title="[MẪU] Tổng quan kiến thức"
            subtitle="[MẪU] Dữ liệu mẫu — không thật."
          />
        </header>
        <Card>
          <p className="muted">[MẪU] Nội dung của tab con hiện ở đây.</p>
        </Card>
      </KbFrame>
    </main>
  );
}

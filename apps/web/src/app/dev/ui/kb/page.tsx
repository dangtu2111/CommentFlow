import { notFound } from 'next/navigation';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { KbHubView } from '../../../../components/kb/kb-hub-view';

/** Trang xem giao diện Cơ sở kiến thức với DỮ LIỆU MẪU — chỉ khi `NODE_ENV !== 'production'`. */
export default async function DevKbPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <DevShell>
      <main className="app-page app-page-kb">
        <p className="inbox-sample-note" role="note">
          {DEV_SAMPLE_NOTE}
        </p>
        <KbFrame active="kb">
          <KbHubView score={88} ready minPercent={60} sampleNote="[MẪU]" />
        </KbFrame>
      </main>
    </DevShell>
  );
}

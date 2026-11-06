import { notFound } from 'next/navigation';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { PrivacyView } from '../../../../components/settings/privacy-view';

async function noop(): Promise<void> {
  'use server';
}

/** Trang xem Dữ liệu & Quyền riêng tư với tên workspace MẪU — chỉ khi `NODE_ENV !== 'production'`. */
export default function DevPrivacyPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <DevShell>
      <p className="inbox-sample-note" role="note">
        {DEV_SAMPLE_NOTE}
      </p>
      <main className="app-page app-page-settings">
        <PrivacyView
          frame={{
            viewerRole: 'owner',
            counts: { channelsConnected: 3, channelsTotal: 3, members: 5 },
          }}
          workspaceName="[MẪU] Demo Shop"
          notice={null}
          actions={{ exportData: noop, requestDeletion: noop }}
        />
      </main>
    </DevShell>
  );
}

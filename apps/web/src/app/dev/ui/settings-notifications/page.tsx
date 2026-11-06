import { notFound } from 'next/navigation';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { NotificationsView } from '../../../../components/settings/notifications-view';

/** Trang xem Thông báo — chỉ khi `NODE_ENV !== 'production'`. */
export default function DevNotificationsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <DevShell>
      <p className="inbox-sample-note" role="note">
        {DEV_SAMPLE_NOTE}
      </p>
      <main className="app-page app-page-settings">
        <NotificationsView
          frame={{
            viewerRole: 'owner',
            counts: { channelsConnected: 3, channelsTotal: 3, members: 5 },
          }}
        />
      </main>
    </DevShell>
  );
}

import { notFound } from 'next/navigation';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { NotificationsView } from '../../../../components/settings/notifications-view';
import { SettingsFrame } from '../../../../components/settings/settings-frame';

/** Trang xem Thông báo — chỉ khi `NODE_ENV !== 'production'`. */
export default function DevNotificationsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <DevShell>
      <main className="app-page app-page-settings">
        <SettingsFrame
          viewerRole="owner"
          active="notifications"
          counts={{ channelsConnected: 3, channelsTotal: 3, members: 5 }}
        >
          <p className="inbox-sample-note" role="note">
            {DEV_SAMPLE_NOTE}
          </p>
          <NotificationsView />
        </SettingsFrame>
      </main>
    </DevShell>
  );
}

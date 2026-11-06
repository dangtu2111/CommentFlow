import { Bell } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { NotificationModel } from '../../lib/notification-model';

/**
 * Hộp thông báo ở đầu trang (docs/08 §3). Nguồn hiện nay: cảnh báo kênh thật (cùng dữ liệu với banner). Không có thông
 * báo thì hiện "không có" (không dữ liệu mẫu). Chấm đỏ chỉ khi có cảnh báo khẩn. `<details>` để không cần JS.
 */
export async function NotificationBell({
  model,
  canOpenChannels,
}: {
  model: NotificationModel;
  /** Chỉ Owner vào được trang Kênh (Staff nhận 404) nên chỉ Owner có liên kết. */
  canOpenChannels: boolean;
}) {
  const t = await getTranslations();
  const count = model.items.length;
  return (
    <details className="notif">
      <summary className="icon-button" aria-label={t('shell.notifications.label', { count })}>
        <Bell size={18} aria-hidden="true" />
        {model.hasUrgent ? <span className="notif-dot" aria-hidden="true" /> : null}
      </summary>
      <div className="notif-panel">
        <p className="notif-title">{t('shell.notifications.title')}</p>
        {count === 0 ? <p className="muted">{t('shell.notifications.empty')}</p> : null}
        <ul className="notif-list">
          {model.items.map((item) => {
            const names = item.names.join(', ');
            const more =
              item.moreCount > 0 ? ` ${t('banners.channel.more', { count: item.moreCount })}` : '';
            const text =
              item.kind === 'channel'
                ? t(`banners.channel.${item.status}.title`, { names })
                : t('banners.webhookSilent.title', { names });
            return (
              <li key={item.kind === 'channel' ? item.status : item.kind} className="notif-item">
                {text}
                {more}
              </li>
            );
          })}
        </ul>
        {count > 0 && canOpenChannels ? (
          <Link className="notif-link" href="/app/channels">
            {t('shell.notifications.openChannels')}
          </Link>
        ) : null}
      </div>
    </details>
  );
}

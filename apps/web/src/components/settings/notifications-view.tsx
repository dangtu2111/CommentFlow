import { Bell } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SectionHead } from '../ui/section-head';
import { SettingsFrame, type SettingsFrameScope } from './settings-frame';

const ITEMS = ['usage', 'channel', 'handoff', 'pause'] as const;

/** Trang Thông báo: các loại sự kiện dự kiến, công tắc tắt kèm "Sắp có" (chưa có nơi lưu tùy chọn). */
export async function NotificationsView({ frame }: { frame: SettingsFrameScope }) {
  const t = await getTranslations('settings');
  return (
    <SettingsFrame {...frame} active="notifications" variant="tabs">
      <section className="card stack" aria-labelledby="notif-list">
        <SectionHead
          id="notif-list"
          icon={<Bell size={20} />}
          title={t('notifications.title')}
          description={t('notifications.note')}
        />
        <ul className="notif-list">
          {ITEMS.map((key) => (
            <li key={key} className="notif-item">
              <div>
                <strong>{t(`notifications.items.${key}.title`)}</strong>
                <p className="muted">{t(`notifications.items.${key}.body`)}</p>
              </div>
              <span className="badge badge-off">{t('soon')}</span>
            </li>
          ))}
        </ul>
      </section>
    </SettingsFrame>
  );
}

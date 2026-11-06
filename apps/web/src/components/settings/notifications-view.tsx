import { Bell } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SectionHead } from '../ui/section-head';

const ITEMS = ['usage', 'channel', 'handoff', 'pause'] as const;

/** Trang Thông báo: các loại sự kiện dự kiến, công tắc tắt kèm "Sắp có" (chưa có nơi lưu tùy chọn). */
export async function NotificationsView() {
  const t = await getTranslations('settings');
  return (
    <>
      <header className="stack-tight">
        <h1 className="page-title">{t('notifications.title')}</h1>
        <p className="page-subtitle">{t('notifications.subtitle')}</p>
      </header>
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
    </>
  );
}

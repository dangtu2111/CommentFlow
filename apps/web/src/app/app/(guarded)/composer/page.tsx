import { getTranslations } from 'next-intl/server';
import { ComposerStudio } from '../../../../components/composer/composer-studio';
import { loadComposer } from '../../../../server/post-calendar';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('composer');
  return { title: t('title') };
}

/**
 * Trang Biên tập bài viết (COMPOSER-CALENDAR-UI, Q-CMP1): CHỈ Owner (Staff nhận 404). Giao diện soạn bài theo design/stitch/composer.html; chưa lưu/lên lịch/đăng.
 * Kênh lấy từ DB theo workspace đang chọn (RLS), không từ URL.
 */
export default async function ComposerPage() {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const t = await getTranslations('composer');
  let data: Awaited<ReturnType<typeof loadComposer>> | null = null;
  try {
    data = await loadComposer(workspace.id, user.id);
  } catch {
    data = null; // Không lộ chi tiết lỗi ra giao diện.
  }
  if (!data) {
    return (
      <main className="app-page" role="alert">
        <div className="tw">
          <h1 className="font-headline-md text-headline-md text-on-surface">{t('error.title')}</h1>
          <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
            {t('error.body')}
          </p>
        </div>
      </main>
    );
  }
  return (
    <main className="app-page app-page-wide">
      <div className="tw">
        <ComposerStudio
          timeZone={data.timeZone}
          channels={data.channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            platform: channel.platform,
            status: channel.status,
          }))}
        />
      </div>
    </main>
  );
}

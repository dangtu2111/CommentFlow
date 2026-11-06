import { getTranslations } from 'next-intl/server';
import { ActivityPageView } from '../../../../components/activity/activity-view';
import { parseActivitySearchParams } from '../../../../lib/action-log-filters';
import { showSampleData } from '../../../../lib/sample-data';
import { loadActionLog } from '../../../../server/action-log';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('activity');
  return { title: t('title') };
}

/**
 * Trang Nhật ký (FR-092): chỉ đọc, dựng từ design/stitch/activity-log.html (Tailwind). Owner thấy mọi dòng của
 * workspace, Staff chỉ dòng của chính mình. Bộ lọc là tham số URL (GET form). Workspace/người dùng/vai trò lấy từ
 * `requireAppUser`, không từ URL.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await requireAppUser({});
  const [t, params] = await Promise.all([getTranslations('activity'), searchParams]);
  const view = parseActivitySearchParams(params);

  let data: Awaited<ReturnType<typeof loadActionLog>> | null = null;
  try {
    data = await loadActionLog(workspace.id, user.id, workspace.role, view);
  } catch {
    data = null; // Không lộ chi tiết lỗi ra giao diện.
  }
  if (!data) {
    return (
      <main className="tw w-full">
        <div
          role="alert"
          className="m-space-lg rounded-xl bg-error-container p-space-md font-body-md text-body-md text-on-error-container"
        >
          <h1 className="font-title-md text-title-md">{t('error.title')}</h1>
          <p>{t('error.body')}</p>
        </div>
      </main>
    );
  }

  const { page, actions, timeZone, detail } = data;
  return (
    <main className="tw w-full">
      <div className="flex w-full flex-col">
        <ActivityPageView
          view={view}
          items={page.items}
          nextCursor={page.nextCursor}
          actions={actions}
          timeZone={timeZone}
          viewerId={user.id}
          isOwner={workspace.role === 'owner'}
          detail={detail}
          selectedMissing={Boolean(view.selected) && !detail}
          sample={showSampleData()}
        />
      </div>
    </main>
  );
}

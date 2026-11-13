import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ComposerStudio } from '../../../../components/composer/composer-studio';
import { NoticeBanner } from '../../../../components/composer/notice-banner';
import { calendarHref } from '../../../../lib/calendar-week';
import { parsePublishNotice } from '../../../../lib/publish-notice';
import { utcToLocalParts } from '../../../../lib/zoned-time';
import { mediaEnabled } from '../../../../server/media-runtime';
import { loadComposer } from '../../../../server/post-calendar';
import { publishEnabled } from '../../../../server/publish-runtime';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('composer');
  return { title: t('title') };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLISH_PERMISSION = 'pages_manage_posts';

/**
 * Trang Biên tập bài viết (COMPOSER-CALENDAR-UI + POST-PUBLISHING): CHỈ Owner (Staff nhận 404). Soạn, lưu nháp, lên lịch, đăng ngay bằng Server Action thật; `?id=` mở bài đang sửa
 * (chỉ nháp/đã lên lịch sửa được); `?n=` là mã thông báo sau thao tác. Kênh/bài lấy từ DB theo workspace đang chọn (RLS), không từ URL.
 */
export default async function ComposerPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, params] = await Promise.all([getTranslations('composer'), searchParams]);
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const postId = rawId && UUID.test(rawId) ? rawId : undefined;
  const notice = parsePublishNotice(params.n);

  let data: Awaited<ReturnType<typeof loadComposer>> | null = null;
  try {
    data = await loadComposer(workspace.id, user.id, postId);
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
  // Chỉ nháp / đã lên lịch mới sửa được; bài khác (đang đăng, đã đăng, lỗi) → về Lịch để xem chi tiết.
  const post = data.post;
  if (postId && (!post || (post.status !== 'draft' && post.status !== 'scheduled'))) {
    redirect(`${calendarHref({})}?n=not_editable`);
  }
  const local = post?.scheduledAt ? utcToLocalParts(post.scheduledAt, data.timeZone) : null;
  return (
    <main className="app-page app-page-wide">
      <div className="tw">
        {notice ? (
          <div className="mb-space-md">
            <NoticeBanner code={notice} />
          </div>
        ) : null}
        <ComposerStudio
          timeZone={data.timeZone}
          publishEnabled={publishEnabled()}
          products={data.products}
          mediaEnabled={mediaEnabled()}
          initialMedia={data.media}
          channels={data.channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            platform: channel.platform,
            status: channel.status,
            canPublish: channel.scopes.includes(PUBLISH_PERMISSION),
          }))}
          {...(post && (post.status === 'draft' || post.status === 'scheduled')
            ? {
                initial: {
                  id: post.id,
                  message: post.message,
                  channelIds: post.targets.map((target) => target.channelId),
                  productIds: data.selectedProductIds,
                  status: post.status,
                  date: local?.date ?? '',
                  time: local?.time ?? '',
                },
              }
            : {})}
        />
      </div>
    </main>
  );
}

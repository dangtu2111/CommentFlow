import type { PublishPostItem } from '@flow/db/runtime';
import type { Locale } from '@flow/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  cancelPublishScheduleAction,
  deletePublishPostAction,
} from '../../app/app/(guarded)/composer/actions';
import { cx } from '../../lib/cx';
import { formatAbsoluteTime } from '../../lib/inbox-format';
import { PendingNote, PendingSubmit } from '../composer/pending-submit';
import { Icon } from '../ui/icon';

/**
 * Khung chi tiết MỘT bài đăng từ CommentFlow (POST-PUBLISHING): trạng thái, giờ, nội dung, từng kênh kèm kết quả và lý do lỗi (mã đã biết → chữ dễ hiểu), và thao tác theo trạng thái:
 * Sửa (nháp/đã lên lịch), Hủy lịch (đã lên lịch), Xóa (nháp/lỗi/đăng một phần). Đang đăng hoặc đã đăng thành công: chỉ xem. Thao tác là biểu mẫu POST tới Server Action (Owner; DB kiểm lại).
 * Mã lỗi lạ không bị in ra: hiện chữ chung. Chỉ dùng bên trong `.tw`.
 */
const KNOWN_ERRORS = new Set([
  'missing_permission',
  'permission',
  'token_expired',
  'invalid_post',
  'rate_limited',
  'unknown_result',
  'lease_expired',
]);

const TARGET_STYLE: Record<string, string> = {
  pending: 'bg-surface-container-high text-on-surface',
  publishing: 'bg-tertiary-fixed text-on-tertiary-fixed',
  published: 'bg-primary-fixed text-on-primary-fixed-variant',
  failed: 'bg-error-container text-on-error-container',
  unknown: 'bg-tertiary-fixed text-on-tertiary-fixed',
};

export async function PublishDrawer({
  post,
  closeHref,
  locale,
  timeZone,
}: {
  post: PublishPostItem;
  closeHref: string;
  locale: Locale;
  timeZone: string;
}) {
  const t = await getTranslations('calendar');
  const editable = post.status === 'draft' || post.status === 'scheduled';
  const deletable =
    post.status === 'draft' || post.status === 'failed' || post.status === 'partial';
  const when = post.publishedAt ?? post.scheduledAt;
  return (
    <>
      <Link
        href={closeHref}
        aria-label={t('drawer.close')}
        className="fixed inset-0 z-40 bg-inverse-surface/40"
      />
      <aside
        aria-label={t('own.title')}
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col gap-space-md overflow-y-auto bg-surface-container-lowest p-space-lg shadow-2xl"
      >
        <div className="flex items-center justify-between gap-space-sm">
          <h2 className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface">
            <Icon name="feed" size={20} />
            {t('own.title')}
          </h2>
          <Link
            href={closeHref}
            aria-label={t('drawer.close')}
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <Icon name="close" size={20} />
          </Link>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-space-md gap-y-space-xs rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm">
          <dt className="text-on-surface-variant">{t('drawer.stats')}</dt>
          <dd className="font-semibold text-on-surface">{t(`status.${post.status}`)}</dd>
          {when ? (
            <>
              <dt className="text-on-surface-variant">{t('own.scheduledAt')}</dt>
              <dd className="text-on-surface">{formatAbsoluteTime(when, locale, timeZone)}</dd>
            </>
          ) : null}
        </dl>

        <section className="flex flex-col gap-space-xs">
          <h3 className="font-label-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
            {t('drawer.content')}
          </h3>
          <p className="whitespace-pre-wrap break-words font-body-md text-body-md text-on-surface">
            {post.message === '' ? t('drafts.untitled') : post.message}
          </p>
        </section>

        <section className="flex flex-col gap-space-xs">
          <h3 className="font-label-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
            {t('own.targets')}
          </h3>
          <ul className="flex flex-col gap-space-xs">
            {post.targets.map((target) => (
              <li key={target.id} className="rounded-lg bg-surface-container-low p-space-sm">
                <div className="flex items-center justify-between gap-space-sm">
                  <span className="truncate font-title-sm text-title-sm text-on-surface">
                    {target.channelName}
                  </span>
                  <span
                    className={cx(
                      'whitespace-nowrap rounded px-1.5 py-0.5 font-label-sm text-label-sm',
                      TARGET_STYLE[target.status] ?? TARGET_STYLE.pending,
                    )}
                  >
                    {t(`targetStatus.${target.status}`)}
                  </span>
                </div>
                {target.errorCode ? (
                  <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                    {KNOWN_ERRORS.has(target.errorCode)
                      ? t(`publishError.${target.errorCode}`)
                      : t('publishError.unknown_result')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {editable || deletable ? null : (
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {t('own.lockedHint')}
          </p>
        )}
        <form className="mt-auto flex flex-wrap items-center gap-space-sm">
          <input type="hidden" name="postId" value={post.id} />
          {editable ? (
            <Link
              href={`/app/composer?id=${post.id}`}
              className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-space-md py-space-sm font-title-sm text-title-sm text-on-primary hover:bg-primary"
            >
              <Icon name="edit" size={16} />
              {t('own.edit')}
            </Link>
          ) : null}
          {post.status === 'scheduled' ? (
            <PendingSubmit
              formAction={cancelPublishScheduleAction}
              pendingLabel={t('own.pending')}
              className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-space-md py-space-sm font-title-sm text-title-sm text-on-surface hover:bg-surface-container-highest"
            >
              <Icon name="event_busy" size={16} />
              {t('own.cancel')}
            </PendingSubmit>
          ) : null}
          {deletable ? (
            <PendingSubmit
              formAction={deletePublishPostAction}
              pendingLabel={t('own.pending')}
              className="inline-flex items-center gap-1 rounded-lg bg-surface-container-low px-space-md py-space-sm font-title-sm text-title-sm text-error hover:bg-surface-container"
            >
              <Icon name="delete" size={16} />
              {t('own.delete')}
            </PendingSubmit>
          ) : null}
          <PendingNote>{t('own.pendingNote')}</PendingNote>
        </form>
      </aside>
    </>
  );
}

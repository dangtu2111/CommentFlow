import { DECLARED_CAPABILITIES } from '@flow/connectors';
import { isLocale } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { hideErrorKey } from '../../lib/hide-errors';
import { deriveHideUi, type HideUiDetail } from '../../lib/hide-state';
import { formatAbsoluteTime, formatRelativeTime } from '../../lib/inbox-format';
import { replyErrorKey } from '../../lib/reply-errors';
import { deriveReplyUi, type ReplyUiDetail } from '../../lib/reply-state';
import { CommentLock } from './comment-lock';
import { HideButton } from './hide-button';
import { HideProgress } from './hide-progress';
import { ReplyComposer } from './reply-composer';
import { ReplyProgress } from './reply-progress';

export type CommentDetailView = {
  id: string;
  status: string;
  text: string;
  authorName: string | null;
  authorExternalId: string;
  createdTime: Date | null;
  label: string | null;
  needsFollowup: boolean;
  parentExternalId: string | null;
  channelName: string;
  platform: string;
  postExternalId: string;
  isAd: boolean;
  channelStatus: string;
  deletedAt: Date | null;
  isHidden: boolean;
  latestHide: HideUiDetail['latestHide'];
  latestReply: ReplyUiDetail['latestReply'];
  lock: { holderName: string | null; heldByMe: boolean } | null;
};

const STATUSES = [
  'new',
  'processing',
  'pending_review',
  'needs_human',
  'scheduled_auto',
  'sending',
  'replied',
  'auto_replied',
  'send_failed',
  'skipped',
  'spam_suspected',
  'hidden',
] as const;
const PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;

/**
 * Cột phải: chi tiết bình luận đang chọn (FR-041 + UF-3 bước 3). Chỉ dữ liệu thật; nội dung là văn bản thuần (React
 * tự thoát HTML). Khóa mềm do `CommentLock` (client) lấy/gia hạn/mở. Hành động trả lời/ẩn/bỏ qua làm ở việc sau.
 */
export async function CommentDetailPanel({
  comment,
  timeZone,
  now,
}: {
  comment: CommentDetailView;
  timeZone: string;
  now: Date;
}) {
  const [t, rawLocale] = await Promise.all([getTranslations('comments'), getLocale()]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  const status = (STATUSES as readonly string[]).includes(comment.status)
    ? t(`status.${comment.status as (typeof STATUSES)[number]}`)
    : comment.status;
  const platform = (PLATFORMS as readonly string[]).includes(comment.platform)
    ? t(`platforms.${comment.platform as (typeof PLATFORMS)[number]}`)
    : comment.platform;
  const isDeleted = comment.deletedAt !== null;
  // Khách đã xóa: nội dung và danh tính đã bị xóa trắng ở DB (FR-048) → báo rõ thay vì khung rỗng.
  const bodyText = isDeleted ? t('detail.redacted') : comment.text || t('detail.noText');
  const reply = deriveReplyUi({ ...comment, deleted: isDeleted });
  // Nút hiện theo khả năng của nền tảng (docs/08: không hỗ trợ thì không hiện nút).
  const declared = (PLATFORMS as readonly string[]).includes(comment.platform)
    ? DECLARED_CAPABILITIES[comment.platform as (typeof PLATFORMS)[number]]
    : null;
  const hideUi = deriveHideUi({
    ...comment,
    deleted: isDeleted,
    supports: {
      hide: declared?.hide.supported === true,
      unhide: declared?.unhide.supported === true,
    },
  });
  const hideLabels = {
    hide: t('hide.hide'),
    unhide: t('hide.unhide'),
    retry: t('hide.retry'),
    working: t('hide.working'),
    failures: {
      not_found: t('hide.failures.not_found'),
      not_hideable: t('hide.failures.not_hideable'),
      locked_by_other: t('hide.failures.locked_by_other'),
      channel_not_connected: t('hide.failures.channel_not_connected'),
      forbidden: t('hide.failures.forbidden'),
      queue_unavailable: t('hide.failures.queue_unavailable'),
      unavailable: t('hide.failures.unavailable'),
    },
  };
  const composerLabels = {
    field: t('reply.field'),
    placeholder: t('reply.placeholder'),
    send: t('reply.send'),
    retry: t('reply.retry'),
    sending: t('reply.sending'),
    hint: t('reply.hint'),
    // Chỗ giữ chỗ {count}/{max} được client thay (ICU không phân tích lại giá trị tham số).
    counter: t('reply.counter', { count: '{count}', max: '{max}' }),
    failures: {
      empty: t('reply.failures.empty'),
      too_long: t('reply.failures.too_long'),
      not_found: t('reply.failures.not_found'),
      not_replyable: t('reply.failures.not_replyable'),
      locked_by_other: t('reply.failures.locked_by_other'),
      channel_not_connected: t('reply.failures.channel_not_connected'),
      invalid_text: t('reply.failures.invalid_text'),
      forbidden: t('reply.failures.forbidden'),
      queue_unavailable: t('reply.failures.queue_unavailable'),
      unavailable: t('reply.failures.unavailable'),
    },
  };
  return (
    <article className="comment-detail" aria-label={t('detail.title')}>
      <CommentLock
        commentId={comment.id}
        labels={{
          mine: t('lock.mine'),
          // Chỗ giữ chỗ {name}/{seconds} được client thay khi biết người giữ khóa (ICU không phân tích lại giá trị tham số).
          heldNamed: t('lock.heldNamed', { name: '{name}', seconds: '{seconds}' }),
          heldAnonymous: t('lock.heldAnonymous', { seconds: '{seconds}' }),
        }}
      />
      <header className="comment-detail-head">
        <h2 className="comment-detail-author">{comment.authorName ?? t('list.anonymous')}</h2>
        <time
          dateTime={comment.createdTime?.toISOString()}
          title={formatAbsoluteTime(comment.createdTime, locale, timeZone)}
        >
          {formatRelativeTime(comment.createdTime, now, locale)}
        </time>
      </header>
      <dl className="comment-detail-meta">
        <div>
          <dt>{t('detail.source')}</dt>
          <dd>
            {platform} · {comment.channelName}
          </dd>
        </div>
        <div>
          <dt>{t('detail.post')}</dt>
          <dd>
            <span className="comment-detail-code">{comment.postExternalId}</span>
            {comment.isAd ? <span className="chip">{t('list.ad')}</span> : null}
          </dd>
        </div>
        {isDeleted ? null : (
          <div>
            <dt>{t('detail.authorId')}</dt>
            <dd className="comment-detail-code">{comment.authorExternalId}</dd>
          </div>
        )}
      </dl>
      {comment.parentExternalId ? (
        <p className="comment-detail-reply">{t('detail.isReply')}</p>
      ) : null}
      <blockquote className="comment-detail-text">{bodyText}</blockquote>
      <div className="inbox-chips">
        <span className={`chip chip-status chip-${comment.status}`}>{status}</span>
        {comment.needsFollowup ? <span className="chip">{t('list.followup')}</span> : null}
        {comment.label ? <span className="chip">{comment.label}</span> : null}
      </div>
      <section className="reply-section" aria-label={t('reply.field')}>
        {reply.mode === 'compose' ? (
          <ReplyComposer
            commentId={comment.id}
            prefill={reply.prefill}
            labels={composerLabels}
            isRetry={false}
          />
        ) : null}
        {reply.mode === 'sending' ? (
          <ReplyProgress
            text={reply.text}
            labels={{
              sending: t('reply.stateSending'),
              slow: t('reply.stateSlow'),
              yourReply: t('reply.yourReply'),
            }}
          />
        ) : null}
        {reply.mode === 'sent' ? (
          <div className="reply-state reply-sent" role="status">
            <p className="reply-state-title">{t('reply.sentTitle')}</p>
            {reply.text ? <blockquote className="reply-quote">{reply.text}</blockquote> : null}
          </div>
        ) : null}
        {reply.mode === 'failed' ? (
          <>
            <div className="reply-state reply-failed" role="alert">
              <p className="reply-state-title">{t('reply.failedTitle')}</p>
              <p>
                {t('reply.failedWhy')} {t(`reply.errors.${replyErrorKey(reply.errorCode)}`)}
              </p>
            </div>
            {reply.canRetry ? (
              <ReplyComposer
                commentId={comment.id}
                prefill={reply.prefill}
                labels={composerLabels}
                isRetry
              />
            ) : null}
          </>
        ) : null}
        {reply.mode === 'blocked' ? (
          <p className="reply-state reply-blocked" role="status">
            {reply.reason === 'locked_by_other'
              ? reply.holderName
                ? t('reply.blocked.lockedNamed', { name: reply.holderName })
                : t('reply.blocked.lockedAnonymous')
              : reply.reason === 'channel_unavailable'
                ? t('reply.blocked.channelUnavailable')
                : reply.reason === 'deleted'
                  ? t('reply.blocked.deleted')
                  : t('reply.blocked.notReplyable')}
          </p>
        ) : null}
      </section>
      {hideUi.mode === 'none' ? null : (
        <section className="hide-section" aria-label={t('hide.section')}>
          {hideUi.mode === 'can' ? (
            <HideButton
              commentId={comment.id}
              action={hideUi.action}
              isRetry={false}
              labels={hideLabels}
            />
          ) : null}
          {hideUi.mode === 'pending' ? (
            <HideProgress
              labels={{
                working: hideUi.action === 'hide' ? t('hide.stateHiding') : t('hide.stateUnhiding'),
                slow: t('hide.stateSlow'),
              }}
            />
          ) : null}
          {hideUi.mode === 'failed' ? (
            <>
              <div className="reply-state reply-failed" role="alert">
                <p className="reply-state-title">
                  {hideUi.action === 'hide' ? t('hide.failedHide') : t('hide.failedUnhide')}
                </p>
                <p>
                  {t('hide.failedWhy')} {t(`hide.errors.${hideErrorKey(hideUi.errorCode)}`)}
                </p>
              </div>
              {hideUi.canRetry ? (
                <HideButton
                  commentId={comment.id}
                  action={hideUi.action}
                  isRetry
                  labels={hideLabels}
                />
              ) : null}
            </>
          ) : null}
          {hideUi.mode === 'blocked' ? (
            <p className="reply-state reply-blocked" role="status">
              {hideUi.reason === 'locked_by_other'
                ? hideUi.holderName
                  ? t('hide.blocked.lockedNamed', { name: hideUi.holderName })
                  : t('hide.blocked.lockedAnonymous')
                : hideUi.reason === 'channel_unavailable'
                  ? t('hide.blocked.channelUnavailable')
                  : t('hide.blocked.notHideable')}
            </p>
          ) : null}
        </section>
      )}
    </article>
  );
}

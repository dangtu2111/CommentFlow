import { isLocale } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatAbsoluteTime, formatRelativeTime } from '../../lib/inbox-format';
import { replyErrorKey } from '../../lib/reply-errors';
import { deriveReplyUi, type ReplyUiDetail } from '../../lib/reply-state';
import { CommentLock } from './comment-lock';
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
  const reply = deriveReplyUi(comment);
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
        <div>
          <dt>{t('detail.authorId')}</dt>
          <dd className="comment-detail-code">{comment.authorExternalId}</dd>
        </div>
      </dl>
      {comment.parentExternalId ? (
        <p className="comment-detail-reply">{t('detail.isReply')}</p>
      ) : null}
      <blockquote className="comment-detail-text">{comment.text || t('detail.noText')}</blockquote>
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
                : t('reply.blocked.notReplyable')}
          </p>
        ) : null}
      </section>
    </article>
  );
}

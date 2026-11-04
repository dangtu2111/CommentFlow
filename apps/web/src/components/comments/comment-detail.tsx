import { isLocale } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatAbsoluteTime, formatRelativeTime } from '../../lib/inbox-format';
import { CommentLock } from './comment-lock';

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
    </article>
  );
}

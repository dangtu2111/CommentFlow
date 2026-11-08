import { DECLARED_CAPABILITIES } from '@flow/connectors';
import { isCommentLabel, isLocale } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { hideErrorKey } from '../../lib/hide-errors';
import { deriveHideUi, type HideUiDetail } from '../../lib/hide-state';
import { formatAbsoluteTime, formatRelativeTime, toIsoString } from '../../lib/inbox-format';
import { platformBadgeText } from '../../lib/inbox-visual';
import { replyErrorKey } from '../../lib/reply-errors';
import { deriveReplyUi, type ReplyUiDetail } from '../../lib/reply-state';
import type { SuggestionView } from '../../lib/suggestion';
import { userInitials } from '../../lib/user-initials';
import { canRequestSuggestion } from '../../server/suggestion-request';
import { Avatar } from '../ui/avatar';
import { Icon } from '../ui/icon';
import { Kbd } from '../ui/kbd';
import { CommentLock } from './comment-lock';
import { DOCK_BUTTON, DOCK_BUTTON_AI } from './dock-styles';
import { HideButton } from './hide-button';
import { HideProgress } from './hide-progress';
import { LabelChip, StatusChip } from './label-chip';
import { RelabelSelect } from './relabel-select';
import { ReplyComposer } from './reply-composer';
import { ReplyProgress } from './reply-progress';
import { RequestSuggestionButton } from './request-suggestion-button';
import { QuoteBlock, StateNote } from './state-note';

/** Thẻ trong cột chi tiết (Stitch: `rounded-xl bg-surface-container-lowest p-4 shadow-sm space-y-3`). */
const CARD = 'space-y-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm';
const CARD_TITLE = 'flex items-center gap-2 font-title-sm text-title-sm font-bold text-on-surface';
const ICON_BTN =
  'rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container aria-[disabled=true]:opacity-60 aria-[disabled=true]:hover:bg-transparent';

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
  /** Gợi ý AI (FR-043). Chưa có nguồn dữ liệu (bảng `drafts`, SUGGEST-UI-PERSIST) → không truyền. */
  suggestion?: SuggestionView | null;
  /** Bản nháp AI mới nhất (lý do cần nhân viên khi là "Cần nhân viên"); `null`/thiếu = chưa có. */
  aiDraft?: { action: string; reason: string | null; createdAt: Date } | null;
  /** Dữ liệu bổ sung của thiết kế (sản phẩm đính kèm, CRM, độ tin cậy) — chưa có nguồn thật, chỉ trang xem mẫu truyền. */
  extras?: CommentDetailExtras;
};

export type CommentDetailExtras = {
  post?: { title: string; product: string; stock: string };
  customer?: { badge: string; meta: string; history: string; purchase: string };
  ai?: { confidence: string; reason: string };
};

/** Lý do "Cần nhân viên" do hệ thống ghi (bản nháp giữ chỗ); lý do khác (quyết định của AI) hiện câu chung. */
const AI_REASONS = [
  'quota_exhausted',
  'attempts_exhausted',
  'ai_invalid_output',
  'customer_post_reply_cap',
];

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
  preview = false,
  pipelineOn = false,
}: {
  comment: CommentDetailView;
  timeZone: string;
  now: Date;
  /** Cờ DB `cf.pipeline.v2` đang bật cho workspace (trang tính; mặc định tắt) — quyết định nút "Soạn gợi ý" hay ghi chú AI chưa bật. */
  pipelineOn?: boolean;
  /** Trang xem mẫu `/dev/ui/comments`: không lấy khóa mềm (không có phiên). */
  preview?: boolean;
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
  const { extras } = comment;
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
  // Nút Ẩn vào thanh hành động dính đáy khi đang soạn trả lời (thiết kế Stitch); trạng thái khác giữ khối riêng.
  const hideInDock = hideUi.mode === 'can' && reply.mode === 'compose';
  // Câu AI soạn sẵn nằm trong ô soạn (thiết kế Stitch); người vẫn phải bấm gửi. Chỉ khi chưa có nội dung đã nhập.
  const composePrefill =
    reply.mode === 'compose' && reply.prefill === '' ? (comment.suggestion?.text ?? '') : '';
  const soonKey = (key: string) => t('reply.shortcutSoon', { key });
  // Trạng thái AI cho nhân viên (PIPE-ORCHESTRATOR lát F): "đang soạn", lý do cần nhân viên, nút "Soạn gợi ý" (chưa có nháp / cần nhân viên).
  const aiReason = comment.status === 'needs_human' ? (comment.aiDraft?.reason ?? null) : null;
  const askable = canRequestSuggestion({ status: comment.status, deletedAt: comment.deletedAt });
  const aiNote = (
    <div
      className="space-y-2 rounded-xl bg-surface-container-lowest p-3 shadow-sm"
      aria-live="polite"
    >
      {comment.status === 'processing' ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant" role="status">
          {t('ai.working')}
        </p>
      ) : null}
      {comment.suggestion ? (
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          {t('ai.draftCaption')}
        </p>
      ) : null}
      {aiReason !== null ? (
        <p className="rounded bg-tertiary-fixed px-2.5 py-1.5 font-body-sm text-body-sm text-on-tertiary-fixed-variant">
          {t(`ai.reasons.${AI_REASONS.includes(aiReason) ? aiReason : 'other'}`)}
        </p>
      ) : null}
      {askable && !isDeleted && pipelineOn ? (
        <RequestSuggestionButton
          commentId={comment.id}
          labels={{
            request: t('ai.request'),
            working: t('ai.requesting'),
            requested: t('ai.requested'),
            failures: {
              not_found: t('ai.failures.not_found'),
              not_eligible: t('ai.failures.not_eligible'),
              pipeline_off: t('ai.failures.pipeline_off'),
              unavailable: t('ai.failures.unavailable'),
            },
          }}
        />
      ) : null}
      {askable && !isDeleted && !pipelineOn ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">{t('ai.off')}</p>
      ) : null}
    </div>
  );
  const hideButton =
    hideUi.mode === 'can' ? (
      <HideButton
        commentId={comment.id}
        action={hideUi.action}
        isRetry={false}
        labels={hideLabels}
      />
    ) : null;
  const composerLabels = {
    field: t('reply.field'),
    placeholder: t('reply.placeholder'),
    send: t('reply.send'),
    retry: t('reply.retry'),
    sending: t('reply.sending'),
    hint: t('reply.hint'),
    // Chỗ giữ chỗ {count}/{max} được client thay (ICU không phân tích lại giá trị tham số).
    counter: t('reply.counter', { count: '{count}', max: '{max}' }),
    suggestedTitle: t('reply.suggestedTitle'),
    rewrite: t('reply.rewrite'),
    emoji: t('reply.emoji'),
    sourcesLabel: t('reply.sourcesLabel'),
    soon: t('soon'),
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
  const suggestionLabels = {
    title: t('suggestion.title'),
    use: t('suggestion.use'),
    edited: t('suggestion.edited'),
    needsHuman: t('suggestion.needsHuman'),
    sources: t('suggestion.sources'),
    sourceFallback: t('suggestion.sourceFallback'),
    // Chỗ giữ chỗ {count} được client thay (ICU không phân tích lại giá trị tham số).
    more: t('suggestion.more', { count: '{count}' }),
  };
  const relabelLabels = {
    field: t('relabel.field'),
    apply: t('relabel.apply'),
    working: t('relabel.working'),
    failed: t('relabel.failed'),
    options: {
      price: t('labels.price'),
      advice: t('labels.advice'),
      purchase: t('labels.purchase'),
      complaint: t('labels.complaint'),
      spam: t('labels.spam'),
      other: t('labels.other'),
    },
  };
  return (
    <article className="flex min-h-full flex-1 flex-col" aria-label={t('detail.title')}>
      {preview ? null : (
        <CommentLock
          commentId={comment.id}
          labels={{
            mine: t('lock.mine'),
            // Chỗ giữ chỗ {name}/{seconds} được client thay khi biết người giữ khóa (ICU không phân tích lại giá trị tham số).
            heldNamed: t('lock.heldNamed', { name: '{name}', seconds: '{seconds}' }),
            heldAnonymous: t('lock.heldAnonymous', { seconds: '{seconds}' }),
          }}
        />
      )}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-5 pt-5">
        <div className="space-y-2.5 rounded-xl bg-surface-container-low p-3.5 shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-label-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-container text-on-primary">
                <Icon name="feed" size={12} />
              </span>
              {t('detail.postContext')}
            </span>
            <span className="flex items-center gap-2">
              {comment.isAd ? (
                <span className="rounded bg-tertiary/10 px-1.5 py-0.5 font-label-sm text-label-sm font-bold text-tertiary">
                  {t('list.ad')}
                </span>
              ) : null}
              {/* Chưa lưu đường dẫn bài viết → liên kết vô hiệu (UI-first). */}
              <span
                className="inline-flex items-center gap-1 font-label-md text-label-md text-primary aria-[disabled=true]:opacity-60"
                aria-disabled="true"
                title={t('soon')}
              >
                {t('detail.openOn', { platform })}
                <Icon name="open_in_new" size={14} />
              </span>
            </span>
          </header>
          {extras?.post ? (
            <div className="flex items-start gap-3">
              <div className="min-w-0 space-y-1.5">
                <h3 className="line-clamp-1 font-title-md text-title-md font-bold leading-snug text-on-surface">
                  {extras.post.title}
                </h3>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded bg-surface-container-highest px-2.5 py-1 font-label-sm text-label-sm font-semibold text-on-surface">
                    <span className="text-primary-container">
                      <Icon name="sell" size={12} />
                    </span>
                    {extras.post.product}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {extras.post.stock}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <dl className="grid gap-1.5 font-body-sm text-body-sm sm:grid-cols-2">
              <div>
                <dt className="font-label-sm text-label-sm text-on-surface-variant">
                  {t('detail.source')}
                </dt>
                <dd className="text-on-surface">
                  {platform} · {comment.channelName}
                </dd>
              </div>
              <div>
                <dt className="font-label-sm text-label-sm text-on-surface-variant">
                  {t('detail.post')}
                </dt>
                <dd className="break-all font-code-sm text-code-sm text-on-surface">
                  {comment.postExternalId}
                </dd>
              </div>
            </dl>
          )}
        </div>
        <div className={CARD}>
          <header className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar badge={platformBadgeText(comment.platform)}>
                {userInitials(comment.authorName ?? t('list.anonymous'))}
              </Avatar>
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
                  {comment.authorName ?? t('list.anonymous')}
                  {extras?.customer ? (
                    <span className="rounded-full bg-secondary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold text-on-secondary-fixed">
                      {extras.customer.badge}
                    </span>
                  ) : null}
                </h2>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {extras?.customer ? (
                    extras.customer.meta
                  ) : (
                    <>
                      <time
                        dateTime={toIsoString(comment.createdTime)}
                        title={formatAbsoluteTime(comment.createdTime, locale, timeZone)}
                      >
                        {formatRelativeTime(comment.createdTime, now, locale)}
                      </time>
                      {isDeleted ? null : (
                        <>
                          {' · '}
                          <span className="font-code-sm text-code-sm">
                            {comment.authorExternalId}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className={ICON_BTN}
                aria-disabled="true"
                title={t('detail.addNote')}
              >
                <Icon name="note_add" size={16} />
              </button>
              <button
                type="button"
                className={ICON_BTN}
                aria-disabled="true"
                title={t('detail.openCrm')}
              >
                <Icon name="person" size={16} />
              </button>
            </div>
          </header>
          {comment.parentExternalId ? (
            <p className="font-label-md text-label-md text-on-surface-variant">
              {t('detail.isReply')}
            </p>
          ) : null}
          <blockquote className="whitespace-pre-wrap break-words rounded-lg bg-surface-container p-3.5 font-body-lg text-body-lg text-on-surface">
            {bodyText}
          </blockquote>
          {extras?.customer ? (
            <p className="flex flex-wrap items-center gap-2 px-1 font-label-sm text-label-sm text-on-surface-variant">
              <span className="text-primary">
                <Icon name="history" size={14} />
              </span>
              <strong className="font-medium">{extras.customer.history}</strong>
              <span aria-hidden="true">•</span>
              <em className="font-semibold not-italic text-primary">{extras.customer.purchase}</em>
            </p>
          ) : null}
        </div>
        <div className="space-y-3 rounded-xl bg-secondary-fixed/30 p-4 shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-on-secondary">
                <Icon name="psychology" size={16} />
              </span>
              <div>
                <span className={CARD_TITLE}>{t('detail.aiTitle')}</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  {comment.label ? (
                    <LabelChip label={comment.label} lead={false}>
                      {isCommentLabel(comment.label) ? t(`labels.${comment.label}`) : comment.label}
                    </LabelChip>
                  ) : null}
                  <StatusChip status={comment.status}>{status}</StatusChip>
                  {comment.needsFollowup ? (
                    <span className="rounded-full bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
                      {t('list.followup')}
                    </span>
                  ) : null}
                  {extras?.ai ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-lowest px-2 py-0.5 font-label-sm text-label-sm font-bold text-secondary shadow-sm">
                      <Icon name="verified" size={12} />
                      {extras.ai.confidence}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {isDeleted ? null : (
              <RelabelSelect
                commentId={comment.id}
                current={comment.label}
                labels={relabelLabels}
              />
            )}
          </header>
          {extras?.ai ? (
            <p className="flex items-center gap-2 rounded bg-surface-container-lowest/80 p-2.5 font-body-sm text-body-sm text-on-surface shadow-sm">
              <span className="shrink-0 text-secondary">
                <Icon name="lightbulb" size={16} />
              </span>
              <span>
                <strong>{t('detail.reason')}</strong> {extras.ai.reason}
              </span>
            </p>
          ) : null}
        </div>
        {aiNote}
        <section className="flex flex-1 flex-col gap-3" aria-label={t('reply.field')}>
          {reply.mode === 'compose' ? (
            <ReplyComposer
              commentId={comment.id}
              prefill={composePrefill || reply.prefill}
              labels={composerLabels}
              isRetry={false}
              suggestion={comment.suggestion ?? null}
              suggestionLabels={suggestionLabels}
              dockStart={
                <>
                  {hideInDock ? <span title={soonKey('H')}>{hideButton}</span> : null}
                  {/* Bỏ qua/Nhắn riêng/Thêm hành động cho MỘT bình luận chưa có (chỉ hàng loạt) → vô hiệu. */}
                  <button
                    type="button"
                    className={DOCK_BUTTON}
                    aria-disabled="true"
                    title={soonKey('E')}
                  >
                    <Icon name="archive" size={16} />
                    <span>{t('reply.skip')}</span>
                    <Kbd>E</Kbd>
                  </button>
                  <button
                    type="button"
                    className={`${DOCK_BUTTON} ${DOCK_BUTTON_AI}`}
                    aria-disabled="true"
                    title={soonKey('M')}
                  >
                    <span className="text-secondary">
                      <Icon name="mail" size={16} />
                    </span>
                    <span>{t('reply.privateReply')}</span>
                    <Kbd>M</Kbd>
                  </button>
                  <button
                    type="button"
                    className={`${DOCK_BUTTON} w-9 justify-center px-0`}
                    aria-disabled="true"
                    title={t('reply.moreActions')}
                  >
                    <Icon name="more_horiz" size={16} />
                  </button>
                </>
              }
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
            <StateNote tone="success" role="status" title={t('reply.sentTitle')}>
              {reply.text ? <QuoteBlock>{reply.text}</QuoteBlock> : null}
            </StateNote>
          ) : null}
          {reply.mode === 'failed' ? (
            <>
              <StateNote tone="danger" role="alert" title={t('reply.failedTitle')}>
                <p>
                  {t('reply.failedWhy')} {t(`reply.errors.${replyErrorKey(reply.errorCode)}`)}
                </p>
              </StateNote>
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
            <StateNote tone="muted" role="status">
              {reply.reason === 'locked_by_other'
                ? reply.holderName
                  ? t('reply.blocked.lockedNamed', { name: reply.holderName })
                  : t('reply.blocked.lockedAnonymous')
                : reply.reason === 'channel_unavailable'
                  ? t('reply.blocked.channelUnavailable')
                  : reply.reason === 'deleted'
                    ? t('reply.blocked.deleted')
                    : t('reply.blocked.notReplyable')}
            </StateNote>
          ) : null}
        </section>
        {hideUi.mode === 'none' || hideInDock ? null : (
          <section className="mb-5 flex flex-col gap-3" aria-label={t('hide.section')}>
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
                  working:
                    hideUi.action === 'hide' ? t('hide.stateHiding') : t('hide.stateUnhiding'),
                  slow: t('hide.stateSlow'),
                }}
              />
            ) : null}
            {hideUi.mode === 'failed' ? (
              <>
                <StateNote
                  tone="danger"
                  role="alert"
                  title={hideUi.action === 'hide' ? t('hide.failedHide') : t('hide.failedUnhide')}
                >
                  <p>
                    {t('hide.failedWhy')} {t(`hide.errors.${hideErrorKey(hideUi.errorCode)}`)}
                  </p>
                </StateNote>
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
              <StateNote tone="muted" role="status">
                {hideUi.reason === 'locked_by_other'
                  ? hideUi.holderName
                    ? t('hide.blocked.lockedNamed', { name: hideUi.holderName })
                    : t('hide.blocked.lockedAnonymous')
                  : hideUi.reason === 'channel_unavailable'
                    ? t('hide.blocked.channelUnavailable')
                    : t('hide.blocked.notHideable')}
              </StateNote>
            ) : null}
          </section>
        )}
      </div>
    </article>
  );
}

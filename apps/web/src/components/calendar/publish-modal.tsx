'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { updatePublishPostAction } from '../../app/app/(guarded)/calendar/actions';
import {
  cancelPublishScheduleAction,
  deletePublishPostAction,
} from '../../app/app/(guarded)/composer/actions';
import { cx } from '../../lib/cx';
import { MAX_POST_CHARS } from '../../lib/publish-form';
import type { ComposerMedia } from '../composer/media-uploader';
import { PendingNote, PendingSubmit } from '../composer/pending-submit';
import { PostPreview } from '../composer/post-preview';
import { Icon } from '../ui/icon';

/**
 * Hộp thoại MỘT bài đăng từ CommentFlow trên Lịch (CALENDAR-DND): bên trái chỉnh nội dung và ngày/giờ (theo múi giờ cửa hàng), bên phải XEM TRƯỚC bài đúng như sẽ hiện trên Facebook
 * (cập nhật theo lúc gõ), kèm từng kênh và kết quả đăng. Thao tác theo trạng thái: nháp = Lưu nháp / Lên lịch đăng / Xóa; đã lên lịch = Lưu thay đổi / Hủy lịch; lỗi hoặc đăng một phần = Xóa;
 * đang đăng hoặc đã đăng = chỉ xem. Kênh, ảnh/video, sản phẩm và ghi chú AI sửa ở trình soạn đầy đủ (liên kết trong hộp thoại). Lên lịch/đổi giờ cần cờ đăng bài bật. Mọi thao tác là
 * Server Action (Owner; DB kiểm lại). Mã lỗi lạ không in ra. Đóng = liên kết về Lịch (không cần JavaScript). Chỉ dùng bên trong `.tw`.
 */
export type ModalTarget = {
  id: string;
  channelName: string;
  avatarUrl: string | null;
  status: 'pending' | 'publishing' | 'published' | 'failed' | 'unknown';
  errorCode: string | null;
};

export type ModalPost = {
  id: string;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed';
  message: string;
  /** Ngày `YYYY-MM-DD` và giờ `HH:MM` ĐỊA PHƯƠNG của giờ đã lên lịch/đã đăng (rỗng nếu chưa có). */
  date: string;
  time: string;
  targets: ModalTarget[];
};

const KNOWN_ERRORS = new Set([
  'missing_permission',
  'permission',
  'token_expired',
  'invalid_post',
  'rate_limited',
  'unknown_result',
  'lease_expired',
  'media_unavailable',
  'media_upload_failed',
]);
const TARGET_STYLE: Record<string, string> = {
  pending: 'bg-surface-container-high text-on-surface',
  publishing: 'bg-tertiary-fixed text-on-tertiary-fixed',
  published: 'bg-primary-fixed text-on-primary-fixed-variant',
  failed: 'bg-error-container text-on-error-container',
  unknown: 'bg-tertiary-fixed text-on-tertiary-fixed',
};
const DEFAULT_TIME = '09:00';
const FACEBOOK = 'facebook' as const;
const field =
  'w-full rounded-lg bg-surface-container-low px-space-sm py-space-xs font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container';
const actionBtn =
  'inline-flex items-center gap-1 rounded-lg px-space-md py-space-sm font-title-sm text-title-sm';

export function PublishModal({
  post,
  media,
  closeHref,
  timeZone,
  publishEnabled,
  prefillDate,
}: {
  post: ModalPost;
  media: ComposerMedia[];
  closeHref: string;
  timeZone: string;
  publishEnabled: boolean;
  /** Ngày đã chọn khi kéo bản nháp vào một ngày (`YYYY-MM-DD`). */
  prefillDate?: string | undefined;
}) {
  const t = useTranslations('calendar');
  const editable = post.status === 'draft' || post.status === 'scheduled';
  const deletable =
    post.status === 'draft' || post.status === 'failed' || post.status === 'partial';
  const isScheduled = post.status === 'scheduled';
  const [message, setMessage] = useState(post.message);
  const [date, setDate] = useState(post.date || prefillDate || '');
  const [time, setTime] = useState(post.time || DEFAULT_TIME);
  const hasChannel = post.targets.length > 0;
  const canSchedule =
    publishEnabled && message.trim() !== '' && hasChannel && date !== '' && time !== '';
  const first = post.targets[0];
  return (
    <>
      <Link
        href={closeHref}
        aria-label={t('drawer.close')}
        className="fixed inset-0 z-40 bg-inverse-surface/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('modal.title')}
        className="fixed inset-x-space-sm bottom-space-sm top-space-sm z-50 mx-auto flex max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-2xl md:inset-y-space-lg"
      >
        <div className="flex items-center justify-between gap-space-sm border-b border-outline-variant px-space-lg py-space-md">
          <h2 className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface">
            <Icon name="feed" size={20} />
            {t('modal.title')}
            <span
              className={cx(
                'rounded px-1.5 py-0.5 font-label-sm text-label-sm',
                isScheduled ? 'bg-secondary-fixed text-on-secondary-fixed' : TARGET_STYLE.pending,
              )}
            >
              {t(`status.${post.status}`)}
            </span>
          </h2>
          <Link
            href={closeHref}
            aria-label={t('drawer.close')}
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <Icon name="close" size={20} />
          </Link>
        </div>

        <form
          action={updatePublishPostAction}
          className="grid min-h-0 flex-1 grid-cols-1 gap-space-lg overflow-y-auto p-space-lg md:grid-cols-2"
        >
          <input type="hidden" name="postId" value={post.id} />
          <div className="flex flex-col gap-space-md">
            <label className="flex flex-col gap-space-xs">
              <span className="font-label-md text-label-md font-semibold text-on-surface">
                {t('modal.content')}
              </span>
              <textarea
                name="message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                readOnly={!editable}
                maxLength={MAX_POST_CHARS}
                rows={8}
                className={cx(field, 'resize-y leading-relaxed')}
              />
            </label>

            {editable ? (
              <fieldset className="grid grid-cols-2 gap-space-sm">
                <legend className="mb-space-xs font-label-md text-label-md font-semibold text-on-surface">
                  {t('modal.when')}
                </legend>
                <label className="flex flex-col gap-space-xs font-label-sm text-label-sm text-on-surface-variant">
                  {t('modal.date')}
                  <input
                    type="date"
                    name="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className={field}
                  />
                </label>
                <label className="flex flex-col gap-space-xs font-label-sm text-label-sm text-on-surface-variant">
                  {t('modal.time')}
                  <input
                    type="time"
                    name="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className={field}
                  />
                </label>
                <p className="col-span-2 font-label-sm text-label-sm text-on-surface-variant">
                  {t('modal.zone', { zone: timeZone })}
                  {!isScheduled && prefillDate ? ` · ${t('modal.prefilled')}` : ''}
                </p>
              </fieldset>
            ) : post.date ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('own.scheduledAt')}: {post.date} {post.time}
              </p>
            ) : null}

            <section className="flex flex-col gap-space-xs">
              <h3 className="font-label-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                {t('own.targets')}
              </h3>
              {hasChannel ? (
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
              ) : (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {t('modal.noChannel')}
                </p>
              )}
              {editable ? (
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {t('modal.fullEditorHint')}
                </p>
              ) : null}
            </section>

            {!editable && !deletable ? (
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                {t('own.lockedHint')}
              </p>
            ) : null}
            {editable && !publishEnabled ? (
              <p className="rounded-lg bg-tertiary-fixed/40 p-space-sm font-label-sm text-label-sm text-on-surface">
                {t('modal.publishOff')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-space-sm">
            <h3 className="font-label-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
              {t('modal.preview')}
            </h3>
            <PostPreview
              platform={FACEBOOK}
              pageName={first?.channelName ?? null}
              pageAvatarUrl={first?.avatarUrl ?? null}
              text={message}
              media={media}
            />
          </div>

          <div className="col-span-full flex flex-wrap items-center gap-space-sm border-t border-outline-variant pt-space-md">
            {editable ? (
              <Link
                href={`/app/composer?id=${post.id}`}
                className={cx(
                  actionBtn,
                  'bg-surface-container-low text-on-surface hover:bg-surface-container',
                )}
              >
                <Icon name="edit" size={16} />
                {t('own.edit')}
              </Link>
            ) : null}
            {post.status === 'draft' ? (
              <>
                <PendingSubmit
                  name="intent"
                  value="draft"
                  pendingLabel={t('own.pending')}
                  className={cx(
                    actionBtn,
                    'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
                  )}
                >
                  <Icon name="draft" size={16} />
                  {t('modal.saveDraft')}
                </PendingSubmit>
                <PendingSubmit
                  name="intent"
                  value="schedule"
                  disabled={!canSchedule}
                  pendingLabel={t('own.pending')}
                  className={cx(
                    actionBtn,
                    'bg-primary-container font-bold text-on-primary hover:bg-primary',
                  )}
                >
                  <Icon name="schedule_send" size={16} />
                  {t('modal.schedule')}
                </PendingSubmit>
              </>
            ) : null}
            {isScheduled ? (
              <>
                <PendingSubmit
                  name="intent"
                  value="save"
                  disabled={!canSchedule}
                  pendingLabel={t('own.pending')}
                  className={cx(
                    actionBtn,
                    'bg-primary-container font-bold text-on-primary hover:bg-primary',
                  )}
                >
                  <Icon name="check" size={16} />
                  {t('modal.saveChanges')}
                </PendingSubmit>
                <PendingSubmit
                  formAction={cancelPublishScheduleAction}
                  pendingLabel={t('own.pending')}
                  className={cx(
                    actionBtn,
                    'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
                  )}
                >
                  <Icon name="event_busy" size={16} />
                  {t('own.cancel')}
                </PendingSubmit>
              </>
            ) : null}
            {deletable ? (
              <PendingSubmit
                formAction={deletePublishPostAction}
                pendingLabel={t('own.pending')}
                className={cx(
                  actionBtn,
                  'bg-surface-container-low text-error hover:bg-surface-container',
                )}
              >
                <Icon name="delete" size={16} />
                {t('own.delete')}
              </PendingSubmit>
            ) : null}
            <PendingNote>{t('own.pendingNote')}</PendingNote>
          </div>
        </form>
      </div>
    </>
  );
}

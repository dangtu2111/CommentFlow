'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  type AvatarState,
  removeAvatarAction,
  saveProfileAction,
  uploadAvatarAction,
} from '../../app/app/(guarded)/settings/profile-actions';
import { PROFILE_IDLE, PROFILE_NAME_MAX } from '../../lib/profile-state';
import { userInitials } from '../../lib/user-initials';
import { Icon } from '../ui/icon';
import { TwDialog, TwDialogTrigger } from './tw/dialog';
import { twBtn } from './tw/ui';

export const PROFILE_DIALOG_ID = 'profile-edit-dialog';
export const PHONE_DIALOG_ID = 'phone-verify-dialog';

const FIELD_CLASS =
  'w-full px-3 py-2 text-sm text-on-surface bg-surface-container-lowest rounded-lg border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary-container focus:border-primary-container placeholder:text-outline transition aria-[invalid=true]:border-error aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-error';
const LABEL_CLASS = 'font-label-sm text-label-sm font-semibold text-on-surface';

export type TimezoneOption = { value: string; label: string };

/** Nút lưu: trạng thái "Đang lưu thay đổi..." ở chân hộp thoại (Stitch) chỉ hiện khi Server Action đang chạy. */
function SaveBar({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations('settings.profile');
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center justify-between gap-space-md pt-space-sm border-t border-surface-container">
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 font-label-sm text-label-sm font-medium text-primary"
      >
        {pending ? (
          <>
            <Icon name="progress_activity" size={16} className="animate-spin" />
            {t('saving')}
          </>
        ) : null}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className={twBtn({ tone: 'plain' })}>
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={twBtn({ tone: 'primary' })}
        >
          {t('save')}
        </button>
      </div>
    </div>
  );
}

/** Nhóm ảnh đại diện: Đổi/Xóa (hai form riêng vì đẩy tệp multipart). Cờ tắt → vô hiệu + chú thích. */
function AvatarGroup({
  name,
  image,
  enabled,
}: {
  name: string;
  image: string | null;
  enabled: boolean;
}) {
  const t = useTranslations('settings.profile');
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, uploadAction] = useActionState<AvatarState, FormData>(uploadAvatarAction, {
    status: 'idle',
  });
  const [removal, removeAction] = useActionState<AvatarState, FormData>(removeAvatarAction, {
    status: 'idle',
  });
  const result = removal.status !== 'idle' ? removal : upload;
  const message =
    result.status === 'error'
      ? t(`avatarErrors.${result.reason}`)
      : result.status === 'saved'
        ? t('avatarSaved')
        : result.status === 'removed'
          ? t('avatarRemoved')
          : null;
  return (
    <div
      data-purpose="avatar-upload-group"
      className="flex items-center gap-space-md p-space-md bg-surface-container-low rounded-xl"
    >
      <span
        aria-hidden="true"
        className="relative w-[72px] h-[72px] rounded-full shadow-sm shrink-0 bg-secondary-fixed text-on-secondary-fixed font-headline-sm text-headline-sm flex items-center justify-center overflow-hidden"
      >
        {image?.startsWith('https://') ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          userInitials(name)
        )}
      </span>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <form action={uploadAction} className="inline-flex">
            <input
              ref={fileRef}
              type="file"
              name="avatar"
              accept="image/png,image/jpeg"
              hidden
              disabled={!enabled}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            />
            <button
              type="button"
              disabled={!enabled}
              aria-disabled={!enabled}
              onClick={() => fileRef.current?.click()}
              className={twBtn({ tone: 'plain', size: 'sm' })}
            >
              <Icon name="upload" size={16} />
              {t('avatarChange')}
            </button>
          </form>
          <form action={removeAction} className="inline-flex">
            <button
              type="submit"
              disabled={!enabled || !image}
              aria-disabled={!enabled || !image}
              className={twBtn({ tone: 'danger-ghost', size: 'sm' })}
            >
              {t('avatarRemove')}
            </button>
          </form>
        </div>
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          {enabled ? t('avatarHint') : t('avatarOff')}
        </p>
        {message ? (
          <p
            role="status"
            className={
              result.status === 'error'
                ? 'font-label-sm text-label-sm text-error'
                : 'font-label-sm text-label-sm text-primary'
            }
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Hộp thoại "Chỉnh sửa thông tin" (Stitch `cai-dat-chinh-sua-thong-tin-ca-nhan-edit-profile-modal`): họ tên + múi giờ lưu
 * thật qua `saveProfileAction`; email CHỈ ĐỌC; SĐT chỉ đổi qua hộp thoại xác minh OTP (nút "Xác minh"/"Đổi số").
 */
export function ProfileDialog({
  name,
  email,
  emailVerified,
  image,
  timezone,
  timezones,
  phoneMasked,
  phoneVerifyEnabled,
  avatarEnabled,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  timezone: string;
  timezones: TimezoneOption[];
  phoneMasked: string;
  phoneVerifyEnabled: boolean;
  avatarEnabled: boolean;
}) {
  const t = useTranslations('settings.profile');
  const [state, action] = useActionState(saveProfileAction, PROFILE_IDLE);
  const [draft, setDraft] = useState(name);
  const errors = state.status === 'invalid' ? state.errors : {};
  const nameError = errors.name
    ? errors.name === 'required'
      ? t('nameRequired')
      : t('nameTooLong', { max: PROFILE_NAME_MAX })
    : null;
  const close = () => {
    const node = document.getElementById(PROFILE_DIALOG_ID);
    if (node instanceof HTMLDialogElement) node.close();
  };
  const openPhone = () => {
    close();
    const node = document.getElementById(PHONE_DIALOG_ID);
    if (node instanceof HTMLDialogElement && !node.open) node.showModal();
  };
  return (
    <>
      {/* Chỉ một hộp thoại; mở bằng ProfileTrigger (cùng dialogId). */}
      <TwDialog
        dialogId={PROFILE_DIALOG_ID}
        title={t('title')}
        description={t('body')}
        icon={<Icon name="badge" size={20} />}
        size="lg"
      >
        <div className="space-y-space-md">
          <AvatarGroup name={name} image={image} enabled={avatarEnabled} />
          <form
            action={action}
            noValidate
            className="space-y-space-md"
            data-purpose="profile-edit-form"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="profile-name" className={LABEL_CLASS}>
                  {t('nameLabel')} <span className="text-error">*</span>
                </label>
                <span className="font-mono text-[11px] text-on-surface-variant">
                  {t('nameCount', { count: draft.length, max: PROFILE_NAME_MAX })}
                </span>
              </div>
              <input
                id="profile-name"
                name="name"
                type="text"
                autoComplete="name"
                defaultValue={name}
                onChange={(event) => setDraft(event.target.value)}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? 'profile-name-error' : undefined}
                className={FIELD_CLASS}
              />
              {nameError ? (
                <p
                  id="profile-name-error"
                  role="alert"
                  className="flex items-center gap-1 font-label-sm text-label-sm font-medium text-error"
                >
                  <Icon name="error" size={14} />
                  {nameError}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="profile-email" className={LABEL_CLASS}>
                  {t('emailLabel')}
                </label>
                {emailVerified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold bg-[#EBF7ED] text-[#237A36]">
                    <Icon name="check" size={12} />
                    {t('emailVerified')}
                  </span>
                ) : null}
              </div>
              <div className="relative">
                <input
                  id="profile-email"
                  type="email"
                  value={email}
                  readOnly
                  disabled
                  className={`${FIELD_CLASS} pr-9 bg-surface-container-low text-on-surface-variant cursor-not-allowed`}
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant pointer-events-none">
                  <Icon name="lock" size={16} />
                </span>
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                {t('emailHint')}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="profile-phone" className={LABEL_CLASS}>
                {t('phoneLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="profile-phone"
                  type="text"
                  value={phoneMasked}
                  placeholder={t('phoneEmpty')}
                  readOnly
                  className={`${FIELD_CLASS} flex-1`}
                />
                <button
                  type="button"
                  onClick={openPhone}
                  disabled={!phoneVerifyEnabled}
                  aria-disabled={!phoneVerifyEnabled}
                  className={twBtn({ tone: 'soft' })}
                >
                  {phoneMasked ? t('phoneChange') : t('phoneVerify')}
                </button>
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                {t('phoneHint')}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="profile-timezone" className={LABEL_CLASS}>
                {t('timezoneLabel')}
              </label>
              <select
                id="profile-timezone"
                name="timezone"
                defaultValue={timezone}
                aria-invalid={errors.timezone ? true : undefined}
                className={`${FIELD_CLASS} cursor-pointer`}
              >
                {timezones.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
              {errors.timezone ? (
                <p role="alert" className="font-label-sm text-label-sm text-error">
                  {t('timezoneInvalid')}
                </p>
              ) : null}
            </div>

            {state.status === 'saved' ? (
              <p role="status" className="font-label-sm text-label-sm font-medium text-primary">
                {t('saved')}
              </p>
            ) : null}
            {state.status === 'error' ? (
              <p role="alert" className="font-label-sm text-label-sm font-medium text-error">
                {t('failed')}
              </p>
            ) : null}
            <SaveBar onCancel={close} />
          </form>
        </div>
      </TwDialog>
    </>
  );
}

/** Nút mở hộp thoại hồ sơ (đặt ở đầu thẻ Tài khoản). */
export function ProfileTrigger({ label }: { label: string }) {
  return (
    <TwDialogTrigger dialogId={PROFILE_DIALOG_ID} className={twBtn({ tone: 'soft' })}>
      <Icon name="edit" size={16} />
      {label}
    </TwDialogTrigger>
  );
}

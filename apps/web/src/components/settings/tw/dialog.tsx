'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '../../ui/icon';
import { type TwBtnProps, twBtn } from './ui';

const SIZE_CLASS = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-4xl' } as const;

/**
 * Hộp thoại `<dialog>` gốc theo Stitch (`settings-*-modal.html`): nền mờ, thẻ trắng `rounded-xl p-space-xl shadow-xl`.
 * Bọc bằng `data-tw` vì `<dialog>` modal nằm ở top-layer, ngoài `.tw` của trang. Nội dung giữ trong cây khi đóng
 * (trạng thái form/Server Action không mất). Nút mở dựng bằng `TwDialogTrigger` cùng `dialogId`.
 */
export function TwDialog({
  dialogId,
  title,
  description,
  icon,
  tone = 'primary',
  size = 'md',
  defaultOpen = false,
  children,
}: {
  dialogId: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** `danger` cho hộp thoại xác nhận nguy hiểm (biểu tượng đỏ ở trên cùng, như `settings-2fa-disable-modal`). */
  tone?: 'primary' | 'danger';
  size?: 'md' | 'lg' | 'xl';
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('dialog');
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = ref.current;
    if (defaultOpen && node && !node.open) node.showModal();
  }, [defaultOpen]);
  const danger = tone === 'danger';
  return (
    <dialog
      ref={ref}
      id={dialogId}
      data-tw=""
      aria-labelledby={titleId}
      className={`m-auto w-[calc(100%-2rem)] ${SIZE_CLASS[size]} rounded-xl bg-surface-container-lowest p-0 text-on-surface shadow-xl backdrop:bg-inverse-surface/40 backdrop:backdrop-blur-sm`}
    >
      <div className="relative p-space-xl space-y-space-md font-body-md">
        <div className={`flex ${danger ? 'flex-col gap-space-md' : 'items-start justify-between'}`}>
          <div className="flex items-start gap-2">
            {icon ? (
              <span
                aria-hidden="true"
                className={
                  danger
                    ? 'w-12 h-12 rounded-full bg-error-container text-error flex items-center justify-center'
                    : 'w-8 h-8 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shrink-0'
                }
              >
                {icon}
              </span>
            ) : null}
            {danger ? null : (
              <div>
                <h2 id={titleId} className="font-title-md text-title-md text-on-surface">
                  {title}
                </h2>
                {description ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    {description}
                  </p>
                ) : null}
              </div>
            )}
          </div>
          {danger ? (
            <div>
              <h2 id={titleId} className="font-headline-sm text-headline-sm text-on-surface">
                {title}
              </h2>
              {description ? (
                <p className="font-body-md text-body-md text-on-surface-variant mt-2">
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            aria-label={t('close')}
            onClick={() => ref.current?.close()}
            className={`w-8 h-8 rounded-lg text-on-surface-variant hover:bg-surface-container flex items-center justify-center ${danger ? 'absolute right-4 top-4' : ''}`}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Nút mở hộp thoại có `dialogId` tương ứng. */
export function TwDialogTrigger({
  dialogId,
  className,
  children,
}: {
  dialogId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className ?? twBtn({ tone: 'soft' })}
      aria-haspopup="dialog"
      onClick={() => {
        const node = document.getElementById(dialogId);
        if (node instanceof HTMLDialogElement && !node.open) node.showModal();
      }}
    >
      {children}
    </button>
  );
}

/** Nút gửi form Tailwind: khóa khi Server Action đang chạy (chống bấm đúp). */
export function TwSubmit({
  children,
  tone = 'primary',
  size = 'lg',
}: {
  children: ReactNode;
  tone?: TwBtnProps['tone'];
  size?: 'sm' | 'md' | 'lg';
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={twBtn({ tone, size })}>
      {children}
    </button>
  );
}

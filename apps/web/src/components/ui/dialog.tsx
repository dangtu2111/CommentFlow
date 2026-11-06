'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { buttonClass } from './button';
import { Chip } from './chip';

/**
 * Hộp thoại dùng `<dialog>` gốc (focus bị nhốt, Esc đóng, nền mờ do trình duyệt lo). Nội dung luôn được giữ trong cây
 * (chỉ ẩn khi đóng) nên trạng thái form/Server Action không mất khi người dùng đóng rồi mở lại.
 * Nút kích hoạt do bên ngoài tự dựng bằng `DialogTrigger` cùng `dialogId`.
 */
export function Dialog({
  dialogId,
  title,
  description,
  icon,
  badge,
  header,
  defaultOpen = false,
  children,
}: {
  dialogId: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  badge?: string;
  /** Khối chen giữa đầu hộp thoại và nội dung (ví dụ thanh bước). */
  header?: ReactNode;
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
  return (
    <dialog ref={ref} id={dialogId} className="dialog" aria-labelledby={titleId}>
      <div className="dialog-head">
        {icon ? (
          <span className="dialog-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="dialog-head-text">
          <h2 id={titleId} className="dialog-title">
            {title}
            {badge ? <Chip tone="info">{badge}</Chip> : null}
          </h2>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        <button
          type="button"
          className="dialog-close"
          aria-label={t('close')}
          onClick={() => ref.current?.close()}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {header}
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

/** Nút mở hộp thoại có `dialogId` tương ứng. */
export function DialogTrigger({
  dialogId,
  className = buttonClass({ variant: 'secondary' }),
  children,
}: {
  dialogId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
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

/** Đóng hộp thoại theo id (dùng khi một thao tác trong hộp thoại đã xong). */
export function closeDialog(dialogId: string): void {
  const node = document.getElementById(dialogId);
  if (node instanceof HTMLDialogElement && node.open) node.close();
}

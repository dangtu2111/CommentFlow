'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { hideCommentAction } from '../../app/app/(guarded)/comments/actions';
import type { HideAction } from '../../lib/hide-state';
import type { HideFailure } from '../../server/hide-action';

type Labels = {
  hide: string;
  unhide: string;
  retry: string;
  working: string;
  failures: Record<HideFailure, string>;
};

/**
 * Nút Ẩn / Bỏ ẩn (FR-044). Chỉ người bấm; khóa nút khi đang gửi lệnh (chống bấm đúp). Bấm xong làm tươi trang để hiện
 * "Đang ẩn…" (server render từ `comment_hides`); "Đã ẩn" chỉ hiện sau khi nền tảng xác nhận. Lỗi hiện thông báo đã
 * dịch, không mã thô.
 */
export function HideButton({
  commentId,
  action,
  isRetry,
  labels,
}: {
  commentId: string;
  action: HideAction;
  isRetry: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [error, setError] = useState<HideFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const text = pending
    ? labels.working
    : isRetry
      ? labels.retry
      : action === 'hide'
        ? labels.hide
        : labels.unhide;

  function submit() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await hideCommentAction(commentId, action === 'hide');
      if (result.ok) router.refresh();
      else setError(result.reason);
    });
  }

  return (
    <div className="hide-action">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={submit}
        disabled={pending}
        aria-busy={pending}
        aria-describedby={error ? `hide-error-${commentId}` : undefined}
      >
        {text}
      </button>
      {error ? (
        <p className="reply-error" role="alert" id={`hide-error-${commentId}`}>
          {labels.failures[error]}
        </p>
      ) : null}
    </div>
  );
}

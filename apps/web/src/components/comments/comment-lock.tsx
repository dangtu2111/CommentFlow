'use client';

import { useEffect, useState } from 'react';
import { lockCommentAction, unlockCommentAction } from '../../app/app/(guarded)/comments/actions';
import { LOCK_RENEW_MS, type LockViewState, toLockViewState } from '../../lib/comment-lock-result';

type Labels = {
  mine: string;
  /** Có `{name}` và `{seconds}`; đã được thay sẵn ở server bằng chỗ giữ chỗ, xem `formatHeld`. */
  heldNamed: string;
  heldAnonymous: string;
};

const formatHeld = (template: string, name: string | null, seconds: number) =>
  template.replace('{name}', name ?? '').replace('{seconds}', String(seconds));

/**
 * Khóa mềm khi MỞ bình luận (FR-041): lấy khóa khi mở, gia hạn mỗi 60 giây, mở khóa khi đóng/chuyển. Người khác đang
 * giữ → cảnh báo (chỉ xem). Là cảnh báo mềm: chặn gửi trùng thật sự ở `sendRecheck`. Bỏ tab → tự hết hạn sau 2 phút.
 */
export function CommentLock({ commentId, labels }: { commentId: string; labels: Labels }) {
  const [state, setState] = useState<LockViewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      try {
        const result = await lockCommentAction(commentId);
        if (!cancelled) setState(toLockViewState(result, new Date()));
      } catch {
        // Lỗi tạm thời (mạng): giữ trạng thái cũ, lần gia hạn sau thử lại.
      }
    };
    void acquire();
    const timer = setInterval(() => void acquire(), LOCK_RENEW_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      void unlockCommentAction(commentId).catch(() => undefined);
    };
  }, [commentId]);

  if (!state || state.kind === 'missing') return null;
  if (state.kind === 'mine') {
    return (
      <p className="comment-lock comment-lock-mine" role="status">
        {labels.mine}
      </p>
    );
  }
  return (
    <p className="comment-lock comment-lock-held" role="status">
      {state.holderName
        ? formatHeld(labels.heldNamed, state.holderName, state.secondsLeft)
        : formatHeld(labels.heldAnonymous, null, state.secondsLeft)}
    </p>
  );
}

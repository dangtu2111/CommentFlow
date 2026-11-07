'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { requestSuggestionAction } from '../../app/app/(guarded)/comments/actions';
import type { SuggestionFailure } from '../../server/suggestion-request';
import { DOCK_BUTTON } from './dock-styles';
import { InlineError } from './state-note';

type Labels = {
  request: string;
  working: string;
  requested: string;
  failures: Record<SuggestionFailure, string>;
};

/**
 * Nút "Soạn gợi ý" (PIPE-ORCHESTRATOR lát F, Q-POR8). Chỉ người bấm; khóa nút khi đang gửi yêu cầu (chống bấm đúp, thêm khóa ở hàng đợi và
 * worker). Bấm xong chỉ xếp yêu cầu — AI soạn ở nền, làm tươi để thấy "đang soạn"; KHÔNG gửi gì cho khách. Lỗi hiện thông báo dịch.
 */
export function RequestSuggestionButton({
  commentId,
  labels,
}: {
  commentId: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [error, setError] = useState<SuggestionFailure | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (pending || done) return;
    setError(null);
    startTransition(async () => {
      const result = await requestSuggestionAction(commentId);
      if (result.ok) {
        setDone(true);
        router.refresh();
      } else setError(result.reason);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className={DOCK_BUTTON}
        onClick={submit}
        disabled={pending || done}
        aria-busy={pending}
      >
        {pending ? labels.working : done ? labels.requested : labels.request}
      </button>
      {error ? <InlineError>{labels.failures[error]}</InlineError> : null}
    </div>
  );
}

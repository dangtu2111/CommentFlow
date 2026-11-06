'use client';

import { COMMENT_LABELS, type CommentLabel, isCommentLabel } from '@flow/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { relabelCommentsAction } from '../../app/app/(guarded)/comments/actions';

type Labels = {
  field: string;
  apply: string;
  working: string;
  failed: string;
  options: Record<CommentLabel, string>;
};

/** Đổi nhãn ý định của MỘT bình luận (FR-043): dùng lại hành động đổi nhãn hàng loạt; nhãn ghi là "do người đổi". */
export function RelabelSelect({
  commentId,
  current,
  labels,
}: {
  commentId: string;
  current: string | null;
  labels: Labels;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(isCommentLabel(current) ? current : '');
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply() {
    if (!isCommentLabel(value) || pending) return;
    setFailed(false);
    startTransition(async () => {
      const result = await relabelCommentsAction([commentId], value);
      if (result.ok && result.done > 0) router.refresh();
      else setFailed(true);
    });
  }

  return (
    <div className="relabel">
      <label htmlFor={`relabel-${commentId}`}>{labels.field}</label>
      <select
        id={`relabel-${commentId}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={pending}
      >
        <option value="" disabled>
          {labels.field}
        </option>
        {COMMENT_LABELS.map((label) => (
          <option key={label} value={label}>
            {labels.options[label]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn"
        onClick={apply}
        disabled={pending || !isCommentLabel(value) || value === current}
        aria-busy={pending}
      >
        {pending ? labels.working : labels.apply}
      </button>
      {failed ? (
        <p className="reply-error" role="alert">
          {labels.failed}
        </p>
      ) : null}
    </div>
  );
}

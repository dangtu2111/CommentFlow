'use client';

import { COMMENT_LABELS, type CommentLabel, isCommentLabel } from '@flow/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { relabelCommentsAction } from '../../app/app/(guarded)/comments/actions';
import { Icon } from '../ui/icon';
import { InlineError } from './state-note';

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
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor={`relabel-${commentId}`}
        className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant"
      >
        <Icon name="edit" size={14} />
        {labels.field}
      </label>
      <select
        id={`relabel-${commentId}`}
        className="h-8 rounded bg-surface-container-lowest px-2 font-label-sm text-label-sm text-on-surface shadow-sm"
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
        className="h-8 rounded bg-surface-container-lowest px-2.5 font-label-sm text-label-sm text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
        onClick={apply}
        disabled={pending || !isCommentLabel(value) || value === current}
        aria-busy={pending}
      >
        {pending ? labels.working : labels.apply}
      </button>
      {failed ? <InlineError>{labels.failed}</InlineError> : null}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { replyCommentAction } from '../../app/app/(guarded)/comments/actions';
import { MAX_REPLY_LENGTH } from '../../lib/reply-input';
import type { ReplyFailure } from '../../server/reply-action';

type Labels = {
  field: string;
  placeholder: string;
  send: string;
  retry: string;
  sending: string;
  hint: string;
  /** Có `{count}` và `{max}` (được thay ở client). */
  counter: string;
  failures: Record<ReplyFailure, string>;
};

/**
 * Hộp soạn trả lời (FR-042, US-011): Ctrl/⌘+Enter để gửi; khóa nút khi đang gửi (chống bấm đúp). Gửi xong làm tươi
 * trang để hiện "Đang gửi…"/kết quả (server render từ `comment_replies`). Lỗi hiện thông báo đã dịch, không mã thô.
 */
export function ReplyComposer({
  commentId,
  prefill,
  labels,
  isRetry,
}: {
  commentId: string;
  prefill: string;
  labels: Labels;
  isRetry: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(prefill);
  const [error, setError] = useState<ReplyFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const length = [...text].length;
  const counterText = labels.counter
    .replace('{count}', String(length))
    .replace('{max}', String(MAX_REPLY_LENGTH));
  const buttonText = pending ? labels.sending : isRetry ? labels.retry : labels.send;

  // Đổi bình luận (hoặc câu cũ để Thử lại) → đặt lại nội dung.
  useEffect(() => {
    setText(prefill);
    setError(null);
  }, [prefill]);

  function submit() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await replyCommentAction(commentId, text);
      if (result.ok) router.refresh();
      else setError(result.reason);
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className="reply-composer" onSubmit={onSubmit}>
      <label className="reply-label" htmlFor={`reply-${commentId}`}>
        {labels.field}
      </label>
      <textarea
        id={`reply-${commentId}`}
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={labels.placeholder}
        rows={4}
        disabled={pending}
        aria-invalid={error !== null}
        aria-describedby={error ? `reply-error-${commentId}` : undefined}
      />
      <div className="reply-meta">
        <span className="reply-counter" aria-live="polite">
          {counterText}
        </span>
        <span className="reply-hint">{labels.hint}</span>
      </div>
      {error ? (
        <p className="reply-error" role="alert" id={`reply-error-${commentId}`}>
          {labels.failures[error]}
        </p>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={pending || length === 0 || length > MAX_REPLY_LENGTH}
        aria-busy={pending}
      >
        {buttonText}
      </button>
    </form>
  );
}

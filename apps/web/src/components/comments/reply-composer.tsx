'use client';

import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { replyCommentAction } from '../../app/app/(guarded)/comments/actions';
import { MAX_REPLY_LENGTH, REPLY_SEND_KEYS } from '../../lib/reply-input';
import { deriveSuggestionUi, type SuggestionView } from '../../lib/suggestion';
import type { ReplyFailure } from '../../server/reply-action';
import { Icon } from '../ui/icon';
import { InlineError } from './state-note';
import { type SuggestionLabels, SuggestionPanel, SuggestionSources } from './suggestion-panel';

type Labels = {
  field: string;
  placeholder: string;
  send: string;
  retry: string;
  sending: string;
  hint: string;
  /** Có `{count}` và `{max}` (được thay ở client). */
  counter: string;
  /** Tiêu đề khi có gợi ý AI + nút công cụ (chưa có chức năng) + nhãn chip nguồn + chú thích "Sắp có". */
  suggestedTitle: string;
  rewrite: string;
  emoji: string;
  sourcesLabel: string;
  soon: string;
  failures: Record<ReplyFailure, string>;
};

/**
 * Hộp soạn trả lời (FR-042, US-011): Ctrl/⌘+Enter để gửi; khóa nút khi đang gửi (chống bấm đúp). Gửi xong làm tươi
 * trang để hiện "Đang gửi…"/kết quả (server render từ `comment_replies`). Lỗi hiện thông báo đã dịch, không mã thô.
 * Giao diện: class Tailwind chép từ `design/stitch/comments.html` (thẻ soạn + thanh hành động dính đáy).
 */
export function ReplyComposer({
  commentId,
  prefill,
  labels,
  isRetry,
  suggestion = null,
  suggestionLabels,
  dockStart = null,
}: {
  commentId: string;
  prefill: string;
  labels: Labels;
  isRetry: boolean;
  /** Gợi ý AI (FR-043); không có → không hiện ô gợi ý. */
  suggestion?: SuggestionView | null;
  suggestionLabels?: SuggestionLabels;
  /** Hành động phụ đặt bên trái nút gửi trong thanh dính đáy (nút Ẩn). */
  dockStart?: ReactNode;
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
  const suggestionUi = deriveSuggestionUi(suggestionLabels ? suggestion : null, text);
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
    <form className="flex flex-1 flex-col" onSubmit={onSubmit}>
      <div className="mb-4 space-y-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className="flex items-center gap-2 font-title-sm text-title-sm font-bold text-on-surface"
            htmlFor={`reply-${commentId}`}
          >
            <span className="text-secondary">
              <Icon name="smart_toy" size={16} />
            </span>
            {suggestionUi.show ? labels.suggestedTitle : labels.field}
          </label>
          {suggestionUi.show ? (
            <div className="flex items-center gap-1.5">
              {/* Viết lại / thêm emoji chưa có chức năng → hiện đúng thiết kế nhưng vô hiệu (UI-first). */}
              <button
                type="button"
                className="flex items-center gap-1 rounded bg-secondary-fixed px-2 py-1 font-label-sm text-label-sm text-on-secondary-fixed aria-[disabled=true]:opacity-60"
                aria-disabled="true"
                title={labels.soon}
              >
                <Icon name="cached" size={12} />
                {labels.rewrite}
              </button>
              <button
                type="button"
                className="rounded bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface aria-[disabled=true]:opacity-60"
                aria-disabled="true"
                title={labels.soon}
              >
                {labels.emoji}
              </button>
            </div>
          ) : null}
        </div>
        <div>
          <textarea
            id={`reply-${commentId}`}
            ref={textareaRef}
            className="min-h-24 w-full resize-none rounded-lg bg-surface-container-low p-3.5 font-body-lg text-body-lg text-on-surface shadow-inner transition-colors focus:bg-surface-container-lowest focus:outline focus:outline-2 focus:outline-primary-container"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={labels.placeholder}
            rows={4}
            disabled={pending}
            aria-invalid={error !== null}
            aria-describedby={error ? `reply-error-${commentId}` : undefined}
          />
          <div className="mt-2 flex items-center justify-between gap-3 px-1">
            {suggestion && suggestionLabels && suggestionUi.show ? (
              <SuggestionSources
                ui={suggestionUi}
                labels={suggestionLabels}
                caption={labels.sourcesLabel}
              />
            ) : (
              <span />
            )}
            <span
              className="ml-auto shrink-0 font-code-sm text-code-sm text-on-surface-variant"
              aria-live="polite"
            >
              {counterText}
            </span>
          </div>
        </div>
        {suggestion && suggestionLabels && suggestionUi.show ? (
          <SuggestionPanel
            ui={suggestionUi}
            labels={suggestionLabels}
            onUse={() => {
              setText(suggestion.text);
              textareaRef.current?.focus();
            }}
          />
        ) : null}
        {error ? (
          <InlineError id={`reply-error-${commentId}`}>{labels.failures[error]}</InlineError>
        ) : null}
      </div>
      <div className="sticky bottom-0 z-30 -mx-5 mt-auto flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest px-5 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center gap-2">{dockStart}</div>
        <button
          type="submit"
          className="flex h-10 items-center gap-2 rounded bg-primary px-5 font-title-md text-title-md font-bold text-on-primary shadow-md transition-all hover:bg-primary-container active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          title={labels.hint}
          disabled={pending || length === 0 || length > MAX_REPLY_LENGTH}
          aria-busy={pending}
        >
          <Icon name="send" size={18} />
          <span>{buttonText}</span>
          <span className="rounded bg-on-primary/20 px-1.5 py-0.5 font-code-sm text-code-sm text-on-primary">
            {REPLY_SEND_KEYS}
          </span>
        </button>
      </div>
    </form>
  );
}

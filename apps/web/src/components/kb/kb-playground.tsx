'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { runTryAiAction, type TryAiState } from '../../app/app/(guarded)/try-ai/actions';
import { TRY_AI_MAX_CHARS } from '../../lib/try-ai-limits';
import { llmStatusText } from '../try-ai/llm-status';
import { Icon } from '../ui/icon';

const IDLE: TryAiState = { status: 'idle' };

type Props = {
  /** Chữ của thẻ (từ `kb.hub.playground`), truyền từ trang để không phụ thuộc tên nhóm chuỗi. */
  label: string;
  placeholder: string;
  submit: string;
  fullPageLabel: string;
};

/**
 * Chạy thử AI ngay trong trang Nguồn dữ liệu (FR-059, theo thiết kế Stitch): gõ câu khách hỏi → gọi cùng Server Action
 * của trang Thử AI (`runTryAiAction`, chỉ Owner, không trừ lượt gói) → hiện câu trả lời + nguồn tại chỗ, không chuyển trang.
 */
export function KbPlayground({ label, placeholder, submit, fullPageLabel }: Props) {
  const t = useTranslations('tryAi');
  const [state, action, pending] = useActionState(runTryAiAction, IDLE);
  const done = state.status === 'done' ? state : null;

  return (
    <div className="mt-space-md space-y-space-md">
      <form
        action={action}
        className="flex flex-col gap-space-sm sm:flex-row sm:items-center"
        aria-busy={pending}
      >
        <label htmlFor="hub-try-question" className="sr-only">
          {label}
        </label>
        <input
          id="hub-try-question"
          name="text"
          required
          maxLength={TRY_AI_MAX_CHARS}
          autoComplete="off"
          placeholder={placeholder}
          className="flex-1 rounded-lg bg-surface-container-low px-3 py-2.5 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary px-4 py-2.5 font-title-sm text-title-sm text-on-secondary shadow-sm disabled:opacity-60"
        >
          <Icon name="play_arrow" size={16} />
          {submit}
        </button>
      </form>

      <div aria-live="polite" className="space-y-space-sm">
        {done && !done.ok ? (
          <p role="alert" className="font-body-md text-body-md text-error">
            {t(`errors.${done.reason}`, { max: TRY_AI_MAX_CHARS })}
          </p>
        ) : null}

        {done?.ok && done.result.status === 'skipped' ? (
          <p className="font-body-md text-body-md text-on-surface-variant">{t('skipped')}</p>
        ) : null}

        {done?.ok && done.result.status === 'done' ? (
          <div className="space-y-space-sm rounded-xl bg-surface-container-low p-space-md">
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {t(`knowledge.${done.knowledge}`)}
            </p>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {llmStatusText(t, done.llm)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-container px-2.5 py-0.5 font-label-sm text-label-sm text-on-primary">
                {t(`labels.${done.result.label}`)}
              </span>
              <span className="rounded-full bg-secondary-fixed px-2.5 py-0.5 font-label-sm text-label-sm text-on-secondary-fixed">
                {t('result.confidence')}: {done.result.confidence.confidence.toFixed(2)}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {t('quota', { used: done.quota.used, limit: done.quota.limit })}
              </span>
            </div>
            <div className="rounded-lg bg-surface-container-lowest p-space-md">
              <div className="mb-1 flex items-center gap-1.5 font-title-sm text-title-sm text-secondary">
                <Icon name="smart_toy" size={16} />
                {t('result.reply')}
              </div>
              <p className="font-body-md text-body-md text-on-surface">
                {done.result.reply === '' ? t('result.noReply') : done.result.reply}
              </p>
            </div>
            {done.result.candidates.length > 0 ? (
              <ul className="space-y-1 font-body-sm text-body-sm text-on-surface-variant">
                {done.result.candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <strong className="text-on-surface">{candidate.title}</strong> ·{' '}
                    {t('result.score', { score: candidate.score.toFixed(2) })}
                    {candidate.used ? ` · ${t('result.used')}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            <a href="/app/try-ai" className="font-title-sm text-title-sm text-primary">
              {fullPageLabel}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

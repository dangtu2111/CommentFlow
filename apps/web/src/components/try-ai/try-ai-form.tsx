'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { runTryAiAction, type TryAiState } from '../../app/app/(guarded)/try-ai/actions';
import { TRY_AI_MAX_CHARS } from '../../lib/try-ai-limits';
import { TryAiResultView } from './try-ai-result';

const IDLE: TryAiState = { status: 'idle' };

/** Form "Thử AI" (FR-059): gõ bình luận mẫu → kết quả cả pipeline (mock), không trừ lượt gói. */
export function TryAiForm({ initialText = '' }: { initialText?: string }) {
  const t = useTranslations('tryAi');
  const [state, action, pending] = useActionState(runTryAiAction, IDLE);

  return (
    <div className="stack">
      <form action={action} className="card stack">
        <label htmlFor="try-ai-text" className="section-title">
          {t('label')}
        </label>
        <textarea
          id="try-ai-text"
          name="text"
          className="input"
          rows={3}
          maxLength={TRY_AI_MAX_CHARS}
          placeholder={t('placeholder')}
          defaultValue={initialText}
          required
        />
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {t('submit')}
          </button>
          {state.status === 'done' && state.ok ? (
            <span className="muted">
              {t('quota', { used: state.quota.used, limit: state.quota.limit })}
            </span>
          ) : null}
        </div>
      </form>
      {state.status === 'done' && !state.ok ? (
        <p role="alert">{t(`errors.${state.reason}`, { max: TRY_AI_MAX_CHARS })}</p>
      ) : null}
      {state.status === 'done' && state.ok ? (
        <>
          <p className="muted">{t(`knowledge.${state.knowledge}`)}</p>
          <TryAiResultView result={state.result} />
        </>
      ) : null}
    </div>
  );
}

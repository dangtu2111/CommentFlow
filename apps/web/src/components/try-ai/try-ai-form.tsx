'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { runTryAiAction, type TryAiState } from '../../app/app/(guarded)/try-ai/actions';
import { MAX_PREVIOUS_RAW_CHARS, TRY_AI_MAX_CHARS } from '../../lib/try-ai-limits';
import { Icon } from '../ui/icon';
import { llmStatusText } from './llm-status';
import { TryAiResultView } from './try-ai-result';

const IDLE: TryAiState = { status: 'idle' };

const CARD = 'bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md';
const LABEL = 'block font-title-sm text-title-sm text-on-surface mb-1';
const AREA =
  'w-full p-space-md rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:shadow-md transition-all resize-y';
const MUTED = 'font-body-sm text-body-sm text-on-surface-variant';
const OFF_SELECT =
  'w-full h-10 px-3 rounded-lg bg-surface-container-low text-on-surface-variant font-body-md text-body-md cursor-not-allowed opacity-60';
const NOTE = 'px-3 py-2 rounded-lg bg-surface-container-low font-body-sm text-body-sm';
const ALERT =
  'px-3 py-2 rounded-lg bg-error-container text-on-error-container font-body-md text-body-md';

/** Form "Thử AI" (FR-059): dựng theo `design/stitch/kb-sandbox.html` — cột trái nhập liệu, cột phải kết quả; ô thiết kế chưa có nền tảng là ô tắt kèm chú thích. */
export function TryAiForm({ initialText = '' }: { initialText?: string }) {
  const t = useTranslations('tryAi');
  const [state, action, pending] = useActionState(runTryAiAction, IDLE);

  return (
    <div className="tw grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
      <div className="lg:col-span-7 space-y-space-md">
        <form action={action} className={CARD}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary-container" aria-hidden="true" />
            <h2 className="font-title-md text-title-md text-on-surface">{t('ui.setup')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <div>
              <span className={LABEL}>{t('ui.platform')}</span>
              <select disabled aria-disabled="true" title={t('ui.soon')} className={OFF_SELECT}>
                <option>{t('ui.platformValue')}</option>
              </select>
            </div>
            <div>
              <span className={LABEL}>{t('ui.post')}</span>
              <select disabled aria-disabled="true" title={t('ui.soon')} className={OFF_SELECT}>
                <option>{t('ui.postValue')}</option>
              </select>
            </div>
          </div>
          <p className={`${NOTE} text-on-surface-variant`}>{t('ui.soon')}</p>
          <div>
            <label htmlFor="try-ai-text" className={LABEL}>
              {t('label')}
            </label>
            <textarea
              id="try-ai-text"
              name="text"
              className={AREA}
              rows={4}
              maxLength={TRY_AI_MAX_CHARS}
              placeholder={t('placeholder')}
              defaultValue={initialText}
              required
            />
          </div>
          <div>
            <label htmlFor="try-ai-previous" className={LABEL}>
              {t('previousLabel')}
            </label>
            <textarea
              id="try-ai-previous"
              name="previous"
              className={AREA}
              rows={3}
              maxLength={MAX_PREVIOUS_RAW_CHARS}
              placeholder={t('previousPlaceholder')}
            />
            <p className={`mt-1 ${MUTED}`}>{t('previousHelp')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-space-md">
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-title-sm text-title-sm shadow-md transition-all disabled:opacity-60"
            >
              <Icon name="bolt" size={16} />
              {t('submit')}
            </button>
            {state.status === 'done' && state.ok ? (
              <span className={MUTED}>
                {t('quota', { used: state.quota.used, limit: state.quota.limit })}
              </span>
            ) : null}
          </div>
        </form>
      </div>
      <div className="lg:col-span-5 space-y-space-md">
        {state.status === 'done' && !state.ok ? (
          <p role="alert" className={ALERT}>
            {t(`errors.${state.reason}`, { max: TRY_AI_MAX_CHARS })}
          </p>
        ) : null}
        {state.status === 'done' && state.ok ? (
          <>
            <div className={`${NOTE} space-y-1 text-on-surface-variant`}>
              <p>{t(`knowledge.${state.knowledge}`)}</p>
              <p>{t(`voice.${state.voice}`)}</p>
              <p>{llmStatusText(t, state.llm)}</p>
            </div>
            {state.embedding.state === 'mismatch' ? (
              <p role="alert" className={ALERT}>
                {t('embedding.mismatch')}
              </p>
            ) : null}
            {state.vector.failed ? (
              <p role="alert" className={ALERT}>
                {t('embedding.failed')}
              </p>
            ) : null}
            {state.vector.off ? (
              <p className={MUTED}>{t(`embedding.off.${state.vector.off}`)}</p>
            ) : null}
            <TryAiResultView result={state.result} />
          </>
        ) : (
          <div className={`${CARD} text-center`}>
            <p className={MUTED}>{t('ui.idle')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  type KbTestSetState,
  runKbTestSetAction,
} from '../../app/app/(guarded)/kb-testset/actions';
import { KB_TESTSET_MAX_LINES } from '../../lib/kb-testset-limits';
import { KbTestSetResultView } from './kb-testset-result';

const IDLE: KbTestSetState = { status: 'idle' };

/** Form "Câu kiểm thử" (FR-054): mỗi dòng một ca → chạy cả bộ bằng mock, không trừ lượt gói. */
export function KbTestSetForm() {
  const t = useTranslations('kbTestset');
  const [state, action, pending] = useActionState(runKbTestSetAction, IDLE);

  return (
    <div className="stack">
      <form action={action} className="card stack">
        <label htmlFor="kb-testset-cases" className="section-title">
          {t('label')}
        </label>
        <textarea
          id="kb-testset-cases"
          name="cases"
          className="input"
          rows={8}
          defaultValue={t('sample')}
          aria-describedby="kb-testset-hint"
          required
        />
        <p id="kb-testset-hint" className="muted">
          {t('hint', { max: KB_TESTSET_MAX_LINES })}
        </p>
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
        <p role="alert">
          {t(`errors.${state.reason}`, {
            max: KB_TESTSET_MAX_LINES,
            line: state.reason === 'invalid_line' ? state.line : 0,
          })}
        </p>
      ) : null}
      {state.status === 'done' && state.ok ? (
        <>
          <p className="muted">{t(`knowledge.${state.knowledge}`)}</p>
          <KbTestSetResultView results={state.results} summary={state.summary} />
        </>
      ) : null}
    </div>
  );
}

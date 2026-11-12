'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  type KbTestSetState,
  runKbTestSetAction,
} from '../../app/app/(guarded)/kb-testset/actions';
import { KB_TESTSET_MAX_LINES } from '../../lib/kb-testset-limits';
import { Icon } from '../ui/icon';
import { KbTestSetResultView } from './kb-testset-result';

const IDLE: KbTestSetState = { status: 'idle' };

const CARD = 'bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md';
const AREA =
  'w-full p-space-md rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:shadow-md transition-all resize-y';
const MUTED = 'font-body-sm text-body-sm text-on-surface-variant';

/** Form "Câu kiểm thử" (FR-054): dựng theo `design/stitch/kb-testlab.html` — mỗi dòng một ca → chạy cả bộ, không trừ lượt gói. Lọc/tìm/thêm ca lẻ và lưu bộ chuẩn chưa có nền tảng nên không dựng. */
export function KbTestSetForm() {
  const t = useTranslations('kbTestset');
  const [state, action, pending] = useActionState(runKbTestSetAction, IDLE);

  return (
    <div className="tw space-y-space-lg">
      <form action={action} className={CARD}>
        <div className="flex items-center gap-2">
          <span className="text-secondary">
            <Icon name="science" size={18} />
          </span>
          <label htmlFor="kb-testset-cases" className="font-title-md text-title-md text-on-surface">
            {t('label')}
          </label>
        </div>
        <textarea
          id="kb-testset-cases"
          name="cases"
          className={AREA}
          rows={8}
          defaultValue={t('sample')}
          aria-describedby="kb-testset-hint"
          required
        />
        <p id="kb-testset-hint" className={MUTED}>
          {t('hint', { max: KB_TESTSET_MAX_LINES })}
        </p>
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
      {state.status === 'done' && !state.ok ? (
        <p
          role="alert"
          className="px-3 py-2 rounded-lg bg-error-container text-on-error-container font-body-md text-body-md"
        >
          {t(`errors.${state.reason}`, {
            max: KB_TESTSET_MAX_LINES,
            line: state.reason === 'invalid_line' ? state.line : 0,
          })}
        </p>
      ) : null}
      {state.status === 'done' && state.ok ? (
        <>
          <p className={MUTED}>{t(`knowledge.${state.knowledge}`)}</p>
          <KbTestSetResultView results={state.results} summary={state.summary} />
        </>
      ) : null}
    </div>
  );
}

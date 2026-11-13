'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  addTestCasesAction,
  deleteTestCaseAction,
  type LabActionState,
  runSavedTestsAction,
} from '../../app/app/(guarded)/readiness/test-lab-actions';
import { cx } from '../../lib/cx';
import { KB_TESTSET_MAX_LINES } from '../../lib/kb-testset-limits';
import {
  filterLabResults,
  LAB_FILTERS,
  type LabFilter,
  type LabStatus,
  labAccuracy,
  labCounts,
} from '../../lib/readiness-lab';
import { Icon } from '../ui/icon';

const IDLE: LabActionState = { status: 'idle' };
const UNTESTED = 'untested' as const;

/** Một câu đã lưu (đã chuyển sang kiểu thuần để qua ranh giới server → client). */
export type LabCase = {
  id: string;
  question: string;
  expectAction: 'answer' | 'clarify' | 'redirect' | 'handoff' | 'skip';
  replyIncludes: string[];
  lastStatus: LabStatus;
  lastActual: 'answer' | 'clarify' | 'redirect' | 'handoff' | 'skip' | null;
  lastReply: string | null;
  lastFailures: string[];
};

const CARD =
  'rounded-xl border border-outline-variant bg-surface-container-lowest p-space-lg shadow-sm';
const MUTED = 'font-body-sm text-body-sm text-on-surface-variant';
const AREA =
  'w-full resize-y rounded-xl bg-surface-container-low p-space-md font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:shadow-md';
const BTN =
  'flex items-center gap-1.5 rounded-lg px-4 py-2 font-title-sm text-title-sm shadow-md transition-all disabled:cursor-wait disabled:opacity-60';

const STATUS_STYLE = {
  pass: 'bg-primary-fixed text-on-primary-fixed-variant',
  fail: 'bg-error-container text-on-error-container',
  error: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  untested: 'bg-surface-container-high text-on-surface-variant',
} as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low px-space-md py-space-sm">
      <div className="font-label-sm text-label-sm uppercase text-on-surface-variant">{label}</div>
      <div className="font-title-md text-title-md font-bold text-on-surface">{value}</div>
    </div>
  );
}

function Failure({ state }: { state: LabActionState }) {
  const t = useTranslations();
  if (state.status !== 'done' || state.ok) return null;
  const message =
    state.reason === 'rate_limited'
      ? t('readiness.lab.test.rateLimited')
      : state.reason === 'too_many_saved'
        ? t('readiness.lab.test.tooManySaved')
        : t(`kbTestset.errors.${state.reason}`, {
            max: KB_TESTSET_MAX_LINES,
            line: state.line ?? 0,
          });
  return (
    <p
      role="alert"
      className="rounded-lg bg-error-container px-3 py-2 font-body-md text-body-md text-on-error-container"
    >
      {message}
    </p>
  );
}

function CaseTable({ cases }: { cases: readonly LabCase[] }) {
  const t = useTranslations();
  const [filter, setFilter] = useState<LabFilter>('all');
  const [query, setQuery] = useState('');
  const counts = labCounts(cases);
  const rows = filterLabResults(cases, filter, query);
  return (
    <div className="space-y-space-md">
      <div className="flex flex-col gap-space-sm md:flex-row md:items-center md:justify-between">
        <div role="tablist" className="flex flex-wrap gap-space-xs">
          {LAB_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cx(
                'rounded-lg border px-space-md py-space-xs font-label-md text-label-md transition-colors',
                filter === key
                  ? 'border-primary bg-primary-fixed/40 font-semibold text-primary'
                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low',
              )}
            >
              {t(`readiness.lab.test.tabs.${key}`, { count: counts[key] })}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('readiness.lab.test.search')}
          aria-label={t('readiness.lab.test.search')}
          className="w-full rounded-lg bg-surface-container-low px-space-md py-space-xs font-body-md text-body-md text-on-surface outline-none md:w-72"
        />
      </div>
      {rows.length === 0 ? (
        <p className={MUTED}>{t('readiness.lab.test.noMatch')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase text-on-surface-variant">
              <tr>
                <th className="px-space-md py-space-sm">
                  {t('readiness.lab.test.columns.scenario')}
                </th>
                <th className="px-space-md py-space-sm">
                  {t('readiness.lab.test.columns.expected')}
                </th>
                <th className="px-space-md py-space-sm">{t('readiness.lab.test.columns.reply')}</th>
                <th className="px-space-md py-space-sm">
                  {t('readiness.lab.test.columns.verdict')}
                </th>
                <th className="px-space-md py-space-sm">
                  <span className="sr-only">{t('readiness.lab.test.columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {rows.map((r) => {
                const verdict = r.lastStatus ?? UNTESTED;
                return (
                  <tr key={r.id} className="align-top font-body-md text-body-md text-on-surface">
                    <td className="px-space-md py-space-sm">
                      <p>{r.question}</p>
                      {r.replyIncludes.length > 0 ? (
                        <p className={MUTED}>
                          {t('readiness.lab.test.keywords', { words: r.replyIncludes.join(', ') })}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-space-md py-space-sm">
                      <span className="font-label-md text-label-md">
                        {t(`kbTestset.actions.${r.expectAction}`)}
                      </span>
                      {r.lastActual ? (
                        <div className={MUTED}>
                          {t('kbTestset.result.actual')}: {t(`kbTestset.actions.${r.lastActual}`)}
                        </div>
                      ) : null}
                    </td>
                    <td className="space-y-1 px-space-md py-space-sm">
                      {r.lastReply ? <p className="whitespace-pre-wrap">{r.lastReply}</p> : null}
                      {r.lastFailures.map((f) => (
                        <p
                          key={f}
                          role="alert"
                          className="rounded bg-error-container px-2 py-1 font-body-sm text-body-sm text-on-error-container"
                        >
                          {t(`kbTestset.failures.${f}`)}
                        </p>
                      ))}
                    </td>
                    <td className="px-space-md py-space-sm">
                      <span
                        className={cx(
                          'inline-block rounded-full px-space-sm py-0.5 font-label-sm text-label-sm font-semibold',
                          STATUS_STYLE[verdict],
                        )}
                      >
                        {verdict === UNTESTED
                          ? t('readiness.lab.test.untested')
                          : t(`kbTestset.result.${verdict}`)}
                      </span>
                    </td>
                    <td className="px-space-md py-space-sm text-right">
                      <form action={deleteTestCaseAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          aria-label={t('readiness.lab.test.delete')}
                          className="rounded p-1 text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                        >
                          <Icon name="delete" size={18} />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Bộ câu kiểm thử hồi quy (FR-054; migration 0096 lưu bộ câu): Owner thêm câu (mỗi dòng "câu hỏi | hành động | từ khóa"), chạy lại cả bộ bằng AI thật
 * (không trừ lượt gói), kết quả LẦN CHẠY CUỐI của từng câu được lưu và lọc/tìm tại chỗ. Số liệu chỉ từ các câu đã chạy; chưa chạy → không hiện số.
 */
export function ReadinessTestLab({ cases }: { cases: readonly LabCase[] }) {
  const t = useTranslations();
  const [addState, addAction, adding] = useActionState(addTestCasesAction, IDLE);
  const [runState, runAction, running] = useActionState(runSavedTestsAction, IDLE);
  const accuracy = labAccuracy(cases);
  const counts = labCounts(cases);
  return (
    <section
      id="test-lab"
      aria-labelledby="test-lab-title"
      className={cx(CARD, 'space-y-space-md')}
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-space-sm">
          <h2
            id="test-lab-title"
            className="font-title-md text-title-md font-semibold text-on-surface"
          >
            {t('readiness.lab.test.title')}
          </h2>
          <span className="rounded bg-secondary-fixed px-space-sm py-0.5 font-label-sm text-label-sm font-semibold text-on-secondary-fixed-variant">
            {t('readiness.lab.test.badge')}
          </span>
        </div>
        <p className={MUTED}>{t('readiness.lab.test.subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-3">
        <Stat
          label={t('readiness.lab.test.stats.accuracy')}
          value={accuracy === null ? '—' : `${accuracy}%`}
        />
        <Stat label={t('readiness.lab.test.stats.total')} value={String(counts.all)} />
        <Stat
          label={t('readiness.lab.test.stats.failed')}
          value={String(counts.fail + counts.error)}
        />
      </div>

      <form
        action={runAction}
        className="flex flex-wrap items-center gap-space-md"
        aria-busy={running}
      >
        <button
          type="submit"
          disabled={running || cases.length === 0}
          className={cx(BTN, 'bg-primary-container text-on-primary hover:bg-primary')}
        >
          <Icon name="play_circle" size={18} />
          {running
            ? t('readiness.lab.test.running')
            : t('readiness.lab.test.run', { count: cases.length })}
        </button>
        {runState.status === 'done' && runState.ok && runState.quota ? (
          <span className={MUTED}>
            {t('kbTestset.quota', { used: runState.quota.used, limit: runState.quota.limit })}
          </span>
        ) : null}
      </form>
      <Failure state={runState} />

      {cases.length === 0 ? (
        <p className={MUTED}>{t('readiness.lab.test.empty')}</p>
      ) : (
        <CaseTable cases={cases} />
      )}

      <form
        action={addAction}
        className="space-y-space-sm border-t border-outline-variant pt-space-md"
      >
        <label htmlFor="lab-cases" className="font-label-md text-label-md text-on-surface">
          {t('readiness.lab.test.addTitle')}
        </label>
        <textarea
          id="lab-cases"
          name="cases"
          rows={5}
          required
          defaultValue={cases.length === 0 ? t('kbTestset.sample') : ''}
          aria-describedby="lab-hint"
          className={AREA}
        />
        <p id="lab-hint" className={MUTED}>
          {t('kbTestset.hint', { max: KB_TESTSET_MAX_LINES })}
        </p>
        <div className="flex flex-wrap items-center gap-space-md">
          <button
            type="submit"
            disabled={adding}
            className={cx(BTN, 'bg-secondary-container text-on-secondary-container')}
          >
            <Icon name="add" size={18} />
            {t('readiness.lab.test.add')}
          </button>
          {addState.status === 'done' && addState.ok ? (
            <span role="status" className={MUTED}>
              {t('readiness.lab.test.added', { count: addState.added ?? 0 })}
            </span>
          ) : null}
        </div>
        <Failure state={addState} />
      </form>
    </section>
  );
}

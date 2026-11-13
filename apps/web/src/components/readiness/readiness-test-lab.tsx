'use client';

import type { TestCaseResult, TestSetSummary } from '@flow/ai';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  type KbTestSetState,
  runKbTestSetAction,
} from '../../app/app/(guarded)/readiness/test-lab-actions';
import { cx } from '../../lib/cx';
import { KB_TESTSET_MAX_LINES } from '../../lib/kb-testset-limits';
import { filterLabResults, LAB_FILTERS, type LabFilter, labCounts } from '../../lib/readiness-lab';
import { Icon } from '../ui/icon';

const IDLE: KbTestSetState = { status: 'idle' };

const CARD =
  'rounded-xl border border-outline-variant bg-surface-container-lowest p-space-lg shadow-sm';
const MUTED = 'font-body-sm text-body-sm text-on-surface-variant';
const AREA =
  'w-full resize-y rounded-xl bg-surface-container-low p-space-md font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:shadow-md';

const STATUS_STYLE = {
  pass: 'bg-primary-fixed text-on-primary-fixed-variant',
  fail: 'bg-error-container text-on-error-container',
  error: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
} as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low px-space-md py-space-sm">
      <div className="font-label-sm text-label-sm uppercase text-on-surface-variant">{label}</div>
      <div className="font-title-md text-title-md font-bold text-on-surface">{value}</div>
    </div>
  );
}

function ResultTable({ results }: { results: readonly TestCaseResult[] }) {
  const t = useTranslations();
  const [filter, setFilter] = useState<LabFilter>('all');
  const [query, setQuery] = useState('');
  const counts = labCounts(results);
  const rows = filterLabResults(results, filter, query);
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
          <table className="w-full min-w-[40rem] text-left">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {rows.map((r) => (
                <tr key={r.index} className="align-top font-body-md text-body-md text-on-surface">
                  <td className="px-space-md py-space-sm">
                    <div className="font-label-sm text-label-sm text-on-surface-variant">
                      {t('kbTestset.result.line', { n: r.index + 1 })}
                    </div>
                    <p>{r.question}</p>
                  </td>
                  <td className="px-space-md py-space-sm">
                    <span className="font-label-md text-label-md">
                      {t(`kbTestset.actions.${r.expected}`)}
                    </span>
                    {r.actual ? (
                      <div className={MUTED}>
                        {t('kbTestset.result.actual')}: {t(`kbTestset.actions.${r.actual}`)}
                      </div>
                    ) : null}
                  </td>
                  <td className="space-y-1 px-space-md py-space-sm">
                    {r.reply ? <p className="whitespace-pre-wrap">{r.reply}</p> : null}
                    {r.failures.map((f) => (
                      <p
                        key={f}
                        role="alert"
                        className="rounded bg-error-container px-2 py-1 font-body-sm text-body-sm text-on-error-container"
                      >
                        {t(`kbTestset.failures.${f}`)}
                      </p>
                    ))}
                    {r.missing.length > 0 ? (
                      <p className={MUTED}>
                        {t('kbTestset.result.missing', { words: r.missing.join(', ') })}
                      </p>
                    ) : null}
                    {r.error ? (
                      <p className={MUTED}>{t('kbTestset.result.errorName', { name: r.error })}</p>
                    ) : null}
                  </td>
                  <td className="px-space-md py-space-sm">
                    <span
                      className={cx(
                        'inline-block rounded-full px-space-sm py-0.5 font-label-sm text-label-sm font-semibold',
                        STATUS_STYLE[r.status],
                      )}
                    >
                      {t(`kbTestset.result.${r.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stats({ summary }: { summary: TestSetSummary }) {
  const t = useTranslations();
  const accuracy = summary.total === 0 ? 0 : Math.round((100 * summary.passed) / summary.total);
  return (
    <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-3">
      <Stat
        label={t('readiness.lab.test.stats.accuracy')}
        value={`${accuracy}% (${summary.passed}/${summary.total})`}
      />
      <Stat
        label={t('readiness.lab.test.stats.failed')}
        value={String(summary.failed + summary.errored)}
      />
      <Stat
        label={t('readiness.lab.test.stats.gate')}
        value={t(`readiness.lab.test.gate.${summary.gate}`)}
      />
    </div>
  );
}

/**
 * Bộ câu kiểm thử hồi quy (FR-054) trong trang Độ sẵn sàng & Kiểm thử: mỗi dòng một ca → chạy cả bộ bằng AI thật (không trừ lượt gói),
 * kết quả lọc/tìm tại chỗ. Bộ câu CHƯA được lưu (cần bảng riêng): chỉ hiện kết quả của lần chạy vừa rồi, số liệu đều thật của lần chạy.
 */
export function ReadinessTestLab() {
  const t = useTranslations();
  const [state, action, pending] = useActionState(runKbTestSetAction, IDLE);
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
        <p className={MUTED}>{t('kbTestset.mockNote')}</p>
      </header>

      <form action={action} className="space-y-space-sm" aria-busy={pending}>
        <label htmlFor="lab-cases" className="font-label-md text-label-md text-on-surface">
          {t('readiness.lab.test.addTitle')}
        </label>
        <textarea
          id="lab-cases"
          name="cases"
          rows={6}
          required
          defaultValue={t('kbTestset.sample')}
          aria-describedby="lab-hint"
          className={AREA}
        />
        <p id="lab-hint" className={MUTED}>
          {t('kbTestset.hint', { max: KB_TESTSET_MAX_LINES })}
        </p>
        <div className="flex flex-wrap items-center gap-space-md">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-lg bg-primary-container px-4 py-2 font-title-sm text-title-sm text-on-primary shadow-md transition-all hover:bg-primary disabled:cursor-wait disabled:opacity-60"
          >
            <Icon name="play_circle" size={18} />
            {pending ? t('readiness.lab.test.running') : t('readiness.lab.test.run')}
          </button>
          {state.status === 'done' && state.ok ? (
            <span className={MUTED}>
              {t('kbTestset.quota', { used: state.quota.used, limit: state.quota.limit })}
            </span>
          ) : null}
        </div>
      </form>

      {state.status === 'done' && !state.ok ? (
        <p
          role="alert"
          className="rounded-lg bg-error-container px-3 py-2 font-body-md text-body-md text-on-error-container"
        >
          {t(`kbTestset.errors.${state.reason}`, {
            max: KB_TESTSET_MAX_LINES,
            line: state.reason === 'invalid_line' ? state.line : 0,
          })}
        </p>
      ) : null}

      {state.status === 'done' && state.ok ? (
        <div className="space-y-space-md">
          <p className={MUTED}>{t(`kbTestset.knowledge.${state.knowledge}`)}</p>
          <Stats summary={state.summary} />
          <p
            role="status"
            className="rounded-lg bg-secondary-fixed px-3 py-2 font-title-sm text-title-sm text-on-secondary-fixed"
          >
            {t(`kbTestset.gate.${state.summary.gate}`)}
          </p>
          <ResultTable results={state.results} />
        </div>
      ) : (
        <p className={MUTED}>{t('readiness.lab.test.empty')}</p>
      )}
    </section>
  );
}

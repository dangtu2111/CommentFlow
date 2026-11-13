import { READINESS_REQUIRED_ITEMS, type ReadinessResult } from '@flow/ai';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cx } from '../../lib/cx';
import {
  bandOf,
  coachSteps,
  PILLAR_HREF,
  type PillarView,
  pillarsOf,
  pointsToReady,
} from '../../lib/readiness-lab';
import { Icon, type IconName } from '../ui/icon';

const CARD =
  'rounded-xl border border-outline-variant bg-surface-container-lowest p-space-lg shadow-sm';
const MUTED = 'font-body-sm text-body-sm text-on-surface-variant';

const PILLAR_ICON: Record<PillarView['pillar'], IconName> = {
  policies: 'gavel',
  products: 'inventory_2',
  shop: 'storefront',
  faq: 'quiz',
};

const BAND_STYLE = {
  unsafe: 'bg-error-container text-on-error-container',
  basic: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  ready: 'bg-primary-fixed text-on-primary-fixed-variant',
} as const;

/** Thanh 3 dải (chưa an toàn / cơ bản / tự động) với điểm hiện tại đánh dấu. */
function BandBar({ score, minPercent }: { score: number; minPercent: number }) {
  const segments = [
    { key: 'unsafe', from: 0, to: 50, color: 'bg-error' },
    { key: 'basic', from: 50, to: minPercent, color: 'bg-tertiary' },
    { key: 'ready', from: minPercent, to: 100, color: 'bg-primary' },
  ] as const;
  return (
    <div className="relative">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-container-high">
        {segments.map((s) => (
          <div
            key={s.key}
            className={cx('h-full opacity-30', s.color)}
            style={{ width: `${s.to - s.from}%` }}
          />
        ))}
      </div>
      <div
        className="absolute -top-1 h-4 w-1 rounded bg-on-surface"
        style={{ left: `calc(${Math.min(100, Math.max(0, score))}% - 2px)` }}
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Khối trên của trang "Độ sẵn sàng AI & Kiểm thử" (theo design/stitch/kb-readiness-lab.html): thẻ điểm + 4 trụ cột + AI Coach.
 * Server Component thuần hiển thị số liệu đã tính bởi `computeReadiness` (không tính lại, không số bịa).
 */
export async function ReadinessOverview({ result }: { result: ReadinessResult }) {
  const t = await getTranslations();
  const band = bandOf(result);
  const needed = pointsToReady(result);
  const pillars = pillarsOf(result);
  const steps = coachSteps(result);
  return (
    <div className="space-y-space-lg">
      <div className="grid grid-cols-1 gap-space-md lg:grid-cols-12">
        <section
          className={cx(CARD, 'space-y-space-md lg:col-span-5')}
          aria-labelledby="ready-hero"
        >
          <div className="flex items-center justify-between gap-space-sm border-b border-outline-variant pb-space-sm">
            <h2
              id="ready-hero"
              className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface"
            >
              <span className="text-primary">
                <Icon name="verified_user" size={20} />
              </span>
              {t('readiness.lab.hero.title')}
            </h2>
            <span className="rounded bg-secondary-fixed px-space-sm py-0.5 font-label-sm text-label-sm font-semibold text-on-secondary-fixed-variant">
              {t('readiness.lab.hero.engine')}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-space-sm">
            <span className="font-headline-lg text-headline-lg font-extrabold text-primary">
              {result.score}
            </span>
            <span className="font-body-md text-body-md text-on-surface-variant">
              {t('readiness.lab.hero.outOf')}
            </span>
            <span
              className={cx(
                'ml-auto rounded-full px-space-sm py-0.5 font-label-sm text-label-sm font-semibold',
                BAND_STYLE[band],
              )}
            >
              {t(`readiness.lab.hero.bands.${band}`)}
            </span>
          </div>
          <progress
            className="sr-only"
            value={result.score}
            max={100}
            aria-label={t('readiness.meterLabel', { score: result.score })}
          >
            {result.score}%
          </progress>
          <BandBar score={result.score} minPercent={result.minPercent} />
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
            <span>{t('readiness.lab.hero.range.unsafe')}</span>
            <span>{t('readiness.lab.hero.range.basic', { max: result.minPercent - 1 })}</span>
            <span>{t('readiness.lab.hero.range.ready', { min: result.minPercent })}</span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {result.ready
              ? t('readiness.lab.hero.readyNote', { min: result.minPercent })
              : result.missingRequired.length > 0
                ? t('readiness.lab.hero.needRequired', { total: result.requiredTotal })
                : t('readiness.lab.hero.needMore', { points: needed })}
          </p>
          <div className="rounded-lg bg-surface-container-low p-space-md">
            <p className="font-title-sm text-title-sm text-on-surface">
              {t('readiness.requiredTitle', {
                done: result.requiredDone,
                total: result.requiredTotal,
              })}
            </p>
            <ul className="mt-space-xs space-y-1">
              {READINESS_REQUIRED_ITEMS.map((item) => {
                const missing = result.missingRequired.includes(item);
                return (
                  <li
                    key={item}
                    className="flex items-start gap-space-xs font-body-sm text-body-sm text-on-surface"
                  >
                    <span className={missing ? 'text-error' : 'text-primary'}>
                      <Icon name={missing ? 'cancel' : 'check_circle'} size={16} />
                    </span>
                    <span>{t(`readiness.required.${item}.label`)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className={MUTED}>{t('readiness.basisNote')}</p>
        </section>

        <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:col-span-7">
          {pillars.map((p) => {
            const done = p.percent === 100;
            return (
              <section
                key={p.pillar}
                className={cx(CARD, 'flex flex-col justify-between gap-space-sm')}
                aria-label={t(`readiness.lab.pillars.${p.pillar}.title`)}
              >
                <div className="space-y-space-xs">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="grid size-8 place-items-center rounded-lg bg-primary-fixed/50 text-primary">
                        <Icon name={PILLAR_ICON[p.pillar]} size={18} />
                      </span>
                      <div>
                        <h3 className="font-title-sm text-title-sm font-bold text-on-surface">
                          {t(`readiness.lab.pillars.${p.pillar}.title`)}
                        </h3>
                        <p className={MUTED}>{t(`readiness.lab.pillars.${p.pillar}.sub`)}</p>
                      </div>
                    </div>
                    <span
                      className={cx(
                        'rounded px-space-sm py-0.5 font-label-sm text-label-sm font-bold',
                        done
                          ? 'bg-primary-fixed text-on-primary-fixed-variant'
                          : 'bg-surface-container-high text-on-surface',
                      )}
                    >
                      {t('readiness.lab.pillars.answerable', {
                        done: p.answerable,
                        total: p.total,
                      })}
                    </span>
                  </div>
                  {p.missingTopics.length > 0 ? (
                    <ul className="list-disc space-y-0.5 pl-space-lg font-body-sm text-body-sm text-on-surface-variant">
                      {p.missingTopics.map((topic) => (
                        <li key={topic}>{t(`readiness.missing.${topic}`)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className={MUTED}>{t('readiness.lab.pillars.allGood')}</p>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-outline-variant pt-space-sm">
                  <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant">
                    {t('readiness.lab.pillars.complete', { percent: p.percent })}
                  </span>
                  {done ? null : (
                    <Link
                      href={PILLAR_HREF[p.pillar]}
                      className="font-label-md text-label-md font-semibold text-primary hover:underline"
                    >
                      {t('readiness.lab.pillars.fix')}
                    </Link>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <section
        className="rounded-xl border border-secondary-fixed-dim bg-secondary-fixed/40 p-space-lg"
        aria-labelledby="ready-coach"
      >
        <div className="flex items-start gap-space-sm">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-on-secondary">
            <Icon name="auto_awesome" size={20} />
          </span>
          <div className="min-w-0 flex-1 space-y-space-sm">
            <div>
              <h2
                id="ready-coach"
                className="font-title-md text-title-md font-semibold text-on-surface"
              >
                {t('readiness.lab.coach.title')}
              </h2>
              <p className={MUTED}>
                {steps.length === 0
                  ? t('readiness.lab.coach.none')
                  : t('readiness.lab.coach.subtitle')}
              </p>
            </div>
            {steps.length > 0 ? (
              <ul className="grid grid-cols-1 gap-space-sm md:grid-cols-2">
                {steps.map((step) => (
                  <li key={step.kind === 'required' ? `r-${step.item}` : `t-${step.topic}`}>
                    <Link
                      href={step.href}
                      className="flex h-full items-start gap-space-xs rounded-lg bg-surface-container-lowest px-space-md py-space-sm font-body-md text-body-md text-on-surface hover:bg-surface-container-low"
                    >
                      <span className={step.kind === 'required' ? 'text-error' : 'text-secondary'}>
                        <Icon
                          name={step.kind === 'required' ? 'priority_high' : 'add_circle'}
                          size={18}
                        />
                      </span>
                      <span>
                        {step.kind === 'required' ? (
                          <>
                            <strong>{t('readiness.lab.coach.required')}</strong>{' '}
                            {t(`readiness.required.${step.item}.hint`)}
                          </>
                        ) : (
                          t(`readiness.missing.${step.topic}`)
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

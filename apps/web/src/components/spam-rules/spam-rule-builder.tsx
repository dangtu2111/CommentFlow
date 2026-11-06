'use client';

import { SPAM_RULE_ACTIONS, SPAM_RULE_TYPES } from '@flow/shared';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { type SpamRuleState, spamRuleAction } from '../../app/app/(guarded)/spam-rules/actions';
import { SPAM_SAMPLE_DRY_RUN, SPAM_SAMPLE_SCOPE_CHANNELS } from '../../lib/spam-rules-sample';
import { Icon } from '../ui/icon';
import { RICH_BOLD } from '../ui/rich';
import { FIELD_CLASS, Notice } from '../ui/tw-form';

const TITLE_ID = 'spam-builder-title';
const IDLE: SpamRuleState = { status: 'idle' };
const STANDARDS = ['standard1', 'standard2', 'standard3'] as const;
const NOT_OPTIONS = ['whitelist', 'admin', 'vip'] as const;

const LABEL = 'mb-1.5 block font-label-md text-label-md font-semibold text-on-surface';
const INPUT = `${FIELD_CLASS} bg-surface-container-low shadow-inner`;
const OP =
  'shrink-0 rounded px-2.5 py-1 text-center font-label-sm text-label-sm font-bold uppercase';
const TRASH =
  'flex cursor-not-allowed items-center justify-center self-end rounded p-1.5 text-on-surface-variant opacity-70 md:self-center';
const SCOPE_CARD = 'flex items-center gap-2.5 rounded-lg bg-surface-container-low p-space-sm';
const SECONDARY_BTN =
  'flex items-center justify-center gap-1.5 rounded-lg bg-surface-container-low py-2 font-title-sm text-title-sm text-primary transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-70';

/**
 * Trình thiết lập quy tắc spam (FR-080) theo design/stitch/spam-rules.html: cột trái = tên, bộ điều kiện, phạm vi, hành
 * động; cột phải = hộp xem trước (Dry-run) + tiêu chuẩn an toàn + nút lưu. Chức năng có thật: tên, loại + mẫu, hành
 * động đánh dấu/bỏ qua, Xem trước 7 ngày, Lưu. Phần chưa có (mô tả, nhánh NOT, phạm vi theo kênh, Tự ẩn, trích SĐT,
 * lưu thử nghiệm) hiện đúng thiết kế, vô hiệu + "Sắp có". `sample` = hiện số liệu/kênh mẫu `[MẪU]` (chỉ bản dev).
 */
export function SpamRuleBuilder({ sample = false }: { sample?: boolean }) {
  const t = useTranslations('spamRules');
  const [state, action, pending] = useActionState(spamRuleAction, IDLE);
  const soon = { disabled: true, 'aria-disabled': true, title: t('soonTitle') } as const;
  const preview = state.status === 'preview' ? state.preview : null;
  const demo = SPAM_SAMPLE_DRY_RUN;
  const leadCapture = t.rich('leadCapture', RICH_BOLD);
  const dryRunSummary = t.rich('dryRun.summary', { ...RICH_BOLD, count: demo.matched });
  const matched = preview?.matched ?? (sample ? demo.matched : null);

  return (
    <form action={action} id="spam-builder">
      <section
        aria-labelledby={TITLE_ID}
        className="space-y-space-lg rounded-xl bg-surface-container-lowest p-space-lg shadow-md"
      >
        <div className="flex items-center gap-space-sm border-b border-surface-container pb-space-md">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary shadow-sm">
            <Icon name="build_circle" size={18} />
          </div>
          <div>
            <h2 id={TITLE_ID} className="font-headline-sm text-headline-sm text-on-surface">
              {t('builderTitle')}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{t('builderBody')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-12">
          <div className="space-y-space-md lg:col-span-8">
            <div className="grid grid-cols-1 gap-space-md md:grid-cols-2">
              <div>
                <label htmlFor="sr-name" className={LABEL}>
                  {t('nameLabel')}
                </label>
                <input
                  id="sr-name"
                  name="name"
                  className={INPUT}
                  maxLength={80}
                  required
                  placeholder={t('namePlaceholder')}
                />
              </div>
              <div>
                <label htmlFor="sr-desc" className={LABEL}>
                  {t('descLabel')}
                </label>
                <input
                  id="sr-desc"
                  className={INPUT}
                  placeholder={t('descPlaceholder')}
                  {...soon}
                />
              </div>
            </div>

            <div className="space-y-space-md rounded-xl bg-surface-container-low p-space-md">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-title-sm text-title-sm font-bold text-on-surface">
                  <span className="text-primary-container">
                    <Icon name="account_tree" size={14} />
                  </span>
                  {t('conditionTitle')}
                </span>
                <button
                  type="button"
                  className="flex cursor-not-allowed items-center gap-1 font-label-sm text-label-sm font-semibold text-primary opacity-70"
                  {...soon}
                >
                  <Icon name="add" size={14} />
                  {t('addBranch')}
                </button>
              </div>
              <div className="flex flex-col items-stretch gap-2 rounded-lg bg-surface-container-lowest p-space-sm shadow-sm md:flex-row md:items-center">
                <span className={`${OP} bg-surface-container-high text-on-surface`}>
                  {t('ifLabel')}
                </span>
                <select
                  id="sr-type"
                  name="type"
                  className={`${INPUT} md:w-auto`}
                  defaultValue="keyword"
                  aria-label={t('typeLabel')}
                >
                  {SPAM_RULE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`type.${type}`)}
                    </option>
                  ))}
                  <option disabled>{t('aiOption')}</option>
                </select>
                <label
                  htmlFor="sr-pattern"
                  className="hidden px-1 font-body-sm text-body-sm text-on-surface-variant md:inline"
                >
                  {t('matchPattern')}
                </label>
                <input
                  id="sr-pattern"
                  name="pattern"
                  className={`${INPUT} flex-1`}
                  maxLength={200}
                  aria-describedby="sr-pattern-hint"
                />
                <button
                  type="button"
                  aria-disabled="true"
                  tabIndex={-1}
                  title={t('removeCondition')}
                  aria-label={t('removeCondition')}
                  className={TRASH}
                >
                  <Icon name="delete" size={18} />
                </button>
              </div>
              <p id="sr-pattern-hint" className="font-body-sm text-body-sm text-on-surface-variant">
                {t('patternHint')}
              </p>
              <div className="flex flex-col items-stretch gap-2 rounded-lg bg-surface-container-lowest p-space-sm shadow-sm md:flex-row md:items-center">
                <span className={`${OP} bg-secondary-fixed text-on-secondary-fixed`}>
                  {t('notLabel')}
                </span>
                <select className={`${INPUT} md:w-auto`} aria-label={t('notLabel')} {...soon}>
                  {NOT_OPTIONS.map((option) => (
                    <option key={option}>{t(`notOption.${option}`)}</option>
                  ))}
                </select>
                <input
                  className={`${INPUT} flex-1`}
                  placeholder={t('notPlaceholder')}
                  aria-label={t('notPlaceholder')}
                  {...soon}
                />
                <button
                  type="button"
                  aria-disabled="true"
                  tabIndex={-1}
                  title={t('removeCondition')}
                  aria-label={t('removeCondition')}
                  className={TRASH}
                >
                  <Icon name="delete" size={18} />
                </button>
              </div>
            </div>

            <fieldset>
              <legend className={LABEL}>{t('scopeLabel')}</legend>
              <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-3">
                {sample ? (
                  SPAM_SAMPLE_SCOPE_CHANNELS.map((channel) => (
                    <label key={channel.id} className={SCOPE_CARD}>
                      <input
                        type="checkbox"
                        defaultChecked={channel.checked}
                        className="h-4 w-4 rounded accent-primary-container"
                        {...soon}
                      />
                      <span className="min-w-0">
                        <strong className="block truncate font-title-sm text-title-sm text-on-surface">
                          {channel.name}
                        </strong>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          {channel.note}
                        </span>
                      </span>
                    </label>
                  ))
                ) : (
                  <label className={SCOPE_CARD}>
                    <input
                      type="checkbox"
                      defaultChecked
                      className="h-4 w-4 rounded accent-primary-container"
                      {...soon}
                    />
                    <span className="min-w-0">
                      <strong className="block truncate font-title-sm text-title-sm text-on-surface">
                        {t('scopeAll')}
                      </strong>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {t('scopeAllNote')}
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </fieldset>

            <fieldset className="space-y-space-sm">
              <legend className={LABEL}>{t('actionLabel')}</legend>
              <div className="grid grid-cols-1 gap-space-md md:grid-cols-2">
                {SPAM_RULE_ACTIONS.map((a) => (
                  <label
                    key={a}
                    className="flex cursor-pointer flex-col justify-between space-y-2 rounded-xl bg-surface-container-low p-space-md transition-all hover:bg-surface-container"
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="action"
                        value={a}
                        defaultChecked={a === 'mark'}
                        className="mt-1 accent-primary-container"
                      />
                      <span>
                        <strong className="block font-title-sm text-title-sm font-bold text-on-surface">
                          {t(`action.${a}`)}
                        </strong>
                        <span className="mt-0.5 block font-body-sm text-body-sm text-on-surface-variant">
                          {t(`actionBody.${a}`)}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-1 font-label-sm text-label-sm font-semibold text-tertiary">
                      <Icon name="verified" size={12} />
                      {t(`actionNote.${a}`)}
                    </span>
                  </label>
                ))}
                <label
                  title={t('soonTitle')}
                  className="flex cursor-not-allowed flex-col justify-between space-y-2 rounded-xl bg-surface-container-high p-space-md opacity-80 shadow-sm"
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="action-soon"
                      className="mt-1 accent-primary-container"
                      {...soon}
                    />
                    <span>
                      <strong className="flex items-center gap-1.5 font-title-sm text-title-sm font-bold text-on-surface">
                        {t('action.autoHide')}
                        <span className="rounded bg-primary-container px-1.5 py-0.5 font-label-sm text-label-sm text-on-primary">
                          {t('recommended')}
                        </span>
                      </strong>
                      <span className="mt-0.5 block font-body-sm text-body-sm text-on-surface-variant">
                        {t('actionBody.autoHide')}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1 font-label-sm text-label-sm font-semibold text-primary">
                    <Icon name="lock" size={12} />
                    {t('actionNote.autoHide')} · {t('soon')}
                  </span>
                </label>
              </div>
              <div className="mt-space-xs flex items-center justify-between gap-space-sm rounded-lg bg-secondary-fixed/50 p-space-sm">
                <label className="flex items-center gap-2.5">
                  <input type="checkbox" className="h-4 w-4 rounded accent-secondary" {...soon} />
                  <span className="font-title-sm text-title-sm text-on-surface">{leadCapture}</span>
                </label>
                <span className="shrink-0 rounded-full bg-surface-container-lowest px-2 py-0.5 font-label-sm text-label-sm text-on-secondary-fixed shadow-sm">
                  {t('leadCaptureBadge')}
                </span>
              </div>
            </fieldset>
          </div>

          <aside
            aria-label={t('dryRun.title')}
            className="flex flex-col justify-between space-y-space-md rounded-xl bg-surface-container-low p-space-md lg:col-span-4"
          >
            <div className="space-y-space-md">
              <div className="flex items-center justify-between border-b border-surface-container-high pb-space-sm">
                <span className="flex items-center gap-1.5 font-title-sm text-title-sm font-bold text-on-surface">
                  <span className="text-secondary">
                    <Icon name="science" size={18} />
                  </span>
                  {t('dryRun.title')}
                </span>
                <span className="rounded bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-on-surface">
                  {t('dryRun.badge')}
                </span>
              </div>
              <div
                aria-live="polite"
                className="space-y-space-sm rounded-xl bg-surface-container-lowest p-space-md shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {t('dryRun.estimated')}
                  </span>
                  <strong className="font-headline-sm text-headline-sm font-bold text-primary">
                    {matched === null ? '—' : t('dryRun.estimatedValue', { count: matched })}
                  </strong>
                </div>
                {preview ? (
                  <>
                    <p className="font-body-sm text-body-sm text-on-surface">
                      {t('previewResult', { matched: preview.matched, total: preview.total })}
                    </p>
                    {preview.samples.length === 0 ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {t('previewEmpty')}
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {preview.samples.map((s) => (
                          <li
                            key={s.id}
                            className="font-body-sm text-body-sm text-on-surface-variant"
                          >
                            {s.textMasked}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : sample ? (
                  <>
                    <div className="space-y-1">
                      <div className="flex justify-between font-label-sm text-label-sm">
                        <span className="font-medium text-primary">
                          {t('dryRun.real', { count: demo.real, percent: demo.realPercent })}
                        </span>
                        <span className="font-medium text-tertiary">
                          {t('dryRun.check', { count: demo.check })}
                        </span>
                      </div>
                      <div
                        role="img"
                        aria-label={t('dryRun.breakdownLabel')}
                        className="flex h-2 w-full overflow-hidden rounded-full bg-surface-container-highest"
                      >
                        <div
                          className="h-full bg-primary-container"
                          style={{ width: `${demo.realPercent}%` }}
                        />
                        <div
                          className="h-full bg-tertiary-container"
                          style={{ width: `${100 - demo.realPercent}%` }}
                        />
                      </div>
                    </div>
                    <p className="pt-1 font-body-sm text-body-sm text-on-surface-variant">
                      {dryRunSummary}
                    </p>
                  </>
                ) : (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {t('dryRun.idle')}
                  </p>
                )}
                <button
                  type="submit"
                  name="intent"
                  value="preview"
                  className={`${SECONDARY_BTN} w-full`}
                  disabled={pending}
                >
                  {t('preview')}
                </button>
                <button type="button" className={`${SECONDARY_BTN} w-full`} {...soon}>
                  <Icon name="format_list_bulleted" size={16} />
                  {t('dryRun.list', { count: matched ?? '—' })}
                </button>
              </div>
              <div className="space-y-2 rounded-lg bg-surface-container-lowest p-space-sm">
                <p className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface">
                  {t('dryRun.standards')}
                </p>
                {STANDARDS.map((key) => (
                  <p
                    key={key}
                    className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface"
                  >
                    <span className="text-primary">
                      <Icon name={sample ? 'check_circle' : 'radio_button_unchecked'} size={14} />
                    </span>
                    {t(`dryRun.${key}`)}
                  </p>
                ))}
              </div>
            </div>
            {state.status === 'error' ? (
              <Notice tone="danger">{t(`error.${state.code}`)}</Notice>
            ) : null}
            {state.status === 'saved' ? <Notice tone="success">{t('saved')}</Notice> : null}
            <div className="flex items-center gap-2 pt-space-md">
              <button
                type="button"
                className="flex-1 cursor-not-allowed rounded-lg bg-surface-container-highest py-2 text-center font-title-sm text-title-sm text-on-surface opacity-70"
                {...soon}
              >
                {t('dryRun.saveDry')}
              </button>
              {/* Nút Xem trước đứng đầu trong DOM: Enter trong ô nhập chỉ xem trước, không lưu nhầm. */}
              <button
                type="submit"
                name="intent"
                value="save"
                className="flex-1 rounded-lg bg-primary-container py-2 text-center font-title-sm text-title-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-70"
                disabled={pending}
              >
                {t('save')}
              </button>
            </div>
          </aside>
        </div>
      </section>
    </form>
  );
}

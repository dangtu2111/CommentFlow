'use client';

import { SPAM_RULE_ACTIONS, SPAM_RULE_TYPES } from '@flow/shared';
import {
  BadgeCheck,
  CircleDashed,
  FlaskConical,
  GitBranch,
  ListChecks,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { type SpamRuleState, spamRuleAction } from '../../app/app/(guarded)/spam-rules/actions';
import { SPAM_SAMPLE_DRY_RUN, SPAM_SAMPLE_SCOPE_CHANNELS } from '../../lib/spam-rules-sample';
import { Banner } from '../ui/banner';
import { Card } from '../ui/card';
import { Chip } from '../ui/chip';
import { Inset } from '../ui/inset';
import { Progress } from '../ui/progress';
import { RICH_BOLD, TONE } from '../ui/rich';
import { SectionHead } from '../ui/section-head';
import { Switch } from '../ui/switch';

const TITLE_ID = 'spam-builder-title';
const IDLE: SpamRuleState = { status: 'idle' };
const STANDARDS = ['standard1', 'standard2', 'standard3'] as const;
const NOT_OPTIONS = ['whitelist', 'admin', 'vip'] as const;

/**
 * Trình thiết lập quy tắc spam (FR-080) theo design/stitch/spam-rules.html: cột trái = tên, bộ điều kiện, phạm vi, hành
 * động; cột phải = hộp xem trước (Dry-run) + tiêu chuẩn an toàn + nút lưu. Chức năng có thật: tên, loại + mẫu, hành
 * động đánh dấu/bỏ qua, Xem trước 7 ngày, Lưu. Phần chưa có (mô tả, nhánh NOT, phạm vi theo kênh, Tự ẩn, trích SĐT,
 * lưu thử nghiệm) hiện đúng thiết kế, vô hiệu + "Sắp có". `sample` = hiện số liệu/kênh mẫu `[MẪU]` (chỉ bản dev).
 */
export function SpamRuleBuilder({ sample = false }: { sample?: boolean }) {
  const t = useTranslations('spamRules');
  const [state, action, pending] = useActionState(spamRuleAction, IDLE);
  const soon = { disabled: true, title: t('soonTitle') } as const;
  const preview = state.status === 'preview' ? state.preview : null;
  const demo = SPAM_SAMPLE_DRY_RUN;
  const leadCapture = t.rich('leadCapture', RICH_BOLD);
  const dryRunSummary = t.rich('dryRun.summary', { ...RICH_BOLD, count: demo.matched });
  const matched = preview?.matched ?? (sample ? demo.matched : null);

  return (
    <form action={action} id="spam-builder">
      <Card stack className="spam-builder" aria-labelledby={TITLE_ID}>
        <SectionHead
          id={TITLE_ID}
          icon={<Wrench size={22} aria-hidden="true" />}
          title={t('builderTitle')}
          description={t('builderBody')}
        />
        <div className="spam-builder-grid">
          <div className="stack spam-builder-main">
            <div className="spam-name-grid">
              <div className="field">
                <label htmlFor="sr-name" className="field-label">
                  {t('nameLabel')}
                </label>
                <input
                  id="sr-name"
                  name="name"
                  className="input"
                  maxLength={80}
                  required
                  placeholder={t('namePlaceholder')}
                />
              </div>
              <div className="field">
                <label htmlFor="sr-desc" className="field-label">
                  {t('descLabel')}
                </label>
                <input
                  id="sr-desc"
                  className="input"
                  placeholder={t('descPlaceholder')}
                  {...soon}
                />
              </div>
            </div>

            <Inset className="spam-condition">
              <div className="spam-condition-head">
                <span className="spam-inline-title">
                  <GitBranch size={14} aria-hidden="true" />
                  {t('conditionTitle')}
                </span>
                <button type="button" className="link-button" {...soon}>
                  <Plus size={14} aria-hidden="true" />
                  {t('addBranch')}
                </button>
              </div>
              <div className="spam-condition-row">
                <span className="spam-op">{t('ifLabel')}</span>
                <select
                  id="sr-type"
                  name="type"
                  className="input"
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
                <label htmlFor="sr-pattern" className="spam-match-label">
                  {t('matchPattern')}
                </label>
                <input
                  id="sr-pattern"
                  name="pattern"
                  className="input"
                  maxLength={200}
                  aria-describedby="sr-pattern-hint"
                />
                <button
                  type="button"
                  className="icon-button"
                  disabled
                  title={t('removeCondition')}
                  aria-label={t('removeCondition')}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
              <p id="sr-pattern-hint" className="muted">
                {t('patternHint')}
              </p>
              <div className="spam-condition-row is-not">
                <span className="spam-op is-not">{t('notLabel')}</span>
                <select className="input" aria-label={t('notLabel')} {...soon}>
                  {NOT_OPTIONS.map((option) => (
                    <option key={option}>{t(`notOption.${option}`)}</option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder={t('notPlaceholder')}
                  aria-label={t('notPlaceholder')}
                  {...soon}
                />
                <button
                  type="button"
                  className="icon-button"
                  disabled
                  title={t('removeCondition')}
                  aria-label={t('removeCondition')}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </Inset>

            <fieldset className="spam-fieldset">
              <legend className="field-label">{t('scopeLabel')}</legend>
              <div className="spam-scope-grid">
                {sample ? (
                  SPAM_SAMPLE_SCOPE_CHANNELS.map((channel) => (
                    <label key={channel.id} className="spam-scope-card">
                      <input type="checkbox" defaultChecked={channel.checked} {...soon} />
                      <span>
                        <strong>{channel.name}</strong>
                        <span className="muted">{channel.note}</span>
                      </span>
                    </label>
                  ))
                ) : (
                  <label className="spam-scope-card">
                    <input type="checkbox" defaultChecked {...soon} />
                    <span>
                      <strong>{t('scopeAll')}</strong>
                      <span className="muted">{t('scopeAllNote')}</span>
                    </span>
                  </label>
                )}
              </div>
            </fieldset>

            <fieldset className="spam-fieldset">
              <legend className="field-label">{t('actionLabel')}</legend>
              <div className="spam-action-grid">
                {SPAM_RULE_ACTIONS.map((a) => (
                  <label key={a} className="spam-option">
                    <span className="spam-option-main">
                      <input type="radio" name="action" value={a} defaultChecked={a === 'mark'} />
                      <span>
                        <strong>{t(`action.${a}`)}</strong>
                        <span className="muted">{t(`actionBody.${a}`)}</span>
                      </span>
                    </span>
                    <span className="spam-option-note">
                      <BadgeCheck size={12} aria-hidden="true" />
                      {t(`actionNote.${a}`)}
                    </span>
                  </label>
                ))}
                <label className="spam-option is-locked">
                  <span className="spam-option-main">
                    <input type="radio" {...soon} aria-disabled="true" />
                    <span>
                      <strong>
                        {t('action.autoHide')}
                        <Chip tone="solid" className="spam-option-chip">
                          {t('recommended')}
                        </Chip>
                      </strong>
                      <span className="muted">{t('actionBody.autoHide')}</span>
                    </span>
                  </span>
                  <span className="spam-option-note">
                    <CircleDashed size={12} aria-hidden="true" />
                    {t('actionNote.autoHide')} · {t('soon')}
                  </span>
                </label>
              </div>
              <div className="spam-lead">
                <label className="row">
                  <input type="checkbox" {...soon} />
                  <span>{leadCapture}</span>
                </label>
                <Chip tone="accent">{t('leadCaptureBadge')}</Chip>
              </div>
            </fieldset>
          </div>

          <aside className="spam-dry" aria-label={t('dryRun.title')}>
            <div className="spam-dry-head">
              <span className="spam-inline-title">
                <FlaskConical size={18} aria-hidden="true" />
                {t('dryRun.title')}
              </span>
              <Chip tone="muted">{t('dryRun.badge')}</Chip>
            </div>
            <div className="spam-dry-card" aria-live="polite">
              <div className="spam-dry-row">
                <span className="muted">{t('dryRun.estimated')}</span>
                <strong>
                  {matched === null ? '—' : t('dryRun.estimatedValue', { count: matched })}
                </strong>
              </div>
              {preview ? (
                <>
                  <p>{t('previewResult', { matched: preview.matched, total: preview.total })}</p>
                  {preview.samples.length === 0 ? (
                    <p className="muted">{t('previewEmpty')}</p>
                  ) : (
                    <ul className="stack spam-dry-samples">
                      {preview.samples.map((s) => (
                        <li key={s.id} className="muted">
                          {s.textMasked}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : sample ? (
                <>
                  <div>
                    <div className="spam-dry-row">
                      <span className="spam-dry-real">
                        {t('dryRun.real', { count: demo.real, percent: demo.realPercent })}
                      </span>
                      <span className="spam-dry-check">
                        {t('dryRun.check', { count: demo.check })}
                      </span>
                    </div>
                    <Progress
                      label={t('dryRun.breakdownLabel')}
                      segments={[
                        { percent: demo.realPercent },
                        { percent: 100 - demo.realPercent, tone: TONE.warm },
                      ]}
                    />
                  </div>
                  <p className="muted">{dryRunSummary}</p>
                </>
              ) : (
                <p className="muted">{t('dryRun.idle')}</p>
              )}
              <button
                type="submit"
                name="intent"
                value="preview"
                className="btn btn-secondary"
                disabled={pending}
              >
                {t('preview')}
              </button>
              <button type="button" className="btn btn-secondary" {...soon}>
                <ListChecks size={16} aria-hidden="true" />
                {t('dryRun.list', { count: matched ?? '—' })}
              </button>
            </div>
            <div className="spam-standards">
              <p className="spam-standards-title">{t('dryRun.standards')}</p>
              {STANDARDS.map((key) => (
                <p key={key} className="spam-standard">
                  {sample ? (
                    <BadgeCheck size={14} aria-hidden="true" />
                  ) : (
                    <CircleDashed size={14} aria-hidden="true" />
                  )}
                  {t(`dryRun.${key}`)}
                </p>
              ))}
            </div>
            {state.status === 'error' ? (
              <Banner variant="danger">{t(`error.${state.code}`)}</Banner>
            ) : null}
            {state.status === 'saved' ? <Banner variant="success">{t('saved')}</Banner> : null}
            <div className="spam-builder-actions">
              <button type="button" className="btn btn-secondary" {...soon}>
                {t('dryRun.saveDry')}
              </button>
              {/* Nút Xem trước đứng đầu trong DOM: Enter trong ô nhập chỉ xem trước, không lưu nhầm. */}
              <button
                type="submit"
                name="intent"
                value="save"
                className="btn btn-primary"
                disabled={pending}
              >
                {t('save')}
              </button>
            </div>
          </aside>
        </div>
      </Card>
    </form>
  );
}

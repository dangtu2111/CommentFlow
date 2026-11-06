'use client';

import { SPAM_RULE_ACTIONS, SPAM_RULE_TYPES } from '@flow/shared';
import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { type SpamRuleState, spamRuleAction } from '../../app/app/(guarded)/spam-rules/actions';
import { Banner } from '../ui/banner';
import { Card } from '../ui/card';
import { Inset } from '../ui/inset';
import { SectionHead } from '../ui/section-head';

const TITLE_ID = 'spam-builder-title';
const IDLE: SpamRuleState = { status: 'idle' };

/**
 * Trình tạo quy tắc spam (FR-080) theo design/stitch/spam-rules.html: điều kiện bên trái, hành động bên phải,
 * Xem trước (7 ngày) rồi Lưu. Không có lựa chọn Tự ẩn.
 */
export function SpamRuleBuilder() {
  const t = useTranslations('spamRules');
  const [state, action, pending] = useActionState(spamRuleAction, IDLE);

  return (
    <form action={action}>
      <Card stack className="spam-builder" aria-labelledby={TITLE_ID}>
        <SectionHead
          id={TITLE_ID}
          icon={<ShieldAlert size={22} aria-hidden="true" />}
          title={t('builderTitle')}
          description={t('builderBody')}
        />
        <div className="spam-builder-grid">
          <Inset title={t('conditionTitle')} className="spam-condition">
            <label htmlFor="sr-name" className="field-label">
              {t('nameLabel')}
            </label>
            <input id="sr-name" name="name" className="input" maxLength={80} required />
            <label htmlFor="sr-type" className="field-label">
              {t('typeLabel')}
            </label>
            <select id="sr-type" name="type" className="input" defaultValue="keyword">
              {SPAM_RULE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`type.${type}`)}
                </option>
              ))}
            </select>
            <label htmlFor="sr-pattern" className="field-label">
              {t('patternLabel')}
            </label>
            <input id="sr-pattern" name="pattern" className="input" maxLength={200} />
            <p className="muted">{t('patternHint')}</p>
          </Inset>
          <Inset title={t('actionLabel')} className="spam-action" role="group">
            {SPAM_RULE_ACTIONS.map((a) => (
              <label key={a} className="spam-option">
                <input type="radio" name="action" value={a} defaultChecked={a === 'mark'} />
                <span>{t(`action.${a}`)}</span>
              </label>
            ))}
            <p className="muted">{t('noAutoHide')}</p>
          </Inset>
        </div>
        {state.status === 'error' ? (
          <Banner variant="danger">{t(`error.${state.code}`)}</Banner>
        ) : null}
        {state.status === 'saved' ? <Banner variant="success">{t('saved')}</Banner> : null}
        {state.status === 'preview' ? (
          <Inset aria-live="polite" className="spam-preview">
            <p>
              <strong>
                {t('previewResult', { matched: state.preview.matched, total: state.preview.total })}
              </strong>
            </p>
            {state.preview.samples.length === 0 ? (
              <p className="muted">{t('previewEmpty')}</p>
            ) : (
              <ul className="stack">
                {state.preview.samples.map((s) => (
                  <li key={s.id} className="muted">
                    {s.textMasked}
                  </li>
                ))}
              </ul>
            )}
          </Inset>
        ) : null}
        <div className="spam-builder-actions">
          {/* Nút Xem trước đứng đầu: Enter trong ô nhập chỉ xem trước, không lưu nhầm. */}
          <button type="submit" name="intent" value="preview" className="btn" disabled={pending}>
            {t('preview')}
          </button>
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
      </Card>
    </form>
  );
}

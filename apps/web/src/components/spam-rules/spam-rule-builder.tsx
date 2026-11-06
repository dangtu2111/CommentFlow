'use client';

import { SPAM_RULE_ACTIONS, SPAM_RULE_TYPES } from '@flow/shared';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { type SpamRuleState, spamRuleAction } from '../../app/app/(guarded)/spam-rules/actions';

const IDLE: SpamRuleState = { status: 'idle' };

/** Trình tạo quy tắc spam (FR-080): chọn loại/mẫu/hành động, Xem trước (7 ngày) rồi Lưu. Không có lựa chọn Tự ẩn. */
export function SpamRuleBuilder() {
  const t = useTranslations('spamRules');
  const [state, action, pending] = useActionState(spamRuleAction, IDLE);

  return (
    <form action={action} className="card stack">
      <label htmlFor="sr-name">{t('nameLabel')}</label>
      <input id="sr-name" name="name" className="input" maxLength={80} required />
      <label htmlFor="sr-type">{t('typeLabel')}</label>
      <select id="sr-type" name="type" className="input" defaultValue="keyword">
        {SPAM_RULE_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`type.${type}`)}
          </option>
        ))}
      </select>
      <label htmlFor="sr-pattern">{t('patternLabel')}</label>
      <input id="sr-pattern" name="pattern" className="input" maxLength={200} />
      <p className="muted">{t('patternHint')}</p>
      <label htmlFor="sr-action">{t('actionLabel')}</label>
      <select id="sr-action" name="action" className="input" defaultValue="mark">
        {SPAM_RULE_ACTIONS.map((a) => (
          <option key={a} value={a}>
            {t(`action.${a}`)}
          </option>
        ))}
      </select>
      <p className="muted">{t('noAutoHide')}</p>
      {state.status === 'error' ? <p role="alert">{t(`error.${state.code}`)}</p> : null}
      {state.status === 'saved' ? <p role="status">{t('saved')}</p> : null}
      {state.status === 'preview' ? (
        <section aria-live="polite" className="stack">
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
        </section>
      ) : null}
      <div className="row">
        <button
          type="submit"
          name="intent"
          value="preview"
          className="btn btn-primary"
          disabled={pending}
        >
          {t('preview')}
        </button>
        <button type="submit" name="intent" value="save" className="btn" disabled={pending}>
          {t('save')}
        </button>
      </div>
    </form>
  );
}

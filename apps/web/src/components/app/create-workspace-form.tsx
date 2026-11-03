'use client';

import { LOCALES } from '@flow/shared';
import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { createWorkspaceAction } from '../../app/app/onboarding/workspace/actions';
import { WORKSPACE_IDLE } from '../../lib/workspace-form';
import { Banner } from '../ui/banner';
import { SubmitButton } from '../ui/submit-button';

/** Màn tạo workspace tối thiểu: tên, múi giờ, ngôn ngữ mặc định. */
export function CreateWorkspaceForm({
  timeZones,
  defaultTimeZone,
  defaultLang,
}: {
  timeZones: readonly string[];
  defaultTimeZone: string;
  defaultLang: 'vi' | 'en';
}) {
  const t = useTranslations('workspace.create');
  const te = useTranslations('workspace.errors');
  const tl = useTranslations('language');
  const [state, action] = useActionState(createWorkspaceAction, WORKSPACE_IDLE);
  const values = state.status === 'error' ? state.values : undefined;
  const nameInvalidMessage = te('nameInvalid');
  const nameError = state.status === 'error' && state.message === 'nameInvalid';
  const bannerError = state.status === 'error' && state.message !== 'nameInvalid';
  return (
    <form action={action} className="form" noValidate>
      {bannerError ? <Banner variant="danger">{te(state.message)}</Banner> : null}
      <div className="field">
        <label className="field-label" htmlFor="ws-name">
          {t('name')}
        </label>
        <div className="input-wrap">
          <Building2 className="input-icon" size={18} aria-hidden="true" />
          <input
            id="ws-name"
            className="input"
            name="name"
            type="text"
            required
            maxLength={80}
            defaultValue={values?.name}
            autoComplete="organization"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'ws-name-error' : 'ws-name-hint'}
          />
        </div>
        {nameError ? (
          <p className="field-error" id="ws-name-error">
            <span>{nameInvalidMessage}</span>
          </p>
        ) : (
          <p className="field-hint" id="ws-name-hint">
            {t('nameHint')}
          </p>
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ws-tz">
          {t('timezone')}
        </label>
        <select
          id="ws-tz"
          className="input"
          name="timezone"
          defaultValue={values?.timezone ?? defaultTimeZone}
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ws-lang">
          {t('language')}
        </label>
        <select
          id="ws-lang"
          className="input"
          name="defaultLang"
          defaultValue={values?.defaultLang ?? defaultLang}
        >
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {tl(locale)}
            </option>
          ))}
        </select>
        <p className="field-hint">{t('languageHint')}</p>
      </div>
      <p className="muted">{t('twoFactorNote')}</p>
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}

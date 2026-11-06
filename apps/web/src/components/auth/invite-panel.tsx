import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { InviteSample } from '../../lib/invite-sample';
import { Icon } from '../ui/icon';
import { SoonButton } from '../ui/tw-parts';
import { AuthChrome } from './auth-shell';

const TRUST_ICONS = ['bolt', 'smart_toy', 'security'] as const;
const TRUST_TONES = ['text-primary-container', 'text-secondary', 'text-primary-container'] as const;
const RULE_KEYS = ['length', 'common', 'pwned'] as const;
const PERMISSION_KEYS = ['inbox', 'killSwitch', 'crm'] as const;
const PERMISSION_ICONS = ['check_circle', 'smart_toy', 'check_circle'] as const;

/** Cột trái: danh tính workspace, (mẫu) người mời + kênh phụ trách + quyền + người nhận. */
async function InviteContext({
  workspace,
  role,
  sample,
}: {
  workspace: string;
  role: string;
  sample?: InviteSample;
}) {
  const t = await getTranslations('invite.ui');
  const title = (await getTranslations('invite.card'))('title', { workspace });
  return (
    <div className="flex flex-col justify-between bg-surface-container-low p-space-lg md:p-space-xl lg:col-span-5">
      <div className="flex flex-col gap-space-lg">
        <div className="flex flex-col gap-space-sm">
          <div className="flex flex-wrap items-center gap-space-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-fixed px-space-sm py-0.5 font-label-sm text-label-sm font-semibold tracking-wide text-on-primary-fixed">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {t('status')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary-fixed px-space-sm py-0.5 font-label-sm text-label-sm font-semibold text-on-secondary-fixed">
              <Icon name="support_agent" size={13} />
              {role}
            </span>
          </div>
          <div className="mt-space-xs">
            <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface">
              {title}
            </h1>
            {sample ? (
              <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                {t('industry', { industry: sample.workspaceIndustry })}
              </p>
            ) : null}
          </div>
        </div>
        {sample ? (
          <>
            <div className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm">
              <div className="mb-space-xs font-label-sm text-label-sm uppercase tracking-wider text-outline">
                {t('inviter')}
              </div>
              <div className="flex items-center gap-space-md">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-fixed font-title-sm text-title-sm text-on-primary-fixed shadow-sm">
                  {sample.inviterName.replace(/^\[MẪU\]\s*/u, '').charAt(0)}
                </span>
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-space-xs">
                    <span className="truncate font-title-sm text-title-sm text-on-surface">
                      {sample.inviterName}
                    </span>
                    <span className="rounded bg-primary-fixed px-1.5 font-label-sm text-label-sm font-semibold text-on-primary-fixed">
                      {sample.inviterRole}
                    </span>
                  </div>
                  <span className="truncate font-body-sm text-body-sm text-on-surface-variant">
                    {sample.inviterEmail}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-space-xs">
              <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                {t('channels', { n: sample.channels.length })}
              </span>
              <div className="grid grid-cols-1 gap-space-xs sm:grid-cols-3 lg:grid-cols-1">
                {sample.channels.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center gap-space-sm rounded-lg bg-surface-container-lowest p-space-sm shadow-sm"
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-md ${c.tint}`}
                    >
                      <Icon name={c.icon} size={18} />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-title-sm text-title-sm text-on-surface">
                        {c.name}
                      </span>
                      <span className="font-label-sm text-label-sm text-outline">{c.kind}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-sm">
              <span className="flex items-center gap-space-xs font-title-sm text-title-sm text-on-surface">
                <span className="text-primary-container">
                  <Icon name="fact_check" size={18} />
                </span>
                {t('scope.title')}
              </span>
              <ul className="flex flex-col gap-2 font-body-sm text-body-sm text-on-surface-variant">
                {PERMISSION_KEYS.map((key, i) => (
                  <li key={key} className="flex items-start gap-space-xs">
                    <span className="mt-0.5 shrink-0 text-primary">
                      <Icon name={PERMISSION_ICONS[i] ?? 'check_circle'} size={16} />
                    </span>
                    <span>
                      <strong>{t(`scope.${key}.title`)}:</strong> {t(`scope.${key}.body`)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-space-xs flex items-start gap-space-xs rounded bg-surface-container-low p-space-sm font-label-sm text-label-sm text-outline">
                <span className="mt-0.5 text-tertiary-container">
                  <Icon name="info" size={16} />
                </span>
                <span>
                  <strong>{t('scope.limitTitle')}:</strong> {t('scope.limitBody')}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface-container-high p-space-sm">
              <div className="flex min-w-0 items-center gap-space-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container font-title-sm text-title-sm text-on-primary-container">
                  {sample.recipientInitials}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-title-sm text-title-sm text-on-surface">
                    {sample.recipientName}
                  </span>
                  <span className="truncate font-label-sm text-label-sm text-on-surface-variant">
                    {sample.recipientEmail}
                  </span>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-label-sm text-on-primary-fixed">
                <Icon name="done_all" size={14} />
                {t('verified')}
              </span>
            </div>
          </>
        ) : null}
      </div>
      <div className="mt-space-lg flex items-center gap-space-xs pt-space-md font-label-sm text-label-sm text-outline">
        <Icon name="domain_verification" size={16} />
        <span>{t('private', { workspace })}</span>
      </div>
    </div>
  );
}

/** Biểu mẫu thiết lập tài khoản của thiết kế — CHƯA có backend (lời mời hiện đi qua đăng nhập/đăng ký) nên vô hiệu. */
async function InviteSetupForm({ sample }: { sample: InviteSample }) {
  const t = await getTranslations('invite.ui');
  const soon = t('soon');
  const ta = await getTranslations('auth');
  const newPasswordLabel = ta('fields.newPassword');
  const confirmLabel = ta('fields.passwordConfirm');
  const box =
    'w-full cursor-not-allowed rounded-lg bg-surface-container-lowest py-2.5 font-body-md text-body-md text-on-surface opacity-70 shadow-sm outline-none';
  return (
    <form className="flex flex-col gap-space-lg" aria-disabled="true">
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
          <span className="font-title-sm text-title-sm text-on-surface">{t('form.email')}</span>
          <span className="flex items-center gap-1 font-label-sm text-label-sm text-outline">
            <Icon name="lock" size={13} />
            {t('form.locked')}
          </span>
        </div>
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-outline">
            <Icon name="mail" size={18} />
          </span>
          <input
            readOnly
            disabled
            aria-label={t('form.email')}
            defaultValue={sample.recipientEmail}
            className="w-full cursor-not-allowed rounded-lg bg-surface-container-low py-2.5 pl-10 pr-10 font-body-md text-body-md text-on-surface shadow-inner outline-none"
          />
          <span className="absolute right-3 text-primary">
            <Icon name="verified" size={18} />
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
          <span className="font-title-sm text-title-sm text-on-surface">{t('form.name')}</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {t('form.nameHint')}
          </span>
        </div>
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-outline">
            <Icon name="badge" size={18} />
          </span>
          <input
            disabled
            aria-disabled="true"
            title={soon}
            aria-label={t('form.name')}
            placeholder={t('form.namePlaceholder')}
            className={`${box} pl-10 pr-4`}
          />
        </div>
      </div>
      <div className="flex flex-col gap-space-xs">
        <span className="font-title-sm text-title-sm text-on-surface">{newPasswordLabel}</span>
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-outline">
            <Icon name="key" size={18} />
          </span>
          <input
            disabled
            aria-disabled="true"
            title={soon}
            type="password"
            aria-label={newPasswordLabel}
            placeholder={t('form.passwordPlaceholder')}
            className={`${box} pl-10 pr-12`}
          />
          <span className="absolute right-3 p-1 text-outline">
            <Icon name="visibility" size={18} />
          </span>
        </div>
        <div className="mt-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline">{t('form.strength')}</span>
            <span className="font-label-sm text-label-sm font-semibold text-outline">
              {t('form.strengthNone')}
            </span>
          </div>
          <div className="grid h-1.5 grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="rounded-full bg-surface-container-highest" />
            ))}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-x-space-md gap-y-1.5 rounded-lg bg-surface-container-low p-space-sm sm:grid-cols-2">
          {RULE_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center gap-1.5 font-label-sm text-label-sm text-outline"
            >
              <Icon name="radio_button_unchecked" size={15} />
              <span>{t(`form.rules.${key}`)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-space-xs">
        <span className="font-title-sm text-title-sm text-on-surface">{confirmLabel}</span>
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-outline">
            <Icon name="lock_reset" size={18} />
          </span>
          <input
            disabled
            aria-disabled="true"
            title={soon}
            type="password"
            aria-label={confirmLabel}
            placeholder={t('form.confirmPlaceholder')}
            className={`${box} pl-10 pr-4`}
          />
        </div>
      </div>
      <div className="flex flex-col gap-space-sm pt-space-xs">
        <label className="flex cursor-not-allowed items-start gap-space-sm rounded-lg bg-surface-container-low p-space-sm opacity-70">
          <input
            type="checkbox"
            disabled
            aria-disabled="true"
            className="mt-0.5 h-4 w-4 rounded accent-primary-container"
          />
          <span className="flex flex-col">
            <span className="flex items-center gap-1 font-title-sm text-title-sm text-on-surface">
              {t('form.enable2fa')}
              <span className="rounded-full bg-primary-fixed px-1.5 font-label-sm text-label-sm text-on-primary-fixed">
                {t('form.recommended')}
              </span>
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {t('form.enable2faHint')}
            </span>
          </span>
        </label>
        <label className="flex cursor-not-allowed items-start gap-space-sm px-space-sm py-1 opacity-70">
          <input
            type="checkbox"
            disabled
            aria-disabled="true"
            className="mt-0.5 h-4 w-4 rounded accent-primary-container"
          />
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            {t('form.agree')}
          </span>
        </label>
      </div>
      <div className="flex flex-col gap-space-md pt-space-sm">
        <SoonButton variant="primary" soon={soon} className="h-11 w-full">
          <Icon name="login" size={20} />
          {t('form.submit')}
          <Icon name="arrow_forward" size={18} />
        </SoonButton>
        <div className="text-center font-body-sm text-body-sm text-on-surface-variant">
          <span>{t('form.haveAccount')} </span>
          <span className="font-title-sm text-title-sm text-secondary underline">
            {t('form.linkLogin')}
          </span>
        </div>
      </div>
    </form>
  );
}

/**
 * Khung trang nhận lời mời (`design/stitch/accept-invite.html`): dải xác nhận, thẻ hai cột (ngữ cảnh workspace | hành động),
 * hàng cam kết. `sample` (chỉ bản dev/route mẫu) thêm các khối cần dữ liệu chưa có: người mời, kênh, quyền, người nhận và
 * biểu mẫu thiết lập mật khẩu (vô hiệu, "Sắp có"). `children` là hành động thật (đăng nhập/đăng ký/chấp nhận).
 */
export async function InviteShell({
  workspace,
  role,
  sample,
  children,
}: {
  workspace: string;
  role: string;
  sample?: InviteSample;
  children: ReactNode;
}) {
  const t = await getTranslations('invite.ui');
  const ta = await getTranslations('auth');
  const tu = await getTranslations('auth.ui');
  const officialApi = tu('card.officialApi');
  const encrypted = tu('card.encrypted');
  const trust = [ta('panel.officialApi'), ta('panel.humanInControl'), ta('panel.bilingual')];
  return (
    <AuthChrome>
      <div className="relative w-full overflow-hidden py-space-xl md:py-8">
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary-container/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-1/2 h-96 w-96 rounded-full bg-secondary-container/10 blur-3xl" />
        <div className="relative z-10 mx-auto max-w-7xl px-gutter">
          <div className="mb-space-lg flex flex-wrap items-center justify-between gap-space-md rounded-lg bg-surface-container-low px-space-lg py-space-sm shadow-sm">
            <div className="flex items-center gap-space-sm">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-fixed text-primary">
                <Icon name="verified" size={16} />
              </span>
              <span className="font-title-sm text-title-sm text-on-surface">{t('ribbon')}</span>
            </div>
            <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant">
              <span className="text-primary-container">
                <Icon name="shield_lock" size={15} />
              </span>
              <span>{officialApi}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 overflow-hidden rounded-xl bg-surface-container-lowest shadow-xl lg:grid-cols-12">
            <InviteContext workspace={workspace} role={role} sample={sample} />
            <div className="flex flex-col justify-between bg-surface-container-lowest p-space-lg md:p-space-xl lg:col-span-7">
              <div className="mx-auto w-full max-w-xl">
                <div className="mb-space-lg">
                  <div className="mb-1 flex items-center gap-space-xs text-secondary">
                    <Icon name="bolt" size={20} />
                    <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider">
                      {t('eyebrow')}
                    </span>
                  </div>
                  <h2 className="font-headline-lg text-headline-lg font-bold tracking-tight text-on-surface">
                    {t('heading')}
                  </h2>
                  <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                    {t('lead')}
                  </p>
                </div>
                <div className="flex flex-col gap-space-md">{children}</div>
                {sample ? (
                  <div className="mt-space-lg flex flex-col gap-space-sm border-t border-surface-container pt-space-lg">
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      {t('form.soonNote')}
                    </p>
                    <InviteSetupForm sample={sample} />
                  </div>
                ) : null}
              </div>
              <div className="-mx-space-lg -mb-space-lg mt-space-xl flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-low p-space-md md:-mx-space-xl md:-mb-space-xl">
                <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-outline">
                  <span className="text-primary-container">
                    <Icon name="lock" size={16} />
                  </span>
                  <span>{encrypted}</span>
                </div>
                <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-outline">
                  <Icon name="contact_support" size={16} />
                  <span>{t('help')}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-space-lg grid grid-cols-1 gap-space-md text-center md:grid-cols-3">
            {trust.map((text, i) => (
              <div
                key={text}
                className="flex items-center justify-center gap-space-sm rounded-lg bg-surface-container-low p-space-md shadow-sm"
              >
                <span className={TRUST_TONES[i]}>
                  <Icon name={TRUST_ICONS[i] ?? 'bolt'} size={20} />
                </span>
                <span className="font-body-sm text-body-sm text-on-surface">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AuthChrome>
  );
}

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { ChangePasswordCard } from '../../../../components/security/change-password-card';
import { type SessionRow, SessionsCard } from '../../../../components/security/sessions-card';
import { EnrollStepper, TwoFactorCard } from '../../../../components/security/two-factor-card';
import { AccountCard } from '../../../../components/settings/account-card';
import { LanguageCard } from '../../../../components/settings/language-card';
import { SettingsFrame, TwPageHeader } from '../../../../components/settings/settings-frame';
import { TwDialog, TwDialogTrigger } from '../../../../components/settings/tw/dialog';
import { TwChip, twBtn } from '../../../../components/settings/tw/ui';
import { Icon } from '../../../../components/ui/icon';

const SAMPLE_OPEN = '[MẪU] Xem hộp thoại bật 2FA (bước 2)';
const SAMPLE_QR = '[MẪU] Ảnh QR sinh ở máy chủ khi bật thật.';
const SAMPLE_USER = '[MẪU] Nguyễn Mai Linh';
const SAMPLE_EMAIL = 'mau@example.invalid';
const SAMPLE_ROLE = 'owner';
const SETUP_DIALOG = 'dev-setup-step2';
const NOW = new Date('2026-11-06T10:30:00Z');
const SESSIONS: SessionRow[] = [
  {
    id: 's1a1b2',
    browser: 'chrome',
    os: 'windows',
    current: true,
    lastUsedAt: NOW,
    createdAt: NOW,
  },
  {
    id: 's2',
    browser: 'safari',
    os: 'ios',
    current: false,
    lastUsedAt: new Date(NOW.getTime() - 32 * 60_000),
    createdAt: new Date(NOW.getTime() - 86_400_000),
  },
];

/**
 * Trang xem giao diện Cài đặt với DỮ LIỆU MẪU — chỉ khi `NODE_ENV !== 'production'` (UI-first 06/11/2026).
 * `?state=off` xem trạng thái chưa bật 2FA. Hộp thoại "bước 2" ở đây là bản tĩnh để chụp ảnh (không gọi máy chủ).
 */
export default async function DevSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const [t, params] = await Promise.all([getTranslations(), searchParams]);
  const enabled = params.state !== 'off';
  return (
    <DevShell>
      <main className="app-page app-page-settings">
        <SettingsFrame
          viewerRole="owner"
          active="security"
          counts={{ channelsConnected: 3, channelsTotal: 3, members: 5 }}
          header={
            <TwPageHeader
              title={t('settings.title')}
              subtitle={t('settings.subtitle')}
              end={
                <TwChip tone={enabled ? 'ok' : 'warn'} dot className="px-3 py-1.5">
                  {t(enabled ? 'settings.securityStatus.on' : 'settings.securityStatus.off')}
                </TwChip>
              }
            />
          }
          sideNote={
            <div className="bg-surface-container-low rounded-xl p-space-md shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Icon name="verified" size={16} />
                <span className="font-title-sm text-title-sm">
                  {t('settings.securityNote.title')}
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('settings.securityNote.body')}
              </p>
            </div>
          }
        >
          <p className="inbox-sample-note" role="note">
            {DEV_SAMPLE_NOTE}
          </p>
          <TwoFactorCard enabled={enabled} required={false} />
          <p>
            <TwDialogTrigger dialogId={SETUP_DIALOG} className={twBtn({ tone: 'soft' })}>
              {SAMPLE_OPEN}
            </TwDialogTrigger>
          </p>
          <TwDialog
            dialogId={SETUP_DIALOG}
            title={t('auth.security.twoFactor.setupTitle')}
            description={t('auth.security.twoFactor.setupBody')}
            icon={<Icon name="lock_person" size={20} />}
            size="xl"
          >
            <div className="space-y-space-md">
              <EnrollStepper step={2} />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
                <div className="lg:col-span-5 bg-surface-container-low p-space-lg rounded-xl space-y-2">
                  <h3 className="font-title-sm text-title-sm text-on-surface">
                    {t('auth.security.twoFactor.scanTitle')}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {t('auth.security.twoFactor.scanBody')}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{SAMPLE_QR}</p>
                </div>
                <div className="lg:col-span-7 bg-surface-container-lowest p-space-md rounded-xl space-y-space-md self-start">
                  <p className="font-title-sm text-title-sm text-on-surface">
                    {t('auth.security.twoFactor.confirmLabel')}
                  </p>
                  <button type="button" className={twBtn({ tone: 'primary', size: 'lg' })}>
                    {t('auth.security.twoFactor.confirm')}
                  </button>
                </div>
              </div>
            </div>
          </TwDialog>
          <AccountCard
            name={SAMPLE_USER}
            email={SAMPLE_EMAIL}
            emailVerified
            memberRole={SAMPLE_ROLE}
            profile={{
              image: null,
              timezone: 'Asia/Ho_Chi_Minh',
              phone: null,
              phoneVerified: false,
            }}
            phoneVerifyEnabled={false}
            avatarEnabled={false}
          >
            <ChangePasswordCard />
          </AccountCard>
          <SessionsCard sessions={SESSIONS} />
          <LanguageCard theme="system" />
        </SettingsFrame>
      </main>
    </DevShell>
  );
}

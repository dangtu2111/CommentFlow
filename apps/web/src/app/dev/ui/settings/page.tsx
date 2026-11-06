import { LockKeyhole } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { ChangePasswordCard } from '../../../../components/security/change-password-card';
import { type SessionRow, SessionsCard } from '../../../../components/security/sessions-card';
import { EnrollStepper, TwoFactorCard } from '../../../../components/security/two-factor-card';
import { AccountCard } from '../../../../components/settings/account-card';
import { LanguageCard } from '../../../../components/settings/language-card';
import { SettingsFrame } from '../../../../components/settings/settings-frame';
import { Dialog, DialogTrigger } from '../../../../components/ui/dialog';
import { PageHeader } from '../../../../components/ui/page-header';

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
          header={<PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />}
        >
          <p className="inbox-sample-note" role="note">
            {DEV_SAMPLE_NOTE}
          </p>
          <TwoFactorCard enabled={enabled} required={false} />
          <p>
            <DialogTrigger dialogId={SETUP_DIALOG} className="btn btn-secondary">
              {SAMPLE_OPEN}
            </DialogTrigger>
          </p>
          <Dialog
            dialogId={SETUP_DIALOG}
            title={t('auth.security.twoFactor.setupTitle')}
            description={t('auth.security.twoFactor.setupBody')}
            icon={<LockKeyhole size={22} />}
          >
            <div className="stack">
              <EnrollStepper step={2} />
              <div className="setup-grid">
                <div className="setup-qr">
                  <h3 className="section-subtitle">{t('auth.security.twoFactor.scanTitle')}</h3>
                  <p className="muted">{t('auth.security.twoFactor.scanBody')}</p>
                  <p className="muted">{SAMPLE_QR}</p>
                </div>
                <div className="setup-code">
                  <p className="muted">{t('auth.security.twoFactor.confirmLabel')}</p>
                  <button type="button" className="btn btn-primary">
                    {t('auth.security.twoFactor.confirm')}
                  </button>
                </div>
              </div>
            </div>
          </Dialog>
          <AccountCard
            name={SAMPLE_USER}
            email={SAMPLE_EMAIL}
            emailVerified
            memberRole={SAMPLE_ROLE}
          />
          <ChangePasswordCard />
          <SessionsCard sessions={SESSIONS} />
          <LanguageCard />
        </SettingsFrame>
      </main>
    </DevShell>
  );
}

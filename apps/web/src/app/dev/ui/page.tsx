import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { NotificationBell } from '../../../components/app/notification-bell';
import { OnboardingStepper } from '../../../components/app/onboarding-stepper';
import { ShellNav } from '../../../components/app/shell-nav';
import { SystemBanners } from '../../../components/app/system-banners';
import { UserCard } from '../../../components/app/user-card';
import { BrandLogo } from '../../../components/brand-logo';
import { LocaleSwitcher } from '../../../components/locale-switcher';
import { navGroupsFor } from '../../../lib/app-nav';
import { buildNotifications } from '../../../lib/notification-model';

const SAMPLE_WORKSPACE = '[MẪU] Cửa hàng mẫu';

/**
 * Trang xem giao diện với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'` (UI-first 06/11/2026). Không đọc DB, không
 * phiên. Mọi thứ hiện ra đều là mẫu và được gắn nhãn "[MẪU]"; không bao giờ coi là số liệu thật.
 */
export default async function DevUiPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const t = await getTranslations();
  const groups = navGroupsFor('owner').map((group) => ({
    key: group.key,
    label: t(`shell.groups.${group.key}`),
    items: group.items.map((item) => ({ ...item, label: t(`shell.nav.${item.key}`) })),
  }));
  const alerts = {
    banners: [
      {
        status: 'expired' as const,
        names: ['[MẪU] Page A'],
        moreCount: 0,
        audience: 'owner' as const,
        urgent: true,
      },
    ],
    silent: null,
    reconnect: true,
  };
  return (
    <div className="shell">
      <header className="shell-top">
        <BrandLogo href="/dev/ui" />
        <span className="chip-live">{SAMPLE_WORKSPACE}</span>
        <div className="shell-top-end">
          <LocaleSwitcher />
          <NotificationBell
            model={buildNotifications(alerts.banners, alerts.silent)}
            canOpenChannels
          />
        </div>
      </header>
      <div className="shell-body">
        <ShellNav
          groups={groups}
          label={t('shell.navLabel')}
          footer={
            <UserCard name="[MẪU] Nguyễn Mai Linh" roleLabel={t('workspace.switcher.role.owner')} />
          }
        />
        <div className="shell-main">
          <div data-slot="banners">
            <SystemBanners alerts={alerts} />
          </div>
          <main className="app-page app-page-wide">
            <OnboardingStepper active="pages" />
          </main>
        </div>
      </div>
    </div>
  );
}

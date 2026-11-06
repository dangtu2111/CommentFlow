import { getTranslations } from 'next-intl/server';
import { navGroupsFor } from '../../lib/app-nav';
import { buildNotifications } from '../../lib/notification-model';
import { NotificationBell } from '../app/notification-bell';
import { ShellNav } from '../app/shell-nav';
import { UserCard } from '../app/user-card';
import { BrandLogo } from '../brand-logo';
import { LocaleSwitcher } from '../locale-switcher';

const SAMPLE_SHOP = '[MẪU] Cửa hàng mẫu';
const SAMPLE_USER = '[MẪU] Nguyễn Mai Linh';
export const DEV_SAMPLE_NOTE = '[MẪU] Dữ liệu mẫu — không phải số liệu thật';

/**
 * Khung ứng dụng cho các trang xem giao diện `/dev/ui/*` (chỉ dùng khi `NODE_ENV !== 'production'`, trang gọi tự kiểm).
 * Không DB, không phiên; mọi tên/số trong trang con là mẫu và phải gắn nhãn "[MẪU]".
 */
export async function DevShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  const groups = navGroupsFor('owner').map((group) => ({
    key: group.key,
    label: t(`shell.groups.${group.key}`),
    items: group.items.map((item) => ({ ...item, label: t(`shell.nav.${item.key}`) })),
  }));
  return (
    <div className="shell">
      <header className="shell-top">
        <BrandLogo href="/dev/ui" />
        <span className="chip-live">{SAMPLE_SHOP}</span>
        <div className="shell-top-end">
          <LocaleSwitcher />
          <NotificationBell model={buildNotifications([], null)} canOpenChannels />
        </div>
      </header>
      <div className="shell-body">
        <ShellNav
          groups={groups}
          label={t('shell.navLabel')}
          footer={<UserCard name={SAMPLE_USER} roleLabel={t('workspace.switcher.role.owner')} />}
        />
        <div className="shell-main">{children}</div>
      </div>
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { PrivacyView } from '../../../../../components/settings/privacy-view';
import { SettingsFrame } from '../../../../../components/settings/settings-frame';
import { requireAppUser } from '../../../../../server/require-app-user';
import { loadSettingsCounts } from '../../../../../server/settings-counts';
import { requestDeletionAction, requestExportAction } from './actions';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('settings'), getTranslations('shell')]);
  return { title: `${t('privacy.title')} · ${tb('brand')}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOTICES = ['unavailable', 'mismatch'] as const;

/** Dữ liệu & Quyền riêng tư (FR-094, US-071): CHỈ Owner. Giao diện + interface, chưa xuất/xóa thật. */
export default async function PrivacyPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const { notice } = await searchParams;
  const counts = await loadSettingsCounts({
    role: workspace.role,
    workspaceId: workspace.id,
    userId: user.id,
  });
  return (
    <main className="app-page app-page-settings">
      <SettingsFrame viewerRole={workspace.role} active="privacy" counts={counts}>
        <PrivacyView
          workspaceName={workspace.name}
          notice={NOTICES.find((n) => n === notice) ?? null}
          actions={{ exportData: requestExportAction, requestDeletion: requestDeletionAction }}
        />
      </SettingsFrame>
    </main>
  );
}

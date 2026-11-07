import { getTranslations } from 'next-intl/server';
import { PrivacyView } from '../../../../../components/settings/privacy-view';
import { parsePrivacyNotice } from '../../../../../lib/data-privacy';
import { getBrand } from '../../../../../server/brand';
import { requireAppUser } from '../../../../../server/require-app-user';
import { loadSettingsCounts } from '../../../../../server/settings-counts';
import { requestDeletionAction, requestExportAction } from './actions';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: `${t('privacy.title')} · ${getBrand().name}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Dữ liệu & Quyền riêng tư (FR-094, US-071): CHỈ Owner. Xuất dữ liệu thật sau cờ DATA_EXPORT_ENABLED (tắt = "chưa mở"); xóa workspace chưa mở. */
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
      <PrivacyView
        frame={{ viewerRole: workspace.role, counts }}
        workspaceName={workspace.name}
        notice={parsePrivacyNotice(notice)}
        actions={{ exportData: requestExportAction, requestDeletion: requestDeletionAction }}
      />
    </main>
  );
}

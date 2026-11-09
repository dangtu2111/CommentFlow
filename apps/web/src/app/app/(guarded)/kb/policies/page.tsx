import { listAllPolicyFacts } from '@flow/db/runtime';
import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { PolicyFactsPanel } from '../../../../../components/kb/policy-facts-panel';
import { policyNoticeOf } from '../../../../../lib/kb-policy-notice';
import { buildPolicyFactsView } from '../../../../../lib/kb-policy-view';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import {
  approvePolicyAction,
  deleteApprovedPolicyAction,
  discardPolicyDraftAction,
} from '../policy-actions';

export async function generateMetadata() {
  const t = await getTranslations('kbPolicyFacts');
  return { title: `${t('title')} · ${getBrand().name}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Chính sách CÓ CẤU TRÚC (ADR 017, `policy_facts`) — thành viên nào cũng xem được, chỉ Owner thấy nút sửa/duyệt (Staff: khóa mềm). Trang chính sách dạng văn bản cũ đã bỏ
 * (chủ dự án chốt 09/11/2026): chính sách văn bản nạp từ Shopify vẫn nuôi bộ tìm kiếm tri thức và là nguồn đề xuất giá trị ở đây.
 */
export default async function KbPoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({});
  const isOwner = workspace.role === 'owner';
  const query = await searchParams;
  const facts = await getDb().withActor(workspace.id, user.id, (tx) =>
    listAllPolicyFacts(tx, workspace.id),
  );
  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbPolicies">
        <div className="tw space-y-space-lg">
          <PolicyFactsPanel
            view={buildPolicyFactsView(facts)}
            isOwner={isOwner}
            notice={policyNoticeOf(query.pn)}
            actions={{
              approve: approvePolicyAction,
              discard: discardPolicyDraftAction,
              remove: deleteApprovedPolicyAction,
            }}
          />
        </div>
      </KbFrame>
    </main>
  );
}

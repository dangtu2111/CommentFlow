import { getShopifyStore, listAllPolicyFacts, listPolicyItems } from '@flow/db/runtime';
import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { PolicyFactsPanel } from '../../../../../components/kb/policy-facts-panel';
import { buildPolicyLeftover } from '../../../../../lib/kb-policy-leftover';
import { policyNoticeOf } from '../../../../../lib/kb-policy-notice';
import { buildPolicyFactsView } from '../../../../../lib/kb-policy-view';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import {
  approvePolicyAction,
  deleteApprovedPolicyAction,
  discardPolicyDraftAction,
  syncPoliciesFromShopifyAction,
} from '../policy-actions';

export async function generateMetadata() {
  const t = await getTranslations('kbPolicyFacts');
  return { title: `${t('title')} · ${getBrand().name}` };
}

const EXCERPT_CHARS = 180;

/** Dòng hiển thị của một văn bản thô: loại, tiêu đề, đoạn đầu (cắt gọn, bỏ xuống dòng). */
const rawView = (item: { kind: string; title: string; content: string }) => ({
  kind: item.kind,
  title: item.title,
  excerpt: item.content.replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CHARS),
});

/** Trạng thái lần đồng bộ Shopify gần nhất để hiển thị (null = chưa kết nối hoặc đã ngắt). */
function syncStatusOf(store: Awaited<ReturnType<typeof getShopifyStore>>) {
  if (store === null || store.status === 'disconnected') return null;
  const summary = store.lastSyncSummary;
  return {
    syncedAt: store.lastSyncedAt === null ? null : store.lastSyncedAt.toISOString(),
    ok: store.lastSyncResult === 'ok',
    ...(summary.policiesUpdated === undefined ? {} : { policiesUpdated: summary.policiesUpdated }),
    ...(summary.policiesSkipped ? { policiesSkipped: true } : {}),
    ...(summary.policyFactsDrafted === undefined
      ? {}
      : { factsDrafted: summary.policyFactsDrafted }),
    ...(summary.policyFactsSkipped ? { factsSkipped: true } : {}),
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Chính sách CÓ CẤU TRÚC (ADR 017, `policy_facts`) — thành viên nào cũng xem được, chỉ Owner thấy nút sửa/duyệt (Staff: khóa mềm). Việc đọc mọi chính sách và tự rút giá trị vào từng thẻ do
 * job đồng bộ Shopify làm (không có bước phân tách thủ công); trang chỉ hiển thị kết quả, trạng thái lần đồng bộ gần nhất và phần chưa phân tách được.
 */
export default async function KbPoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({});
  const isOwner = workspace.role === 'owner';
  const query = await searchParams;
  const [facts, rawItems, store] = await getDb().withActor(workspace.id, user.id, async (tx) => {
    const rows = await listAllPolicyFacts(tx, workspace.id);
    // Văn bản thô và kết nối Shopify chỉ Owner đọc (RLS); Staff không có phần này.
    const raw = isOwner ? await listPolicyItems(tx, workspace.id) : null;
    const connection = isOwner ? await getShopifyStore(tx, workspace.id) : null;
    return [rows, raw, connection] as const;
  });
  // Câu trong dữ liệu thô chưa thành giá trị có cấu trúc.
  const leftover =
    rawItems === null
      ? null
      : buildPolicyLeftover(
          rawItems,
          facts.map((fact) => fact.evidence),
        );
  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbPolicies">
        <div className="tw space-y-space-lg">
          <PolicyFactsPanel
            view={buildPolicyFactsView(facts)}
            isOwner={isOwner}
            notice={policyNoticeOf(query.pn)}
            {...(leftover === null ? {} : { leftover })}
            {...(rawItems === null
              ? {}
              : {
                  raw: {
                    count: rawItems.length,
                    items: rawItems.map(rawView),
                    sync: syncStatusOf(store),
                  },
                })}
            actions={{
              approve: approvePolicyAction,
              discard: discardPolicyDraftAction,
              remove: deleteApprovedPolicyAction,
              sync: syncPoliciesFromShopifyAction,
            }}
          />
        </div>
      </KbFrame>
    </main>
  );
}

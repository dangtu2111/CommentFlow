import { listAllPolicyFacts, listPolicyItems } from '@flow/db/runtime';
import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { PolicyFactsPanel } from '../../../../../components/kb/policy-facts-panel';
import { buildPolicyLeftover } from '../../../../../lib/kb-policy-leftover';
import { policyCountOf, policyNoticeOf } from '../../../../../lib/kb-policy-notice';
import { buildPolicyFactsView } from '../../../../../lib/kb-policy-view';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import {
  analyzePolicyTextAction,
  approvePolicyAction,
  deleteApprovedPolicyAction,
  discardPolicyDraftAction,
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

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Chính sách CÓ CẤU TRÚC (ADR 017, `policy_facts`) — thành viên nào cũng xem được, chỉ Owner thấy nút sửa/duyệt (Staff: khóa mềm). Trang chính sách dạng văn bản cũ đã bỏ
 * (chủ dự án chốt 09/11/2026): chính sách văn bản nạp từ Shopify vẫn nuôi bộ tìm kiếm tri thức và là nguồn đề xuất giá trị ở đây.
 */
export default async function KbPoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({});
  const isOwner = workspace.role === 'owner';
  const query = await searchParams;
  const [facts, rawItems] = await getDb().withActor(workspace.id, user.id, async (tx) => {
    const rows = await listAllPolicyFacts(tx, workspace.id);
    // Văn bản thô chỉ Owner đọc (RLS bảng chính sách văn bản); Staff không có số này.
    const raw = isOwner ? await listPolicyItems(tx, workspace.id) : null;
    return [rows, raw] as const;
  });
  // Câu trong dữ liệu thô chưa thành giá trị có cấu trúc (chỉ Owner: văn bản thô chỉ Owner đọc).
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
            noticeCount={policyCountOf(query.pc)}
            {...(leftover === null ? {} : { leftover })}
            {...(rawItems === null
              ? {}
              : { raw: { count: rawItems.length, items: rawItems.map(rawView) } })}
            actions={{
              approve: approvePolicyAction,
              discard: discardPolicyDraftAction,
              remove: deleteApprovedPolicyAction,
              analyze: analyzePolicyTextAction,
            }}
          />
        </div>
      </KbFrame>
    </main>
  );
}

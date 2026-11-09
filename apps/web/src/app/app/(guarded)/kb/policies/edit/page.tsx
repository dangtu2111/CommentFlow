import { listAllPolicyFacts } from '@flow/db/runtime';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../../../components/kb/kb-frame';
import { PolicyValueForm } from '../../../../../../components/kb/policy-value-form';
import { isEditableKind, policyFormDefaults } from '../../../../../../lib/kb-policy-form';
import { getBrand } from '../../../../../../server/brand';
import { getDb } from '../../../../../../server/db';
import { requireAppUser } from '../../../../../../server/require-app-user';
import { savePolicyValueAction } from '../../policy-actions';

export async function generateMetadata() {
  const t = await getTranslations('kbPolicyFacts');
  return { title: `${t('form.pageTitle.edit')} · ${getBrand().name}` };
}

const BACK_HREF = '/app/kb/policies';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Sửa tay / Thêm giá trị chính sách có cấu trúc — chỉ Owner. `kind` (4 loại) bắt buộc; `id` (tùy chọn) là dòng đang sửa (bản nháp hoặc bản đã duyệt) để điền sẵn. Đang có NHÁP cùng
 * (kind, slot) thì luôn sửa trên nháp đó (điền sẵn từ nháp, kèm `draftId` + `rev` để phát hiện lệch phiên bản khi lưu). Loại một giá trị duy nhất (đổi trả/bảo hành/thanh toán) mà đã có dòng
 * thì "Thêm" quay về sửa dòng đó. Dòng ship mới (không có `id`) cho nhập nhãn; dòng ship đã có thì khóa nhãn (nhãn là định danh).
 */
export default async function KbPolicyEditPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const query = await searchParams;
  const kind = first(query.kind);
  if (!isEditableKind(kind)) notFound();
  const rows = await getDb().withActor(workspace.id, user.id, (tx) =>
    listAllPolicyFacts(tx, workspace.id),
  );
  const id = first(query.id);
  const picked = id ? rows.find((row) => row.id === id && row.kind === kind) : undefined;
  if (id && picked === undefined) notFound();
  const sameSlot = (slot: string) => rows.filter((row) => row.kind === kind && row.slot === slot);
  // Bản gốc để điền sẵn: dòng được chọn; hoặc (loại một giá trị) dòng duy nhất đã có.
  const anchor =
    picked ?? (kind === 'ship_region' ? undefined : rows.find((row) => row.kind === kind));
  const candidates = anchor ? sameSlot(anchor.slot) : [];
  const existingDraft = candidates.find((row) => row.status === 'draft');
  const base = existingDraft ?? candidates.find((row) => row.status === 'approved') ?? null;
  const heading = base === null ? 'add' : 'edit';
  const draft = existingDraft ? { id: existingDraft.id, rev: existingDraft.rev } : null;
  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbPolicies">
        <div className="tw space-y-space-lg">
          <PolicyValueForm
            kind={kind}
            defaults={policyFormDefaults(kind, base?.data ?? null)}
            action={savePolicyValueAction}
            cancelHref={BACK_HREF}
            draft={draft}
            labelEditable={kind === 'ship_region' && base === null}
            heading={heading}
          />
        </div>
      </KbFrame>
    </main>
  );
}

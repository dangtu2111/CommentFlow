import { listAllPolicyFacts, listPolicyItems } from '@flow/db/runtime';
import { POLICY_KINDS } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import {
  DeleteButton,
  Field,
  KbCard,
  KbNoticeBanner,
  KbPageHead,
  kbNoticeOf,
  LangSelect,
  SaveButton,
  SelectField,
} from '../../../../../components/kb/kb-content-ui';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { PolicyFactsPanel } from '../../../../../components/kb/policy-facts-panel';
import { policyNoticeOf } from '../../../../../lib/kb-policy-notice';
import { buildPolicyFactsView } from '../../../../../lib/kb-policy-view';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import { createPolicyAction, deletePolicyAction, updatePolicyAction } from '../actions';
import {
  approvePolicyAction,
  deleteApprovedPolicyAction,
  discardPolicyDraftAction,
} from '../policy-actions';

export async function generateMetadata() {
  const t = await getTranslations('kbContent');
  return { title: `${t('policies.title')} · ${getBrand().name}` };
}

/** Mặc định khi thêm mới. */
const DEFAULT_NEW_LANG = 'all';
const DEFAULT_NEW_KIND = 'shipping';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Chính sách: phần CÓ CẤU TRÚC (ADR 017, `policy_facts`) ở trên — thành viên nào cũng xem được, chỉ Owner thấy nút sửa/duyệt (Staff: khóa mềm). Phần văn bản (FR-050, nuôi bộ tìm kiếm
 * tri thức và là nguồn để AI rút giá trị đề xuất) giữ nguyên bên dưới, chỉ Owner. Loại và ngôn ngữ cố định sau khi tạo (đổi bằng cách xóa rồi thêm lại).
 */
export default async function KbPoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({});
  const isOwner = workspace.role === 'owner';
  const [t, query] = await Promise.all([getTranslations('kbContent'), searchParams]);
  const [facts, policies] = await getDb().withActor(
    workspace.id,
    user.id,
    async (tx) =>
      [
        await listAllPolicyFacts(tx, workspace.id),
        isOwner ? await listPolicyItems(tx, workspace.id) : [],
      ] as const,
  );
  const factsView = buildPolicyFactsView(facts);
  const kindOptions = POLICY_KINDS.map((kind) => ({
    value: kind,
    label: t(`policies.kinds.${kind}`),
  }));

  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbPolicies">
        <div className="tw space-y-space-lg">
          <PolicyFactsPanel
            view={factsView}
            isOwner={isOwner}
            notice={policyNoticeOf(query.pn)}
            actions={{
              approve: approvePolicyAction,
              discard: discardPolicyDraftAction,
              remove: deleteApprovedPolicyAction,
            }}
          />
          {isOwner ? (
            <>
              <KbPageHead title={t('policies.title')} subtitle={t('policies.subtitle')} />
              <KbNoticeBanner notice={kbNoticeOf(query.n)} />
              {policies.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">{t('empty')}</p>
              ) : null}
              {policies.map((policy) => (
                <KbCard
                  key={policy.id}
                  id={`policy-${policy.id}`}
                  title={`${t(`policies.kinds.${policy.kind}`)} — ${t(`lang.${policy.lang}`)}`}
                >
                  <form action={updatePolicyAction} className="space-y-space-md">
                    <input type="hidden" name="id" value={policy.id} />
                    <input type="hidden" name="kind" value={policy.kind} />
                    <input type="hidden" name="lang" value={policy.lang} />
                    <Field
                      label={t('policies.titleLabel')}
                      name="title"
                      defaultValue={policy.title}
                      required
                      maxLength={200}
                    />
                    <Field
                      label={t('policies.content')}
                      name="content"
                      rows={5}
                      defaultValue={policy.content}
                      required
                      maxLength={8000}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <SaveButton>{t('save')}</SaveButton>
                    </div>
                  </form>
                  <form action={deletePolicyAction} className="flex justify-end">
                    <input type="hidden" name="id" value={policy.id} />
                    <DeleteButton>{t('delete')}</DeleteButton>
                  </form>
                </KbCard>
              ))}
              <KbCard id="policy-new" title={t('policies.newTitle')}>
                <form action={createPolicyAction} className="space-y-space-md">
                  <div className="grid gap-space-md md:grid-cols-2">
                    <SelectField
                      label={t('policies.kind')}
                      name="kind"
                      defaultValue={DEFAULT_NEW_KIND}
                      options={kindOptions}
                    />
                    <LangSelect defaultValue={DEFAULT_NEW_LANG} />
                  </div>
                  <Field label={t('policies.titleLabel')} name="title" required maxLength={200} />
                  <Field
                    label={t('policies.content')}
                    name="content"
                    rows={5}
                    required
                    maxLength={8000}
                  />
                  <div className="flex justify-end">
                    <SaveButton>{t('add')}</SaveButton>
                  </div>
                </form>
              </KbCard>
            </>
          ) : null}
        </div>
      </KbFrame>
    </main>
  );
}

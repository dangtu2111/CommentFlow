import { listPolicyItems } from '@flow/db/runtime';
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
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import { createPolicyAction, deletePolicyAction, updatePolicyAction } from '../actions';

export async function generateMetadata() {
  const t = await getTranslations('kbContent');
  return { title: `${t('policies.title')} · ${getBrand().name}` };
}

/** Mặc định khi thêm mới. */
const DEFAULT_NEW_LANG = 'all';
const DEFAULT_NEW_KIND = 'shipping';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Chính sách (FR-050): chỉ Owner. Loại và ngôn ngữ cố định sau khi tạo (đổi bằng cách xóa rồi thêm lại). */
export default async function KbPoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, query] = await Promise.all([getTranslations('kbContent'), searchParams]);
  const policies = await getDb().withActor(workspace.id, user.id, (tx) =>
    listPolicyItems(tx, workspace.id),
  );
  const kindOptions = POLICY_KINDS.map((kind) => ({
    value: kind,
    label: t(`policies.kinds.${kind}`),
  }));

  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbPolicies">
        <div className="tw space-y-space-lg">
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
        </div>
      </KbFrame>
    </main>
  );
}

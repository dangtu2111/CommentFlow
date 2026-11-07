import { listFaqItems } from '@flow/db/runtime';
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
} from '../../../../../components/kb/kb-content-ui';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import { createFaqAction, deleteFaqAction, updateFaqAction } from '../actions';

export async function generateMetadata() {
  const t = await getTranslations('kbContent');
  return { title: `${t('faq.title')} · ${getBrand().name}` };
}

/** Ngôn ngữ mặc định khi thêm mới: áp dụng cho cả hai. */
const DEFAULT_NEW_LANG = 'all';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Hỏi – đáp (FAQ, FR-050): chỉ Owner; mỗi cặp một thẻ, sửa/xóa tại chỗ. */
export default async function KbFaqPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, query] = await Promise.all([getTranslations('kbContent'), searchParams]);
  const faqs = await getDb().withActor(workspace.id, user.id, (tx) =>
    listFaqItems(tx, workspace.id),
  );

  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbFaq">
        <div className="tw space-y-space-lg">
          <KbPageHead title={t('faq.title')} subtitle={t('faq.subtitle')} />
          <KbNoticeBanner notice={kbNoticeOf(query.n)} />
          <KbCard id="faq-new" title={t('faq.newTitle')}>
            <form action={createFaqAction} className="space-y-space-md">
              <Field label={t('faq.question')} name="question" required maxLength={1000} />
              <Field label={t('faq.answer')} name="answer" rows={4} required maxLength={8000} />
              <div className="grid gap-space-md md:grid-cols-2">
                <Field label={t('faq.tags')} name="tags" hint={t('faq.tagsHint')} />
                <LangSelect defaultValue={DEFAULT_NEW_LANG} />
              </div>
              <div className="flex justify-end">
                <SaveButton>{t('add')}</SaveButton>
              </div>
            </form>
          </KbCard>
          {faqs.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">{t('empty')}</p>
          ) : null}
          {faqs.map((faq) => (
            <KbCard key={faq.id} id={`faq-${faq.id}`} title={faq.question}>
              <form action={updateFaqAction} className="space-y-space-md">
                <input type="hidden" name="id" value={faq.id} />
                <Field
                  label={t('faq.question')}
                  name="question"
                  defaultValue={faq.question}
                  required
                  maxLength={1000}
                />
                <Field
                  label={t('faq.answer')}
                  name="answer"
                  rows={4}
                  defaultValue={faq.answer}
                  required
                  maxLength={8000}
                />
                <div className="grid gap-space-md md:grid-cols-2">
                  <Field
                    label={t('faq.tags')}
                    name="tags"
                    defaultValue={faq.tags.join(', ')}
                    hint={t('faq.tagsHint')}
                  />
                  <LangSelect defaultValue={faq.lang} />
                </div>
                <div className="flex justify-end">
                  <SaveButton>{t('save')}</SaveButton>
                </div>
              </form>
              <form action={deleteFaqAction} className="flex justify-end">
                <input type="hidden" name="id" value={faq.id} />
                <DeleteButton>{t('delete')}</DeleteButton>
              </form>
            </KbCard>
          ))}
        </div>
      </KbFrame>
    </main>
  );
}

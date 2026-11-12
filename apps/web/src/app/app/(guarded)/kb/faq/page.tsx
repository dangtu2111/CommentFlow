import { countDraftFaqs, listFaqItems } from '@flow/db/runtime';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  FAQ_CHIP,
  FAQ_ID,
  FaqCard,
  FaqField,
  FaqOffVariants,
  FaqStat,
  FaqToolbar,
} from '../../../../../components/kb/faq-ui';
import {
  DeleteButton,
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
const MAX_QUERY = 200;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.slice(0, MAX_QUERY).trim() ?? '';

/**
 * Hỏi – đáp (FAQ, FR-050): chỉ Owner; dựng theo `design/stitch/kb-faq.html` (KB-SHOP-V2 / UI KB) với dữ liệu thật: số câu, số nháp chờ duyệt, tìm kiếm và lọc theo thẻ (GET),
 * mỗi cặp một thẻ sửa/xóa tại chỗ. Khối thiết kế chưa có nền tảng là ô/nút tắt kèm chú thích.
 */
export default async function KbFaqPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, query] = await Promise.all([getTranslations('kbContent'), searchParams]);
  const { faqs, drafts } = await getDb().withActor(workspace.id, user.id, async (tx) => ({
    faqs: await listFaqItems(tx, workspace.id),
    drafts: await countDraftFaqs(tx, workspace.id),
  }));
  const q = first(query.q);
  const tag = first(query.tag).toLowerCase();
  const tagCounts = new Map<string, number>();
  for (const faq of faqs) {
    for (const item of faq.tags) tagCounts.set(item, (tagCounts.get(item) ?? 0) + 1);
  }
  const tags = [...tagCounts]
    .map(([name, count]) => ({ tag: name, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  const needle = q.toLowerCase();
  const shown = faqs.filter(
    (faq) =>
      (tag === '' || faq.tags.includes(tag)) &&
      (needle === '' || `${faq.question} ${faq.answer}`.toLowerCase().includes(needle)),
  );

  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbFaq">
        <div className="tw space-y-space-lg">
          <KbPageHead title={t('faq.title')} subtitle={t('faq.subtitle')} />
          <KbNoticeBanner notice={kbNoticeOf(query.n)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <FaqStat
              icon="help_center"
              value={String(faqs.length)}
              label={t('faq.stats.questions')}
              caption={t('faq.stats.active')}
            />
            <Link href="/app/kb-gaps?tab=pending" className="block">
              <FaqStat
                icon="auto_awesome"
                value={String(drafts)}
                label={t('faq.stats.drafts')}
                caption={t('faq.stats.draftsCaption')}
              />
            </Link>
          </div>
          <FaqToolbar
            q={q}
            tag={tag}
            tags={tags}
            total={faqs.length}
            labels={{
              search: t('faq.toolbar.search'),
              searchSubmit: t('faq.toolbar.searchSubmit'),
              all: t('faq.toolbar.all'),
              soon: t('faq.toolbar.soon'),
              syncWeb: t('faq.toolbar.syncWeb'),
              importFile: t('faq.toolbar.importFile'),
              aiVariants: t('faq.toolbar.aiVariants'),
              add: t('faq.toolbar.add'),
            }}
          />
          <FaqCard
            id="faq-new"
            chips={<span className={FAQ_CHIP}>{t('faq.newTitle')}</span>}
            title={t('faq.newTitle')}
          >
            <form action={createFaqAction} className="space-y-space-md">
              <FaqField label={t('faq.question')} name="question" required maxLength={1000} />
              <FaqField label={t('faq.answer')} name="answer" rows={4} required maxLength={8000} />
              <div className="grid gap-space-md md:grid-cols-2">
                <FaqField label={t('faq.tags')} name="tags" hint={t('faq.tagsHint')} />
                <LangSelect defaultValue={DEFAULT_NEW_LANG} />
              </div>
              <FaqOffVariants title={t('faq.variants.title')} note={t('faq.variants.note')} />
              <div className="flex justify-end">
                <SaveButton>{t('add')}</SaveButton>
              </div>
            </form>
          </FaqCard>
          {faqs.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">{t('empty')}</p>
          ) : shown.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">{t('faq.noMatch')}</p>
          ) : null}
          {shown.map((faq) => (
            <FaqCard
              key={faq.id}
              id={`faq-${faq.id}`}
              title={faq.question}
              chips={
                <>
                  <span className={FAQ_CHIP}>{t(`lang.${faq.lang}`)}</span>
                  {faq.tags.map((item) => (
                    <span key={item} className={FAQ_ID}>
                      {item}
                    </span>
                  ))}
                </>
              }
            >
              <form action={updateFaqAction} className="space-y-space-md">
                <input type="hidden" name="id" value={faq.id} />
                <FaqField
                  label={t('faq.question')}
                  name="question"
                  defaultValue={faq.question}
                  required
                  maxLength={1000}
                />
                <FaqField
                  label={t('faq.answer')}
                  name="answer"
                  rows={4}
                  defaultValue={faq.answer}
                  required
                  maxLength={8000}
                />
                <div className="grid gap-space-md md:grid-cols-2">
                  <FaqField
                    label={t('faq.tags')}
                    name="tags"
                    defaultValue={faq.tags.join(', ')}
                    hint={t('faq.tagsHint')}
                  />
                  <LangSelect defaultValue={faq.lang} />
                </div>
                <FaqOffVariants title={t('faq.variants.title')} note={t('faq.variants.note')} />
                <div className="flex justify-end">
                  <SaveButton>{t('save')}</SaveButton>
                </div>
              </form>
              <form action={deleteFaqAction} className="flex justify-end">
                <input type="hidden" name="id" value={faq.id} />
                <DeleteButton>{t('delete')}</DeleteButton>
              </form>
            </FaqCard>
          ))}
        </div>
      </KbFrame>
    </main>
  );
}

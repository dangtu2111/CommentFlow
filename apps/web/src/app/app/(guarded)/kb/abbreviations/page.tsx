import { listAbbreviations, listSystemAbbreviations } from '@flow/db/runtime';
import {
  ABBREVIATION_FULL_MAX,
  ABBREVIATION_LANGS,
  ABBREVIATION_SHORT_MAX,
  type AbbreviationLang,
} from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import {
  DeleteButton,
  Field,
  KbCard,
  KbNoticeBanner,
  KbPageHead,
  kbNoticeOf,
  SaveButton,
  SelectField,
} from '../../../../../components/kb/kb-content-ui';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { Icon } from '../../../../../components/ui/icon';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import {
  createAbbreviationAction,
  deleteAbbreviationAction,
  updateAbbreviationAction,
} from '../abbreviation-actions';

export async function generateMetadata() {
  const t = await getTranslations('kbContent');
  return { title: `${t('abbreviations.title')} · ${getBrand().name}` };
}

const DEFAULT_LANG = 'vi';
const MAX_QUERY = 100;
const SYSTEM_PREVIEW = 40;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.slice(0, MAX_QUERY).trim().toLowerCase() ?? '';

const CHIP =
  'px-2 py-0.5 rounded bg-surface-container-low text-on-surface font-code-sm text-code-sm';

/**
 * Từ điển viết tắt (FR-025, FR-050): chỉ Owner; dựng theo `design/stitch/kb-abbreviations.html` với dữ liệu THẬT — từ riêng của shop (thêm/sửa/xóa) và từ điển hệ thống (chỉ đọc).
 * Số lượt nhận diện, nhập Excel, nhóm theo chủ đề chưa có nền tảng nên không dựng (không số mẫu).
 */
export default async function KbAbbreviationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, query] = await Promise.all([getTranslations('kbContent'), searchParams]);
  const { own, system } = await getDb().withActor(workspace.id, user.id, async (tx) => ({
    own: await listAbbreviations(tx, workspace.id),
    system: await Promise.all(
      ABBREVIATION_LANGS.map(async (lang) => ({
        lang,
        entries: await listSystemAbbreviations(tx, lang),
      })),
    ),
  }));
  const q = first(query.q);
  const matches = (short: string, full: string) =>
    q === '' || short.toLowerCase().includes(q) || full.toLowerCase().includes(q);
  const shown = own.filter((row) => matches(row.short, row.full));
  const langOptions = ABBREVIATION_LANGS.map((value) => ({
    value,
    label: t(`lang.${value}`),
  }));
  const systemTotal = system.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbDictionary">
        <div className="tw space-y-space-lg">
          <KbPageHead title={t('abbreviations.title')} subtitle={t('abbreviations.subtitle')} />
          <KbNoticeBanner notice={kbNoticeOf(query.n)} />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
            <form
              method="get"
              action="/app/kb/abbreviations"
              className="relative w-full lg:max-w-md"
            >
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                <Icon name="search" size={18} />
              </span>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t('abbreviations.search')}
                aria-label={t('abbreviations.search')}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant font-body-md text-body-md shadow-sm outline-none focus:shadow-md"
              />
              <button type="submit" className="sr-only">
                {t('abbreviations.searchSubmit')}
              </button>
            </form>
            <span
              aria-disabled="true"
              title={t('abbreviations.soon')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-title-sm text-title-sm shadow-sm cursor-not-allowed opacity-60"
            >
              <Icon name="upload" size={16} />
              {t('abbreviations.importFile')}
            </span>
          </div>
          <KbCard id="abbreviation-new" title={t('abbreviations.newTitle')}>
            <form action={createAbbreviationAction} className="space-y-space-md">
              <div className="grid gap-space-md md:grid-cols-3">
                <Field
                  label={t('abbreviations.short')}
                  name="short"
                  required
                  maxLength={ABBREVIATION_SHORT_MAX}
                  hint={t('abbreviations.shortHint')}
                />
                <Field
                  label={t('abbreviations.full')}
                  name="full"
                  required
                  maxLength={ABBREVIATION_FULL_MAX}
                />
                <SelectField
                  label={t('langLabel')}
                  name="lang"
                  defaultValue={DEFAULT_LANG}
                  options={langOptions}
                />
              </div>
              <div className="flex justify-end">
                <SaveButton>{t('add')}</SaveButton>
              </div>
            </form>
          </KbCard>
          <KbCard id="abbreviation-own" title={t('abbreviations.ownTitle', { count: own.length })}>
            {own.length === 0 ? (
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t('abbreviations.ownEmpty')}
              </p>
            ) : shown.length === 0 ? (
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t('abbreviations.noMatch')}
              </p>
            ) : null}
            <ul className="space-y-space-md">
              {shown.map((row) => (
                <li key={row.id} className="rounded-lg bg-surface-container-low p-space-md">
                  <form action={updateAbbreviationAction} className="space-y-space-sm">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="lang" value={row.lang} />
                    <div className="grid gap-space-md md:grid-cols-[1fr_2fr_auto] md:items-end">
                      <Field
                        label={t('abbreviations.short')}
                        name="short"
                        defaultValue={row.short}
                        required
                        maxLength={ABBREVIATION_SHORT_MAX}
                      />
                      <Field
                        label={t('abbreviations.full')}
                        name="full"
                        defaultValue={row.full}
                        required
                        maxLength={ABBREVIATION_FULL_MAX}
                      />
                      <span className={CHIP}>{t(`lang.${row.lang as AbbreviationLang}`)}</span>
                    </div>
                    <div className="flex justify-end">
                      <SaveButton>{t('save')}</SaveButton>
                    </div>
                  </form>
                  <form action={deleteAbbreviationAction} className="flex justify-end">
                    <input type="hidden" name="id" value={row.id} />
                    <DeleteButton>{t('delete')}</DeleteButton>
                  </form>
                </li>
              ))}
            </ul>
          </KbCard>
          <KbCard
            id="abbreviation-system"
            title={t('abbreviations.systemTitle', { count: systemTotal })}
          >
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('abbreviations.systemHint')}
            </p>
            {system.map((group) => {
              const entries = group.entries.filter((e) => matches(e.short, e.full));
              return (
                <div key={group.lang} className="space-y-space-sm">
                  <h3 className="font-title-sm text-title-sm text-on-surface">
                    {t(`lang.${group.lang}`)} ({group.entries.length})
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {entries.slice(0, q === '' ? SYSTEM_PREVIEW : entries.length).map((e) => (
                      <li key={e.short} className={CHIP}>
                        {e.short} → {e.full}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </KbCard>
        </div>
      </KbFrame>
    </main>
  );
}

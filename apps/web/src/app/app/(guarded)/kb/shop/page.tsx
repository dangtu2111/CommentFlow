import { listShopProfiles } from '@flow/db/runtime';
import { CONTENT_LANGS } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import {
  KbNoticeBanner,
  KbPageHead,
  kbNoticeOf,
  LangSelect,
  SaveButton,
} from '../../../../../components/kb/kb-content-ui';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { ShopSections } from '../../../../../components/kb/shop-sections';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import { saveShopProfileAction } from '../actions';

export async function generateMetadata() {
  const t = await getTranslations('kbContent');
  return { title: `${t('shop.title')} · ${getBrand().name}` };
}

const NEW_FORM_ID = 'shop-new';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Thông tin cửa hàng (FR-050): chỉ Owner; mỗi ngôn ngữ một bản (vi / en / cả hai). Không giá, không tồn kho. */
export default async function KbShopPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, query] = await Promise.all([getTranslations('kbContent'), searchParams]);
  const profiles = await getDb().withActor(workspace.id, user.id, (tx) =>
    listShopProfiles(tx, workspace.id),
  );
  const missing = CONTENT_LANGS.find((lang) => !profiles.some((p) => p.lang === lang)) ?? 'vi';

  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbShop">
        <div className="tw space-y-space-lg">
          <KbPageHead title={t('shop.title')} subtitle={t('shop.subtitle')} />
          <KbNoticeBanner notice={kbNoticeOf(query.n)} />
          {profiles.map((profile) => (
            <form
              key={profile.lang}
              id={`shop-${profile.lang}`}
              action={saveShopProfileAction}
              className="space-y-space-md"
            >
              <input type="hidden" name="lang" value={profile.lang} />
              <h2 className="font-title-md text-title-md text-on-surface">
                {t('shop.cardTitle')} — {t(`lang.${profile.lang}`)}
              </h2>
              <ShopSections profile={profile} t={t} idPrefix={`shop-${profile.lang}`} />
              <div className="flex justify-end">
                <SaveButton>{t('save')}</SaveButton>
              </div>
            </form>
          ))}
          <form id={NEW_FORM_ID} action={saveShopProfileAction} className="space-y-space-md">
            <h2 className="font-title-md text-title-md text-on-surface">{t('shop.newTitle')}</h2>
            <LangSelect defaultValue={missing} />
            <ShopSections profile={null} t={t} idPrefix={NEW_FORM_ID} />
            <div className="flex justify-end">
              <SaveButton>{t('add')}</SaveButton>
            </div>
          </form>
        </div>
      </KbFrame>
    </main>
  );
}

import { listShopProfiles } from '@flow/db/runtime';
import { CONTENT_LANGS } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import {
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
import { saveShopProfileAction } from '../actions';

export async function generateMetadata() {
  const t = await getTranslations('kbContent');
  return { title: `${t('shop.title')} · ${getBrand().name}` };
}

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
            <KbCard
              key={profile.lang}
              id={`shop-${profile.lang}`}
              title={`${t('shop.cardTitle')} — ${t(`lang.${profile.lang}`)}`}
            >
              <form action={saveShopProfileAction} className="space-y-space-md">
                <input type="hidden" name="lang" value={profile.lang} />
                <ShopFields profile={profile} t={t} />
                <div className="flex justify-end">
                  <SaveButton>{t('save')}</SaveButton>
                </div>
              </form>
            </KbCard>
          ))}
          <KbCard id="shop-new" title={t('shop.newTitle')}>
            <form action={saveShopProfileAction} className="space-y-space-md">
              <LangSelect defaultValue={missing} />
              <ShopFields profile={null} t={t} />
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

type Profile = Awaited<ReturnType<typeof listShopProfiles>>[number];

function ShopFields({
  profile,
  t,
}: {
  profile: Profile | null;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <div className="grid gap-space-md md:grid-cols-2">
      <Field
        label={t('shop.name')}
        name="name"
        defaultValue={profile?.name}
        required
        maxLength={200}
      />
      <Field
        label={t('shop.website')}
        name="website"
        type="url"
        defaultValue={profile?.website}
        maxLength={500}
      />
      <div className="md:col-span-2">
        <Field
          label={t('shop.description')}
          name="description"
          rows={3}
          defaultValue={profile?.description}
          maxLength={2000}
        />
      </div>
      <Field
        label={t('shop.address')}
        name="address"
        defaultValue={profile?.address}
        maxLength={500}
      />
      <Field
        label={t('shop.openingHours')}
        name="openingHours"
        defaultValue={profile?.openingHours}
        maxLength={500}
      />
      <Field
        label={t('shop.contact')}
        name="contact"
        defaultValue={profile?.contact}
        hint={t('shop.contactHint')}
        maxLength={200}
      />
    </div>
  );
}

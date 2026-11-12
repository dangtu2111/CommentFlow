import { listBrandVoices } from '@flow/db/runtime';
import { CUSTOMER_ADDRESSES, HANDOFF_TOPICS, SHOP_PRONOUNS, VOICE_LANGS } from '@flow/shared';
import { getTranslations } from 'next-intl/server';
import {
  Field,
  KbCard,
  KbNoticeBanner,
  KbPageHead,
  kbNoticeOf,
  SaveButton,
  SelectField,
} from '../../../../../components/kb/kb-content-ui';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { VoiceBlock, VoiceOffControls } from '../../../../../components/kb/voice-ui';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';
import { saveBrandVoiceAction } from '../actions';

export async function generateMetadata() {
  const t = await getTranslations('kbContent');
  return { title: `${t('voice.title')} · ${getBrand().name}` };
}

/** Cách shop tự xưng mặc định theo ngôn ngữ. */
const DEFAULT_PRONOUN = { vi: 'em', en: 'shop' } as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Giọng văn thương hiệu (FR-050, FR-142): chỉ Owner; mỗi ngôn ngữ (vi/en) một biểu mẫu. */
export default async function KbVoicePage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, query] = await Promise.all([getTranslations('kbContent'), searchParams]);
  const voices = await getDb().withActor(workspace.id, user.id, (tx) =>
    listBrandVoices(tx, workspace.id),
  );
  const pronounOptions = SHOP_PRONOUNS.map((value) => ({
    value,
    label: t(`voice.pronouns.${value}`),
  }));

  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbVoice">
        <div className="tw space-y-space-lg">
          <KbPageHead title={t('voice.title')} subtitle={t('voice.subtitle')} />
          <KbNoticeBanner notice={kbNoticeOf(query.n)} />
          {VOICE_LANGS.map((lang) => {
            const voice = voices.find((v) => v.lang === lang);
            const addressOptions = CUSTOMER_ADDRESSES[lang].map((value) => ({
              value,
              label: t(`voice.addresses.${value}`),
            }));
            return (
              <KbCard key={lang} id={`voice-${lang}`} title={t(`lang.${lang}`)}>
                <form action={saveBrandVoiceAction} className="space-y-space-md">
                  <input type="hidden" name="lang" value={lang} />
                  <VoiceBlock
                    index={t('voice.blocks.persona.index')}
                    title={t('voice.blocks.persona.title')}
                    subtitle={t('voice.blocks.persona.subtitle')}
                    icon="badge"
                  >
                    <div className="grid gap-space-md md:grid-cols-3">
                      <SelectField
                        label={t('voice.shopPronoun')}
                        name="shopPronoun"
                        defaultValue={voice?.shopPronoun ?? DEFAULT_PRONOUN[lang]}
                        options={pronounOptions}
                      />
                      <Field
                        label={t('voice.shopPronounCustom')}
                        name="shopPronounCustom"
                        defaultValue={voice?.shopPronounCustom}
                        maxLength={60}
                      />
                      <SelectField
                        label={t('voice.customerAddress')}
                        name="customerAddress"
                        defaultValue={voice?.customerAddress ?? CUSTOMER_ADDRESSES[lang][0]}
                        options={addressOptions}
                      />
                    </div>
                    <label className="flex items-center gap-2 font-body-md text-body-md text-on-surface">
                      <input
                        type="checkbox"
                        name="addressByName"
                        defaultChecked={voice?.addressByName ?? false}
                      />
                      {t('voice.addressByName')}
                    </label>
                  </VoiceBlock>
                  <VoiceBlock
                    index={t('voice.blocks.tone.index')}
                    title={t('voice.blocks.tone.title')}
                    subtitle={t('voice.blocks.tone.subtitle')}
                    icon="tune"
                  >
                    <Field
                      label={t('voice.tone')}
                      name="tone"
                      defaultValue={voice?.tone}
                      maxLength={500}
                    />
                    <VoiceOffControls
                      title={t('voice.blocks.tone.length')}
                      options={[
                        t('voice.blocks.tone.short'),
                        t('voice.blocks.tone.balanced'),
                        t('voice.blocks.tone.detailed'),
                      ]}
                      note={t('voice.blocks.soon')}
                    />
                    <VoiceOffControls
                      title={t('voice.blocks.tone.emoji')}
                      options={[
                        t('voice.blocks.tone.emojiNone'),
                        t('voice.blocks.tone.emojiSome'),
                        t('voice.blocks.tone.emojiMany'),
                      ]}
                      note={t('voice.blocks.soon')}
                    />
                  </VoiceBlock>
                  <VoiceBlock
                    index={t('voice.blocks.opening.index')}
                    title={t('voice.blocks.opening.title')}
                    subtitle={t('voice.blocks.opening.subtitle')}
                    icon="chat_bubble"
                  >
                    <div className="grid gap-space-md md:grid-cols-2">
                      <Field
                        label={t('voice.greeting')}
                        name="greeting"
                        defaultValue={voice?.greeting}
                        maxLength={500}
                      />
                      <Field
                        label={t('voice.signOff')}
                        name="signOff"
                        defaultValue={voice?.signOff}
                        maxLength={500}
                      />
                    </div>
                  </VoiceBlock>
                  <div className="grid gap-space-md md:grid-cols-2">
                    <Field
                      label={t('voice.doRules')}
                      name="doRules"
                      rows={4}
                      defaultValue={voice?.doRules.join('\n')}
                      hint={t('voice.rulesHint')}
                    />
                    <Field
                      label={t('voice.dontRules')}
                      name="dontRules"
                      rows={4}
                      defaultValue={voice?.dontRules.join('\n')}
                      hint={t('voice.rulesHint')}
                    />
                  </div>
                  <fieldset className="space-y-space-sm rounded-lg bg-surface-container-low p-space-md">
                    <legend className="px-1 font-title-sm text-title-sm text-on-surface">
                      {t('voice.handoffTitle')}
                    </legend>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {t('voice.handoffHint')}
                    </p>
                    {HANDOFF_TOPICS.map((topic) => (
                      <div
                        key={topic}
                        className="grid gap-space-sm md:grid-cols-[10rem_1fr_1fr] md:items-start"
                      >
                        <span className="pt-2 font-title-sm text-title-sm text-on-surface">
                          {t(`voice.topics.${topic}`)}
                        </span>
                        <Field
                          label={t('voice.inHours')}
                          name={`handoff.${topic}.inHours`}
                          rows={2}
                          defaultValue={voice?.handoffTemplates[topic]?.inHours}
                          maxLength={1000}
                        />
                        <Field
                          label={t('voice.outHours')}
                          name={`handoff.${topic}.outHours`}
                          rows={2}
                          defaultValue={voice?.handoffTemplates[topic]?.outHours}
                          maxLength={1000}
                        />
                      </div>
                    ))}
                  </fieldset>
                  <div className="flex justify-end">
                    <SaveButton>{t('voice.saveFor', { lang: t(`lang.${lang}`) })}</SaveButton>
                  </div>
                </form>
              </KbCard>
            );
          })}
        </div>
      </KbFrame>
    </main>
  );
}

import { getAutomationSettings, listBrandVoices } from '@flow/db/runtime';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { KbPageHead } from '../../../../../components/kb/kb-content-ui';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { Icon, type IconName } from '../../../../../components/ui/icon';
import { getBrand } from '../../../../../server/brand';
import { getDb } from '../../../../../server/db';
import { requireAppUser } from '../../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('kbContent');
  return { title: `${t('rules.title')} · ${getBrand().name}` };
}

/** Ba cách báo giá của thiết kế (chưa có nơi lưu → hiện tắt). */
const PRICE_MODES = ['direct', 'private', 'perPost'] as const;

const CHIP =
  'inline-flex px-2.5 py-1 rounded-full bg-surface-container-low text-on-surface font-body-sm text-body-sm break-words';
const OFF_OPTION =
  'rounded-lg bg-surface-container-low p-space-md text-on-surface-variant opacity-60 cursor-not-allowed';
const LINK =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-title-sm text-title-sm hover:bg-surface-container';

function Block({
  id,
  icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm space-y-space-md"
    >
      <div className="flex items-start gap-2">
        <span className="w-8 h-8 shrink-0 rounded-lg bg-primary-container text-on-primary flex items-center justify-center">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <h2 id={id} className="font-title-md text-title-md text-on-surface">
            {title}
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Quy tắc trả lời & Giới hạn (KB-RULES): chỉ Owner; trang CHỈ ĐỌC gom các giới hạn ĐANG ÁP DỤNG ở một chỗ, dữ liệu THẬT từ nơi đã lưu chúng — "không được" của Giọng văn,
 * từ khóa chặn tự gửi của Cài đặt tự gửi, câu mời chuyển người của Giọng văn, ghi nhận dữ liệu còn thiếu. Không có bảng/migration mới (Q-KB-RULES). Phần thiết kế cần lưu trữ mới
 * (cách báo giá theo kênh, câu ứng xử riêng khi không biết) là mục tắt "Sắp có", không số mẫu.
 */
export default async function KbRulesPage() {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const t = await getTranslations('kbContent');
  const [voices, automation] = await getDb().withActor(workspace.id, user.id, async (tx) => [
    await listBrandVoices(tx, workspace.id),
    await getAutomationSettings(tx, workspace.id),
  ]);
  const keywords = automation?.blockedKeywords ?? [];

  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbRules">
        <div className="tw space-y-space-lg">
          <KbPageHead title={t('rules.title')} subtitle={t('rules.subtitle')} />

          <Block
            id="rules-price"
            icon="sell"
            title={t('rules.price.title')}
            subtitle={t('rules.price.subtitle')}
          >
            <p className="font-body-md text-body-md text-on-surface">{t('rules.price.fixed')}</p>
            <div className="grid gap-space-sm md:grid-cols-3" aria-disabled="true">
              {PRICE_MODES.map((mode) => (
                <div key={mode} className={OFF_OPTION}>
                  <div className="font-title-sm text-title-sm">{t(`rules.price.${mode}`)}</div>
                  <div className="font-label-sm text-label-sm">{t('rules.soon')}</div>
                </div>
              ))}
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('rules.price.perChannel')}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('rules.price.autoLink')}
            </p>
            <Link href="/app/automation" className={LINK}>
              {t('rules.edit')}
            </Link>
          </Block>

          <Block
            id="rules-topics"
            icon="block"
            title={t('rules.topics.title')}
            subtitle={t('rules.topics.subtitle')}
          >
            {voices.map((voice) => (
              <div key={voice.lang} className="space-y-space-xs">
                <h3 className="font-title-sm text-title-sm text-on-surface">
                  {t(`lang.${voice.lang}`)}
                </h3>
                {voice.dontRules.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {t('rules.topics.empty')}
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {voice.dontRules.map((rule) => (
                      <li key={rule} className={CHIP}>
                        {rule}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {voices.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('rules.topics.empty')}
              </p>
            ) : null}
            <Link href="/app/kb/voice" className={LINK}>
              {t('rules.edit')}
            </Link>
          </Block>

          <Block
            id="rules-keywords"
            icon="support_agent"
            title={t('rules.keywords.title')}
            subtitle={t('rules.keywords.subtitle')}
          >
            {keywords.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('rules.keywords.empty')}
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <li key={keyword} className={CHIP}>
                    {keyword}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/app/automation" className={LINK}>
              {t('rules.edit')}
            </Link>
            <h3 className="font-title-sm text-title-sm text-on-surface">
              {t('rules.keywords.handoff')}
            </h3>
            {voices.map((voice) => {
              const count = Object.values(voice.handoffTemplates).filter(
                (tpl) => tpl.inHours.trim() !== '' || tpl.outHours.trim() !== '',
              ).length;
              return (
                <p key={voice.lang} className="font-body-sm text-body-sm text-on-surface-variant">
                  {t(`lang.${voice.lang}`)}:{' '}
                  {count === 0
                    ? t('rules.keywords.handoffEmpty')
                    : t('rules.keywords.handoffCount', { count })}
                </p>
              );
            })}
            <Link href="/app/kb/voice" className={LINK}>
              {t('rules.edit')}
            </Link>
          </Block>

          <Block
            id="rules-missing"
            icon="psychology"
            title={t('rules.missing.title')}
            subtitle={t('rules.missing.subtitle')}
          >
            <p className="font-body-md text-body-md text-on-surface">{t('rules.missing.gaps')}</p>
            <Link href="/app/kb-gaps" className={LINK}>
              {t('rules.missing.gapsLink')}
            </Link>
            <div className={OFF_OPTION} aria-disabled="true">
              <div className="font-title-sm text-title-sm">{t('rules.missing.custom')}</div>
              <div className="font-label-sm text-label-sm">{t('rules.missing.customHint')}</div>
            </div>
          </Block>

          <Link href="/app/try-ai" className={`${LINK} w-fit`}>
            <Icon name="science" size={16} />
            <span>
              {t('rules.tryAi')}
              <span className="block font-body-sm text-body-sm text-on-surface-variant">
                {t('rules.tryAiHint')}
              </span>
            </span>
          </Link>
        </div>
      </KbFrame>
    </main>
  );
}

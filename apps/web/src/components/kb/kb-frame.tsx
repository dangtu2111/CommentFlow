import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { NavItemKey } from '../../lib/app-nav';
import { KB_HOME, KB_SOON_ITEMS, KB_SUBNAV_GROUPS } from '../../lib/kb-structure';
import type { IconName } from '../ui/icon';
import { KbFrameView } from './kb-frame-view';

export type KbActive = NavItemKey;

const TEST_HREF = '/app/kb-testset';
const PUBLISH_HREF = '/app/kb-publish';
const READINESS_HREF = '/app/readiness';

/** Độ đầy đủ kiến thức THẬT (từ `loadReadiness`); không truyền thì thanh lệnh chỉ có tiêu đề + lối tắt. */
export type KbCompleteness = { score: number; ready: boolean; minPercent: number };

/** Biểu tượng của từng mục rail (Material Symbols, lấy theo design/stitch/knowledge-base.html). */
export const KB_RAIL_ICONS: Partial<Record<NavItemKey, IconName>> = {
  kb: 'menu_book',
  productImport: 'inventory_2',
  kbGaps: 'quiz',
  readiness: 'verified',
  tryAi: 'science',
  kbTestset: 'flaky',
  kbPublish: 'history_edu',
  kbShop: 'storefront',
  kbPolicies: 'policy',
  kbFaq: 'quiz',
  kbVoice: 'record_voice_over',
};

/** Biểu tượng của mục "Sắp có" ở rail. */
const KB_SOON_ICONS = {
  kbDocs: 'description',
  kbRules: 'rule',
  kbDictionary: 'spellcheck',
} as const satisfies Record<string, IconName>;

/**
 * Khung trang Cơ sở kiến thức: thanh lệnh (tiêu đề, độ đầy đủ, lối tắt Kiểm thử/Xuất bản), rail "Cấu trúc tri thức /
 * Tinh chỉnh" bên trái, nội dung bên phải. Chỉ điều hướng tới trang đã có (`kb-structure.ts`); trang con giữ nguyên
 * nội dung và quyền riêng của nó (Owner). Phần trình bày ở `KbFrameView` (dùng chung với route dev mẫu).
 */
export async function KbFrame({
  active,
  completeness,
  children,
}: {
  active: KbActive;
  completeness?: KbCompleteness;
  children: ReactNode;
}) {
  const [t, tn] = await Promise.all([getTranslations('kb'), getTranslations('shell.nav')]);
  return (
    <KbFrameView
      title={t('title')}
      scope={{ label: t('scope.label'), value: t('scope.value') }}
      diff={{ label: t('actions.diff') }}
      test={{ label: t('actions.test'), href: TEST_HREF }}
      publish={{ label: t('actions.publish'), href: PUBLISH_HREF }}
      soon={t('soon')}
      {...(completeness
        ? {
            completeness: {
              label: t('completeness'),
              score: completeness.score,
              aria: t('completenessAria', { score: completeness.score }),
              hint: completeness.ready
                ? t('completenessReady')
                : t('completenessNotReady', { min: completeness.minPercent }),
              detailLabel: t('completenessDetail'),
              detailHref: READINESS_HREF,
            },
          }
        : {})}
      rail={{
        label: t('navLabel'),
        lead: {
          ...KB_HOME,
          label: t('overview'),
          current: active === KB_HOME.key,
          ...(KB_RAIL_ICONS[KB_HOME.key] ? { icon: KB_RAIL_ICONS[KB_HOME.key] as IconName } : {}),
        },
        groups: KB_SUBNAV_GROUPS.map((group) => ({
          key: group.key,
          title: t(`groups.${group.key}`),
          items: [
            ...group.items.map((item) => ({
              key: item.key,
              href: item.href,
              label: tn(item.key),
              current: active === item.key,
              ...(KB_RAIL_ICONS[item.key] ? { icon: KB_RAIL_ICONS[item.key] as IconName } : {}),
            })),
            ...KB_SOON_ITEMS.filter((soon) => soon.group === group.key).map((soon) => ({
              key: soon.key,
              href: '#',
              label: t(`soonItems.${soon.key}`),
              current: false,
              disabled: true,
              icon: KB_SOON_ICONS[soon.key],
            })),
          ],
        })),
      }}
    >
      {children}
    </KbFrameView>
  );
}

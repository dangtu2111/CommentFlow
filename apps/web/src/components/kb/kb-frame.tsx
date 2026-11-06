import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { NavItemKey } from '../../lib/app-nav';
import { KB_HOME, KB_SUBNAV_GROUPS } from '../../lib/kb-structure';
import { buttonClass } from '../ui/button';
import { RailNav } from '../ui/rail-nav';

export type KbActive = NavItemKey;

/** Độ đầy đủ kiến thức THẬT (từ `loadReadiness`); không truyền thì thanh lệnh chỉ có tiêu đề + lối tắt. */
export type KbCompleteness = { score: number; ready: boolean; minPercent: number };

/**
 * Khung trang Cơ sở kiến thức (design/stitch/knowledge-base.html): thanh lệnh phía trên (tiêu đề, độ đầy đủ,
 * lối tắt Kiểm thử/Xuất bản), cột rail "Cấu trúc tri thức / Tinh chỉnh" bên trái, nội dung bên phải. Chỉ điều
 * hướng tới trang đã có (`kb-structure.ts`); trang con giữ nguyên nội dung và quyền riêng của nó (Owner).
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
    <div className="kb-frame">
      <header className="kb-bar">
        <div className="kb-bar-row">
          <p className="kb-bar-title">{t('title')}</p>
          <div className="kb-bar-actions">
            <Link href="/app/kb-testset" className={buttonClass({ variant: 'secondary' })}>
              {t('actions.test')}
            </Link>
            <Link href="/app/kb-publish" className={buttonClass({ variant: 'primary' })}>
              {t('actions.publish')}
            </Link>
          </div>
        </div>
        {completeness ? (
          <div className="kb-complete">
            <span className="kb-complete-label">
              {t('completeness')}: <strong>{completeness.score}%</strong>
            </span>
            <progress
              value={completeness.score}
              max={100}
              aria-label={t('completenessAria', { score: completeness.score })}
            >
              {completeness.score}%
            </progress>
            <span className="kb-complete-hint">
              {completeness.ready
                ? t('completenessReady')
                : t('completenessNotReady', { min: completeness.minPercent })}
            </span>
            <Link href="/app/readiness" className="kb-complete-link">
              {t('completenessDetail')}
            </Link>
          </div>
        ) : null}
      </header>
      <div className="kb-layout">
        <RailNav
          label={t('navLabel')}
          lead={{
            ...KB_HOME,
            label: t('overview'),
            current: active === KB_HOME.key,
          }}
          groups={KB_SUBNAV_GROUPS.map((group) => ({
            key: group.key,
            title: t(`groups.${group.key}`),
            items: group.items.map((item) => ({
              key: item.key,
              href: item.href,
              label: tn(item.key),
              current: active === item.key,
            })),
          }))}
        />
        <div className="kb-content">{children}</div>
      </div>
    </div>
  );
}

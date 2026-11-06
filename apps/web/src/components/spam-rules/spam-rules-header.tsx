import { ArrowRight, BarChart3, History, ShieldCheck, ShieldPlus, ShieldUser } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { buttonClass } from '../ui/button';
import { Card } from '../ui/card';
import { Chip } from '../ui/chip';
import { Breadcrumb, PageHeader } from '../ui/page-header';
import { RICH_BOLD } from '../ui/rich';

/**
 * Đầu trang Quy tắc spam (design/stitch/spam-rules.html): đường dẫn + hai viên thống kê nhanh, tiêu đề có ô biểu tượng
 * và huy hiệu, hai nút (kiểm tra 7 ngày / tạo quy tắc — cả hai nhảy tới trình thiết lập), khối nguyên tắc an toàn.
 * `activeRules`/`filtered7d` null = chưa có số liệu thật → "—".
 */
export async function SpamRulesHeader({
  activeRules,
  filtered7d,
}: {
  activeRules: number | null;
  filtered7d: number | null;
}) {
  const t = await getTranslations('spamRules');
  const autoHideSoon = t.rich('principle.autoHideSoon', RICH_BOLD);
  return (
    <>
      <div className="spam-crumb-row">
        <Breadcrumb
          label={t('header.crumbLabel')}
          root={t('header.crumbRoot')}
          current={t('header.crumbCurrent')}
        />
        <div className="spam-pills">
          <Chip tone="muted">
            <ShieldCheck size={12} aria-hidden="true" />
            {activeRules === null ? '—' : t('header.pillActive', { count: activeRules })}
          </Chip>
          <Chip tone="muted">
            <History size={12} aria-hidden="true" />
            {filtered7d === null ? '—' : t('header.pillFiltered', { count: filtered7d })}
          </Chip>
        </div>
      </div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<ShieldUser size={24} />}
        badge={
          <Chip tone="info" className="spam-badge">
            <ShieldCheck size={12} aria-hidden="true" />
            {t('header.badge')}
          </Chip>
        }
        actions={
          <>
            <a href="#spam-builder" className={buttonClass({ variant: 'secondary' })}>
              <BarChart3 size={16} aria-hidden="true" />
              {t('header.dryRun')}
            </a>
            <a href="#spam-builder" className={buttonClass({ variant: 'primary' })}>
              <ShieldPlus size={16} aria-hidden="true" />
              {t('header.create')}
            </a>
          </>
        }
      />
      <Card className="spam-principle">
        <span className="spam-principle-icon" aria-hidden="true">
          <ShieldCheck size={18} />
        </span>
        <div className="spam-principle-text">
          <p className="spam-principle-title">
            <strong>{t('principle.title')}</strong>
            <Chip tone="warm" className="spam-zero">
              {t('principle.zero')}
            </Chip>
          </p>
          <p className="muted">{t('principle.body')}</p>
          <p className="muted">{autoHideSoon}</p>
        </div>
        <span className="spam-principle-link" aria-disabled="true" title={t('soonTitle')}>
          {t('principle.learn')}
          <ArrowRight size={12} aria-hidden="true" />
        </span>
      </Card>
    </>
  );
}

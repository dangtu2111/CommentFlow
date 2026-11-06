import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LEAD_DRAWER_SAMPLE } from '../../lib/leads-sample';
import { Icon } from '../ui/icon';
import { Badge, SoonButton } from '../ui/tw-parts';

const DASH = '—';
const DOT = {
  secondary: 'bg-secondary',
  'primary-container': 'bg-primary-container',
  primary: 'bg-primary',
} as const;

const QUICK_ACTIONS = [
  { icon: 'phone_in_talk', label: 'ui.drawer.callNow', variant: 'primary' },
  { icon: 'chat', label: 'ui.drawer.message', variant: 'neutral' },
  { icon: 'copy_all', label: 'ui.drawer.copyAll', variant: 'neutral' },
] as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="font-label-md text-label-md text-on-surface-variant">{label}</span>
      {children}
    </div>
  );
}

/**
 * Ngăn chi tiết khách bên phải (design/stitch/leads.html). Bản đọc-chỉ chưa có chọn thẻ/giải mã SĐT nên toàn bộ ngăn
 * là KHUNG: có dữ liệu mẫu `[MẪU]` khi `sample`, còn lại hiện "—"; mọi nút vô hiệu "Sắp có".
 */
export async function LeadDrawer({ sample }: { sample: boolean }) {
  const t = await getTranslations('leads');
  const soon = t('ui.soon');
  const d = sample ? LEAD_DRAWER_SAMPLE : null;
  return (
    <aside
      aria-label={t('ui.drawer.label')}
      className="sticky top-20 col-span-12 space-y-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-lg xl:col-span-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container font-title-md text-title-md text-on-primary shadow-sm">
              {d?.initials ?? DASH}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary-container text-on-primary">
              <Icon name="check" size={10} />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                {d?.name ?? DASH}
              </h3>
              <span className="rounded bg-primary-container/10 px-2 py-0.5 font-label-sm text-label-sm font-semibold text-primary">
                {t('ui.drawer.lead', { code: d?.code ?? DASH })}
              </span>
              {d ? <Badge tone="neutral">{t('ui.sampleTag')}</Badge> : null}
            </div>
            <p className="flex items-center gap-1 font-label-md text-label-md text-on-surface-variant">
              <Icon name="schedule" size={12} />
              {t('ui.drawer.created', { time: d?.created ?? DASH })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <SoonButton variant="icon" soon={soon} label={t('ui.drawer.expand')} className="p-1">
            <Icon name="open_in_full" size={18} />
          </SoonButton>
          <SoonButton variant="icon" soon={soon} label={t('ui.drawer.close')} className="p-1">
            <Icon name="close" size={18} />
          </SoonButton>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low p-2.5">
        <span className="font-label-md text-label-md font-medium text-on-surface-variant">
          {t('ui.drawer.status')}
        </span>
        <div className="relative max-w-[200px] flex-1">
          <select
            disabled
            title={soon}
            aria-label={t('ui.drawer.status')}
            className="w-full cursor-not-allowed rounded-lg bg-surface-container-lowest px-3 py-1.5 font-title-sm text-title-sm text-on-surface opacity-70 shadow-sm"
          >
            <option>{t('stages.new')}</option>
            <option>{t('stages.contacted')}</option>
            <option>{t('stages.won')}</option>
            <option>{t('stages.lost')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {QUICK_ACTIONS.map((action) => (
          <SoonButton
            key={action.label}
            variant={action.variant}
            soon={soon}
            className="flex-col gap-1 px-2.5 py-2 text-center"
          >
            <Icon name={action.icon} size={16} />
            <span className="leading-none">{t(action.label)}</span>
          </SoonButton>
        ))}
      </div>

      <div className="space-y-space-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-title-sm text-title-sm font-semibold text-on-surface">
            <span className="text-secondary">
              <Icon name="psychology" size={16} />
            </span>
            {t('ui.drawer.extracted')}
          </span>
          <Badge tone="secondary">
            <Icon name="verified" size={12} />
            {t('ui.drawer.confidence', { pct: d?.confidence ?? DASH })}
          </Badge>
        </div>
        <div className="space-y-2 rounded-xl bg-surface-container-low/70 p-3 font-body-sm text-body-sm">
          <Row label={t('ui.drawer.fullName')}>
            <span className="font-title-sm text-title-sm font-medium text-on-surface">
              {d?.name ?? DASH}
            </span>
          </Row>
          <Row label={t('ui.drawer.phone')}>
            <div className="flex items-center gap-1.5">
              <span className="font-title-sm text-title-sm font-bold tracking-wide text-primary">
                {d?.phone ?? DASH}
              </span>
              <Badge variant="box" tone="neutral">
                {t('ui.drawer.secured')}
              </Badge>
            </div>
          </Row>
          <div className="flex items-start justify-between gap-4 py-1">
            <span className="shrink-0 font-label-md text-label-md text-on-surface-variant">
              {t('ui.drawer.address')}
            </span>
            <span className="text-right font-body-sm text-body-sm font-medium text-on-surface">
              {d?.address ?? DASH}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2 py-1">
            <span className="shrink-0 font-label-md text-label-md text-on-surface-variant">
              {t('ui.drawer.product')}
            </span>
            <div className="text-right">
              <div className="font-title-sm text-title-sm font-semibold text-on-surface">
                {d?.product ?? DASH}
              </div>
              <div className="font-label-sm text-label-sm text-on-surface-variant">
                {t('ui.drawer.sku')} <strong>{d?.sku ?? DASH}</strong> • {d?.variant ?? DASH}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between py-1 pt-2">
            <span className="font-label-md text-label-md text-on-surface-variant">
              {t('ui.drawer.value')}
            </span>
            <div className="text-right font-title-sm text-title-sm">
              <span className="text-base font-bold text-primary">{d?.value ?? DASH}</span>
              <span className="text-xs font-normal text-on-surface-variant">
                {' '}
                ({d?.ship ?? DASH})
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-title-sm text-title-sm font-semibold text-on-surface">
            <span className="text-primary">
              <Icon name="chat_bubble" size={16} />
            </span>
            {t('ui.drawer.context')}
          </span>
          <Badge variant="box" tone="primary">
            <Icon name="visibility_off" size={12} />
            {t('ui.drawer.hiddenAt', { time: d?.hiddenAt ?? DASH })}
          </Badge>
        </div>
        <div className="relative space-y-2 overflow-hidden rounded-xl bg-surface-container-low p-3">
          <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
            <span className="flex items-center gap-1 font-medium text-on-surface">
              <span className="text-primary">
                <Icon name="feed" size={12} />
              </span>
              {t('ui.drawer.post', { post: d?.post ?? DASH })}
            </span>
            <span>{d?.page ?? DASH}</span>
          </div>
          <blockquote className="relative rounded-lg bg-surface-container-lowest p-2.5 font-body-sm text-body-sm italic text-on-surface shadow-sm">
            {d ? (
              <>
                “{d.quoteBefore}{' '}
                <mark className="rounded bg-secondary-fixed px-1 font-semibold text-on-secondary-fixed">
                  {d.quotePhone}
                </mark>
                ”
              </>
            ) : (
              DASH
            )}
          </blockquote>
          <div className="flex items-center justify-between pt-1">
            <span className="flex items-center gap-1 font-label-sm text-label-sm text-primary">
              <Icon name="security" size={12} />
              {t('ui.drawer.protect')}
            </span>
            <SoonButton variant="link" soon={soon} className="gap-0.5 font-medium">
              <span>{t('ui.drawer.viewPost')}</span>
              <Icon name="open_in_new" size={12} />
            </SoonButton>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <span className="flex items-center gap-1.5 font-title-sm text-title-sm font-semibold text-on-surface">
          <Icon name="history" size={16} />
          {t('ui.drawer.history')}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            disabled
            title={soon}
            placeholder={t('ui.drawer.notePlaceholder')}
            aria-label={t('ui.drawer.notePlaceholder')}
            className="flex-1 cursor-not-allowed rounded-lg bg-surface-container-low px-3 py-1.5 font-body-sm text-body-sm text-on-surface opacity-70"
          />
          <SoonButton variant="neutral" soon={soon} className="px-3 py-1.5 shadow-none">
            {t('ui.drawer.save')}
          </SoonButton>
        </div>
        <div className="space-y-2 pt-1 font-label-sm text-label-sm">
          {d ? (
            d.timeline.map((item) => (
              <div key={item.at} className="flex items-start gap-2 text-on-surface-variant">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[item.tone]}`} />
                <div className="flex-1">
                  <span className="font-medium text-on-surface">{item.at}</span> — {item.text}
                </div>
              </div>
            ))
          ) : (
            <p className="text-on-surface-variant">{t('ui.drawer.noHistory')}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <SoonButton variant="neutral" soon={soon} className="gap-1 text-error shadow-none">
          <Icon name="delete" size={16} />
          <span>{t('ui.drawer.cancel')}</span>
        </SoonButton>
        <SoonButton variant="primary" soon={soon} className="flex-1">
          <Icon name="check_circle" size={16} />
          <span>{t('ui.drawer.markWon')}</span>
        </SoonButton>
      </div>
    </aside>
  );
}

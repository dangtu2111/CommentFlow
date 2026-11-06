import { getTranslations } from 'next-intl/server';
import type { SampleRule, SampleRuleBadge } from '../../lib/spam-rules-sample';
import { Icon, type IconName } from '../ui/icon';
import { Toggle } from '../ui/tw-form';
import { Panel } from '../ui/tw-parts';

const RULE_ICON: Record<SampleRule['icon'], { name: IconName; box: string }> = {
  phone: { name: 'phone_iphone', box: 'bg-secondary-fixed text-on-secondary-fixed' },
  link: { name: 'link_off', box: 'bg-surface-container-high text-primary-container' },
  face: { name: 'sentiment_very_dissatisfied', box: 'bg-tertiary-fixed text-on-tertiary-fixed' },
  flaky: { name: 'flaky', box: 'bg-surface-container-high text-on-surface-variant' },
};
const BADGE_ICON: Record<Exclude<SampleRuleBadge['icon'], 'none'>, IconName> = {
  shield: 'shield',
  sync: 'sync_saved_locally',
  hand: 'pan_tool',
  flask: 'science',
};
const BADGE_TONE: Record<SampleRuleBadge['tone'], string> = {
  solid: 'bg-primary-container text-on-primary font-semibold px-2.5 py-0.5',
  accent: 'bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5',
  warm: 'bg-tertiary-fixed text-on-tertiary-fixed font-semibold px-2.5 py-0.5',
  muted: 'bg-surface-container-high text-on-surface font-semibold px-2.5 py-0.5',
  neutral: 'bg-surface-container-low text-on-surface-variant px-2 py-0.5',
};
/** Màu số "khớp" và "tỷ lệ sai" theo loại quy tắc (Stitch: xanh an toàn / cam cần duyệt / đỏ cần tinh chỉnh). */
const STAT_TONE: Record<SampleRule['icon'], { matches: string; falseRate: string }> = {
  phone: { matches: 'font-bold text-primary', falseRate: 'font-semibold text-primary' },
  link: { matches: 'font-bold text-primary', falseRate: 'font-semibold text-primary' },
  face: { matches: 'font-bold text-tertiary', falseRate: 'font-semibold text-tertiary' },
  flaky: { matches: 'font-bold text-on-surface', falseRate: 'font-semibold text-error' },
};

const ICON_BUTTON =
  'flex cursor-not-allowed items-center justify-center rounded-lg bg-surface-container-low p-2 text-on-surface opacity-70';

/**
 * Danh sách quy tắc (design/stitch/spam-rules.html "Rule Card"). Chưa có UI đọc bảng `rules` nên `rules` chỉ là
 * DỮ LIỆU MẪU `[MẪU]` ở bản dev; không có quy tắc → trạng thái trống. Công tắc, sửa, nhật ký đều vô hiệu ("Sắp có").
 */
export async function SpamRuleList({ rules }: { rules: readonly SampleRule[] }) {
  const t = await getTranslations('spamRules');
  if (rules.length === 0) {
    return (
      <Panel size="lg" className="flex flex-col items-center gap-1 text-center">
        <span className="text-primary-container">
          <Icon name="shield" size={28} />
        </span>
        <p className="font-title-md text-title-md text-on-surface">{t('rules.empty')}</p>
        <p className="font-body-md text-body-md text-on-surface-variant">{t('rules.emptyBody')}</p>
      </Panel>
    );
  }
  return (
    <ul aria-label={t('rules.label')} className="space-y-space-md">
      {rules.map((rule) => {
        const icon = RULE_ICON[rule.icon];
        const stat = STAT_TONE[rule.icon];
        const secondLabel =
          rule.secondAction === 'history' ? t('rules.history') : t('rules.simulation');
        return (
          <li key={rule.id}>
            <Panel
              size="lg"
              className="flex flex-col justify-between gap-space-md transition-all hover:shadow-md lg:flex-row lg:items-center"
            >
              <div className="flex flex-1 items-start gap-space-md">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg shadow-sm ${icon.box}`}
                >
                  <Icon name={icon.name} size={22} />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-title-md text-title-md font-bold text-on-surface">
                      {rule.name}
                    </h2>
                    {rule.badges.map((badge) => (
                      <span
                        key={badge.text}
                        className={`inline-flex items-center gap-1 rounded-full font-label-sm text-label-sm ${BADGE_TONE[badge.tone]}`}
                      >
                        {badge.icon === 'none' ? null : (
                          <Icon name={BADGE_ICON[badge.icon]} size={12} />
                        )}
                        {badge.text}
                      </span>
                    ))}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <span className="text-primary-container">
                        <Icon name="rule" size={14} />
                      </span>
                      <span>
                        {t('rules.condition')} <strong>{rule.conditionStrong}</strong>
                        {rule.conditionRest}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-outline">
                        <Icon name="language" size={14} />
                      </span>
                      <span>
                        {t('rules.scope')} <strong>{rule.scopeStrong}</strong>
                        {rule.scopeRest}
                      </span>
                    </span>
                  </p>
                  <p className="flex flex-wrap items-center gap-space-lg pt-1 font-label-sm text-label-sm text-on-surface">
                    <span className="flex items-center gap-1.5">
                      <span className="text-on-surface-variant">
                        {rule.matchesLabel === 'matches'
                          ? t('rules.matches', { days: 30 })
                          : t('rules.matchesSimulated')}
                      </span>
                      <span className={stat.matches}>
                        {t('rules.matchCount', { count: rule.matches })}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-on-surface-variant">{t('rules.falseRate')}</span>
                      <span className={stat.falseRate}>{rule.falseRate}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-on-surface-variant">{rule.extraLabel}</span>
                      <span>{rule.extraValue}</span>
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-space-md pt-space-xs lg:pt-0">
                <span className="flex items-center gap-2" title={t('soonTitle')}>
                  <Toggle defaultChecked disabled label={t('rules.on')} />
                  <span className="font-label-sm text-label-sm font-semibold text-on-surface">
                    {t('rules.on')}
                  </span>
                </span>
                <div className="hidden h-6 w-px bg-surface-container-high sm:block" />
                <button
                  type="button"
                  aria-disabled="true"
                  tabIndex={-1}
                  title={t('rules.edit')}
                  aria-label={t('rules.edit')}
                  className={ICON_BUTTON}
                >
                  <Icon name="edit" size={18} />
                </button>
                <button
                  type="button"
                  aria-disabled="true"
                  tabIndex={-1}
                  title={secondLabel}
                  aria-label={secondLabel}
                  className={ICON_BUTTON}
                >
                  <Icon
                    name={rule.secondAction === 'history' ? 'history' : 'visibility'}
                    size={18}
                  />
                </button>
              </div>
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}

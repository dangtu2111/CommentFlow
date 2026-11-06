import {
  Eye,
  FlaskConical,
  Globe,
  Hand,
  History,
  Link2Off,
  Pencil,
  RefreshCw,
  Ruler,
  Scale,
  Shield,
  ShieldCheck,
  Smartphone,
  SmilePlus,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { SampleRule, SampleRuleBadge } from '../../lib/spam-rules-sample';
import { Card } from '../ui/card';
import { Chip, type ChipTone } from '../ui/chip';
import { Switch } from '../ui/switch';

const RULE_ICON = { phone: Smartphone, link: Link2Off, face: SmilePlus, flaky: Scale } as const;
const BADGE_ICON = { shield: Shield, sync: RefreshCw, hand: Hand, flask: FlaskConical } as const;
const BADGE_TONE: Record<SampleRuleBadge['tone'], ChipTone> = {
  solid: 'solid',
  accent: 'accent',
  warm: 'warm',
  muted: 'muted',
  neutral: 'muted',
};

/**
 * Danh sách quy tắc (design/stitch/spam-rules.html "Rule Card"). Chưa có UI đọc bảng `rules` nên `rules` chỉ là
 * DỮ LIỆU MẪU `[MẪU]` ở bản dev; không có quy tắc → trạng thái trống. Công tắc, sửa, nhật ký đều vô hiệu ("Sắp có").
 */
export async function SpamRuleList({ rules }: { rules: readonly SampleRule[] }) {
  const t = await getTranslations('spamRules');
  const soon = { disabled: true, title: t('soonTitle') } as const;
  if (rules.length === 0) {
    return (
      <Card className="spam-empty">
        <ShieldCheck size={28} aria-hidden="true" />
        <p>
          <strong>{t('rules.empty')}</strong>
        </p>
        <p className="muted">{t('rules.emptyBody')}</p>
      </Card>
    );
  }
  return (
    <ul className="spam-rule-list" aria-label={t('rules.label')}>
      {rules.map((rule) => {
        const Icon = RULE_ICON[rule.icon];
        const SecondIcon = rule.secondAction === 'history' ? History : Eye;
        return (
          <li key={rule.id}>
            <Card className="spam-rule-card">
              <span className={`spam-rule-icon is-${rule.icon}`} aria-hidden="true">
                <Icon size={22} />
              </span>
              <div className="spam-rule-body">
                <div className="spam-rule-head">
                  <h2 className="spam-rule-title">{rule.name}</h2>
                  {rule.badges.map((badge) => {
                    const BadgeIcon = badge.icon === 'none' ? null : BADGE_ICON[badge.icon];
                    return (
                      <Chip
                        key={badge.text}
                        tone={BADGE_TONE[badge.tone]}
                        className="spam-rule-badge"
                      >
                        {BadgeIcon ? <BadgeIcon size={12} aria-hidden="true" /> : null}
                        {badge.text}
                      </Chip>
                    );
                  })}
                </div>
                <p className="spam-rule-meta">
                  <span>
                    <Ruler size={14} aria-hidden="true" />
                    <span>
                      {t('rules.condition')} <strong>{rule.conditionStrong}</strong>
                      {rule.conditionRest}
                    </span>
                  </span>
                  <span>
                    <Globe size={14} aria-hidden="true" />
                    <span>
                      {t('rules.scope')} <strong>{rule.scopeStrong}</strong>
                      {rule.scopeRest}
                    </span>
                  </span>
                </p>
                <p className="spam-rule-stats">
                  <span>
                    <span className="muted">
                      {rule.matchesLabel === 'matches'
                        ? t('rules.matches', { days: 30 })
                        : t('rules.matchesSimulated')}
                    </span>{' '}
                    <strong>{t('rules.matchCount', { count: rule.matches })}</strong>
                  </span>
                  <span>
                    <span className="muted">{t('rules.falseRate')}</span>{' '}
                    <strong>{rule.falseRate}</strong>
                  </span>
                  <span>
                    <span className="muted">{rule.extraLabel}</span> {rule.extraValue}
                  </span>
                </p>
              </div>
              <div className="spam-rule-actions">
                <Switch defaultChecked {...soon} label={t('rules.on')} />
                <button
                  type="button"
                  className="icon-button"
                  disabled
                  title={t('rules.edit')}
                  aria-label={t('rules.edit')}
                >
                  <Pencil size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled
                  title={
                    rule.secondAction === 'history' ? t('rules.history') : t('rules.simulation')
                  }
                  aria-label={
                    rule.secondAction === 'history' ? t('rules.history') : t('rules.simulation')
                  }
                >
                  <SecondIcon size={18} aria-hidden="true" />
                </button>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

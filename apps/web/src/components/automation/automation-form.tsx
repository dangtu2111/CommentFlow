import { AUTOMATION_MODES, DELAY_SECONDS_OPTIONS, MATRIX_LABELS, MATRIX_TARGETS } from '@flow/ai';
import type { InboxChannel } from '@flow/db/runtime';
import {
  Ban,
  CloudCheck,
  Eye,
  Gauge,
  LayoutGrid,
  Lock,
  MessagesSquare,
  ShieldCheck,
  Tag,
  Timer,
  Zap,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { saveAutomationAction } from '../../app/app/(guarded)/automation/actions';
import type { AutomationFormDefaults } from '../../lib/automation-form';
import { modeTone } from '../../lib/automation-ui';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Chip } from '../ui/chip';
import { Inset } from '../ui/inset';
import { PlatformBadge } from '../ui/platform-badge';
import { Progress } from '../ui/progress';
import { SectionHead } from '../ui/section-head';
import { Switch } from '../ui/switch';
import { KeywordChips } from './keyword-chips';
import { ThresholdSlider } from './threshold-slider';

const MATRIX_ID = 'automation-matrix-title';
const BEHAVIOR_ID = 'automation-behavior-title';
const GUARD_ID = 'automation-guard-title';
const DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

/** Nhãn mà AI không bao giờ tự gửi (hiện khóa "Không hỗ trợ"; không có trong form). */
const LOCKED_LABELS = ['complaint', 'spam'] as const;

const MODE_ICON = { auto: Zap, shadow: Eye, off: null } as const;

/**
 * Form Cài đặt tự gửi (FR-070 ma trận kênh × nhãn; FR-071 cài đặt chung), bố cục theo
 * design/stitch/automation.html: ma trận (mỗi đối tượng một bảng) → kiểu trả lời | ngưỡng an toàn → thanh lưu.
 * Chỉ Owner thấy (trang kiểm vai trò; action kiểm lại). Form HTML thuần gửi Server Action; chỉ thanh ngưỡng và ô
 * từ khóa có script phía client. Phần thiết kế chưa có chức năng (kiểu trả lời, báo giá công khai, khôi phục mặc
 * định) hiện vô hiệu kèm "Sắp có". `usedToday` null = chưa có số liệu thật.
 */
export async function AutomationForm({
  channels,
  defaults,
  usedToday,
}: {
  channels: InboxChannel[];
  defaults: AutomationFormDefaults;
  usedToday: number | null;
}) {
  const t = await getTranslations('automation');
  const modeOf = (channelId: string, target: string, label: string) =>
    defaults.rules.find(
      (r) => r.channelId === channelId && r.target === target && r.label === label,
    )?.mode ?? 'off';
  const soon = { disabled: true, title: t('soonTitle') } as const;
  const soonChip = <Chip tone="muted">{t('soon')}</Chip>;
  const used = usedToday ?? 0;
  const percentUsed = usedToday === null ? 0 : (used / Math.max(1, defaults.dailyCap)) * 100;

  return (
    <form action={saveAutomationAction} className="stack auto-form">
      <Card stack className="auto-card" aria-labelledby={MATRIX_ID}>
        <SectionHead
          id={MATRIX_ID}
          icon={<LayoutGrid size={22} aria-hidden="true" />}
          title={t('matrix.title')}
          description={t('matrix.body')}
          end={
            <ul className="auto-legend" aria-label={t('matrix.legend')}>
              {[...AUTOMATION_MODES].reverse().map((mode) => {
                const Icon = MODE_ICON[mode];
                return (
                  <li key={mode} className={`mode-pill mode-pill-${modeTone(mode)}`}>
                    {Icon ? <Icon size={12} aria-hidden="true" /> : null}
                    {mode === 'off' ? t('matrix.legendOff') : t(`mode.${mode}`)}
                  </li>
                );
              })}
            </ul>
          }
        />
        {channels.length === 0 ? <p className="muted">{t('matrix.empty')}</p> : null}
        {channels.length > 0
          ? MATRIX_TARGETS.map((target) => (
              <div key={target} id={`auto-matrix-${target}`} className="auto-matrix">
                <h3 className="auto-matrix-title">{t(`target.${target}`)}</h3>
                <div className="auto-table-wrap">
                  <table className="table auto-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('matrix.channel')}</th>
                        {MATRIX_LABELS.map((label) => (
                          <th key={label} scope="col">
                            {t(`labels.${label}`)}
                          </th>
                        ))}
                        {LOCKED_LABELS.map((label) => (
                          <th key={label} scope="col">
                            {t(`labels.${label}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map((channel) => (
                        <tr key={channel.id}>
                          <th scope="row">
                            <span className="auto-channel-name">
                              <PlatformBadge platform={channel.platform} />
                              {channel.name}
                            </span>
                          </th>
                          {MATRIX_LABELS.map((label) => {
                            const id = `mode-${channel.id}-${target}-${label}`;
                            const mode = modeOf(channel.id, target, label);
                            return (
                              <td key={label}>
                                <label className="visually-hidden" htmlFor={id}>
                                  {`${channel.name} · ${t(`labels.${label}`)} · ${t(`target.${target}`)}`}
                                </label>
                                <select
                                  id={id}
                                  name={`mode:${channel.id}:${target}:${label}`}
                                  defaultValue={mode}
                                  className={`input mode-select mode-pill-${modeTone(mode)}`}
                                >
                                  {AUTOMATION_MODES.map((m) => (
                                    <option key={m} value={m}>
                                      {t(`mode.${m}`)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          })}
                          {LOCKED_LABELS.map((label) => (
                            <td key={label}>
                              <Chip tone="locked">
                                <Lock size={12} aria-hidden="true" />
                                {t('matrix.unsupported')}
                              </Chip>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          : null}
        <p role="note" className="auto-note">
          <strong>{t('matrix.noteLead')}</strong> {t('matrix.complaintNote')}
        </p>
      </Card>

      <div className="auto-split">
        <Card stack className="auto-card auto-behavior" aria-labelledby={BEHAVIOR_ID}>
          <SectionHead
            id={BEHAVIOR_ID}
            icon={<MessagesSquare size={22} aria-hidden="true" />}
            title={t('behavior.title')}
            description={t('behavior.body')}
            end={soonChip}
          />
          <div className="auto-options" role="radiogroup" aria-label={t('behavior.title')}>
            <label className="auto-option is-selected">
              <input type="radio" defaultChecked {...soon} aria-disabled="true" />
              <span>
                <span className="auto-option-title">
                  {t('behavior.both')}
                  <Chip tone="accent">{t('behavior.recommended')}</Chip>
                </span>
                <span className="muted">{t('behavior.bothBody')}</span>
              </span>
            </label>
            <label className="auto-option">
              <input type="radio" {...soon} aria-disabled="true" />
              <span>
                <span className="auto-option-title">{t('behavior.publicOnly')}</span>
                <span className="muted">{t('behavior.publicOnlyBody')}</span>
              </span>
            </label>
            <label className="auto-option">
              <input type="radio" {...soon} aria-disabled="true" />
              <span>
                <span className="auto-option-title">{t('behavior.privateOnly')}</span>
                <span className="muted">
                  {t('behavior.privateOnlyBody')}{' '}
                  <em className="auto-quote">{t('behavior.privateOnlyQuote')}</em>
                </span>
              </span>
            </label>
          </div>
          <Inset title={t('behavior.price')} icon={<Tag size={18} aria-hidden="true" />}>
            <Switch defaultChecked {...soon} aria-label={t('behavior.price')} />
            <p className="muted">{t('behavior.priceBody')}</p>
          </Inset>
        </Card>

        <Card stack className="auto-card auto-guard" id="auto-guard" aria-labelledby={GUARD_ID}>
          <SectionHead
            id={GUARD_ID}
            icon={<ShieldCheck size={22} aria-hidden="true" />}
            title={t('guard.title')}
            description={t('guard.body')}
          />
          <Inset>
            <ThresholdSlider
              name="threshold"
              defaultValue={Number(defaults.thresholdPercent)}
              label={t('guard.threshold')}
            />
          </Inset>
          <div className="auto-guard-pair">
            <Inset title={t('guard.delay')} icon={<Timer size={18} aria-hidden="true" />}>
              <select
                name="delaySeconds"
                defaultValue={defaults.delaySeconds}
                className="input"
                aria-label={t('guard.delay')}
              >
                {DELAY_SECONDS_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {t(`general.delayOption.${seconds}`)}
                  </option>
                ))}
              </select>
              <small className="muted">{t('guard.delayHint')}</small>
            </Inset>
            <Inset title={t('guard.dailyCap')} icon={<Gauge size={18} aria-hidden="true" />}>
              <input
                name="dailyCap"
                type="number"
                min={1}
                max={1000}
                step={1}
                required
                defaultValue={defaults.dailyCap}
                className="input"
                aria-label={t('guard.dailyCap')}
              />
              <div className="auto-usage">
                <strong>
                  {t('guard.usage', { used: usedToday ?? '—', cap: defaults.dailyCap })}
                </strong>
                {usedToday === null ? null : (
                  <span className="auto-usage-left">
                    {t('guard.remaining', { left: Math.max(0, defaults.dailyCap - used) })}
                  </span>
                )}
              </div>
              <Progress thin label={t('guard.usageLabel')} segments={[{ percent: percentUsed }]} />
            </Inset>
          </div>
          <Inset
            title={t('guard.keywords')}
            icon={<Ban size={18} aria-hidden="true" />}
            className="auto-keywords"
          >
            <p className="muted">{t('guard.keywordsBody')}</p>
            <KeywordChips
              name="blockedKeywords"
              initial={defaults.keywordsText.split('\n').filter(Boolean)}
            />
            <small className="muted">{t('general.keywordsHint')}</small>
          </Inset>
          <Inset className="auto-signature">
            <input type="hidden" name="signatureToggle" value="1" />
            <div className="auto-signature-row">
              <span className="inset-title">{t('guard.signature')}</span>
              <Switch
                name="signatureEnabled"
                value="on"
                defaultChecked={defaults.signature !== ''}
                aria-label={t('guard.signature')}
              />
            </div>
            {defaults.signature ? (
              <p className="auto-signature-sample">{`"${defaults.signature}"`}</p>
            ) : null}
            <input
              name="signature"
              type="text"
              maxLength={120}
              defaultValue={defaults.signature}
              placeholder={t('guard.signaturePlaceholder')}
              className="input"
              aria-label={t('guard.signature')}
            />
            <small className="muted">{t('general.signatureHint')}</small>
          </Inset>
          <Inset title={t('general.hours')} className="auto-hours" role="group">
            <label className="row">
              <input
                type="checkbox"
                name="hoursEnabled"
                value="on"
                defaultChecked={defaults.hoursEnabled}
              />
              <span>{t('general.hoursEnabled')}</span>
            </label>
            <div className="auto-days">
              {DAYS.map((day) => (
                <label key={day} className="auto-day">
                  <input
                    type="checkbox"
                    name="hoursDays"
                    value={day}
                    defaultChecked={defaults.hoursDays.includes(day)}
                  />
                  <span>{t(`general.day.${day}`)}</span>
                </label>
              ))}
            </div>
            <div className="auto-time-row">
              <label className="field">
                <span>{t('general.hoursFrom')}</span>
                <input
                  name="hoursFrom"
                  type="time"
                  defaultValue={defaults.hoursFrom}
                  className="input"
                />
              </label>
              <label className="field">
                <span>{t('general.hoursTo')}</span>
                <input
                  name="hoursTo"
                  type="time"
                  defaultValue={defaults.hoursTo}
                  className="input"
                />
              </label>
            </div>
            <small className="muted">{t('general.hoursHint')}</small>
          </Inset>
        </Card>
      </div>

      <div className="auto-savebar">
        <p className="auto-savebar-hint">
          <CloudCheck size={20} aria-hidden="true" />
          <span>{t('saveHint')}</span>
        </p>
        <div className="auto-savebar-actions">
          <Button variant="secondary" {...soon}>
            {t('savebar.reset')}
          </Button>
          <button type="submit" className="btn btn-primary">
            {t('save')}
          </button>
        </div>
      </div>
    </form>
  );
}

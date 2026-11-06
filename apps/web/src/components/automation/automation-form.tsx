import { AUTOMATION_MODES, DELAY_SECONDS_OPTIONS, MATRIX_LABELS, MATRIX_TARGETS } from '@flow/ai';
import type { InboxChannel } from '@flow/db/runtime';
import { LayoutGrid, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { saveAutomationAction } from '../../app/app/(guarded)/automation/actions';
import type { AutomationFormDefaults } from '../../lib/automation-form';
import { modeTone } from '../../lib/automation-ui';
import { Card } from '../ui/card';
import { Inset } from '../ui/inset';
import { SectionHead } from '../ui/section-head';

const DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

/** Chữ cái đầu của tên kênh (bỏ nhãn "[MẪU]") cho ô đại diện. */
function channelInitial(name: string): string {
  const bare = name.replace(/^\[[^\]]*\]\s*/u, '');
  return (bare.match(/[\p{L}\p{N}]/u)?.[0] ?? name.slice(0, 1)).toUpperCase();
}

/**
 * Form Cài đặt tự gửi (FR-070 ma trận kênh × nhãn × bình luận/tin nhắn; FR-071 cài đặt chung). Chỉ Owner thấy
 * (trang kiểm vai trò; action kiểm lại). Không có script phía client: form HTML thuần gửi Server Action.
 * Bố cục theo design/stitch/automation.html: mỗi đối tượng (bình luận/tin nhắn) một bảng kênh × nhãn.
 */
export async function AutomationForm({
  channels,
  defaults,
}: {
  channels: InboxChannel[];
  defaults: AutomationFormDefaults;
}) {
  const t = await getTranslations('automation');
  const modeOf = (channelId: string, target: string, label: string) =>
    defaults.rules.find(
      (r) => r.channelId === channelId && r.target === target && r.label === label,
    )?.mode ?? 'off';

  return (
    <form action={saveAutomationAction} className="stack auto-form">
      <Card stack className="auto-card" aria-labelledby="automation-matrix-title">
        <SectionHead
          id="automation-matrix-title"
          icon={<LayoutGrid size={22} aria-hidden="true" />}
          title={t('matrix.title')}
          description={t('matrix.body')}
          end={
            <ul className="auto-legend" aria-label={t('matrix.legend')}>
              {[...AUTOMATION_MODES].reverse().map((mode) => (
                <li key={mode} className={`mode-pill mode-pill-${modeTone(mode)}`}>
                  {t(`mode.${mode}`)}
                </li>
              ))}
            </ul>
          }
        />
        {channels.length === 0 ? <p className="muted">{t('matrix.empty')}</p> : null}
        {channels.length > 0
          ? MATRIX_TARGETS.map((target) => (
              <div key={target} className="auto-matrix">
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
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map((channel) => (
                        <tr key={channel.id}>
                          <th scope="row">
                            <span className="auto-channel-name">
                              <span className="auto-avatar" aria-hidden="true">
                                {channelInitial(channel.name)}
                              </span>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          : null}
        <p role="note" className="auto-note">
          {t('matrix.complaintNote')}
        </p>
      </Card>

      <Card stack className="auto-card" aria-labelledby="automation-general-title">
        <SectionHead
          id="automation-general-title"
          icon={<ShieldCheck size={22} aria-hidden="true" />}
          title={t('general.title')}
          description={t('general.body')}
        />
        <div className="auto-guard-grid">
          <Inset title={t('general.threshold')} className="auto-guard-wide">
            <input
              name="threshold"
              type="number"
              inputMode="decimal"
              min={80}
              max={100}
              step="any"
              required
              defaultValue={defaults.thresholdPercent}
              className="input"
              aria-label={t('general.threshold')}
            />
            <small className="muted">{t('general.thresholdHint')}</small>
          </Inset>
          <Inset title={t('general.delay')}>
            <select
              name="delaySeconds"
              defaultValue={defaults.delaySeconds}
              className="input"
              aria-label={t('general.delay')}
            >
              {DELAY_SECONDS_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {t(`general.delayOption.${seconds}`)}
                </option>
              ))}
            </select>
          </Inset>
          <Inset title={t('general.dailyCap')}>
            <input
              name="dailyCap"
              type="number"
              min={1}
              max={1000}
              step={1}
              required
              defaultValue={defaults.dailyCap}
              className="input"
              aria-label={t('general.dailyCap')}
            />
          </Inset>
          <Inset title={t('general.hours')} className="auto-guard-wide" role="group">
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
                <input name="hoursTo" type="time" defaultValue={defaults.hoursTo} className="input" />
              </label>
            </div>
            <small className="muted">{t('general.hoursHint')}</small>
          </Inset>
          <Inset title={t('general.keywords')} className="auto-guard-wide">
            <textarea
              name="blockedKeywords"
              rows={4}
              defaultValue={defaults.keywordsText}
              className="input"
              aria-label={t('general.keywords')}
            />
            <small className="muted">{t('general.keywordsHint')}</small>
          </Inset>
          <Inset title={t('general.signature')} className="auto-guard-wide">
            <input
              name="signature"
              type="text"
              maxLength={120}
              defaultValue={defaults.signature}
              className="input"
              aria-label={t('general.signature')}
            />
            <small className="muted">{t('general.signatureHint')}</small>
          </Inset>
        </div>
      </Card>

      <div className="auto-savebar">
        <p className="muted">{t('saveHint')}</p>
        <button type="submit" className="btn btn-primary">
          {t('save')}
        </button>
      </div>
    </form>
  );
}

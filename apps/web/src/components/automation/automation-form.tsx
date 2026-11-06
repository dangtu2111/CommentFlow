import { AUTOMATION_MODES, DELAY_SECONDS_OPTIONS, MATRIX_LABELS, MATRIX_TARGETS } from '@flow/ai';
import type { InboxChannel } from '@flow/db/runtime';
import { getTranslations } from 'next-intl/server';
import { saveAutomationAction } from '../../app/app/(guarded)/automation/actions';
import type { AutomationFormDefaults } from '../../lib/automation-form';
import { modeTone } from '../../lib/automation-ui';

const DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * Form Cài đặt tự gửi (FR-070 ma trận kênh × nhãn × bình luận/tin nhắn; FR-071 cài đặt chung). Chỉ Owner thấy
 * (trang kiểm vai trò; action kiểm lại). Không có script phía client: form HTML thuần gửi Server Action.
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
      <section className="card auto-card stack" aria-labelledby="automation-matrix-title">
        <div className="auto-card-head">
          <div>
            <h2 id="automation-matrix-title" className="section-title auto-numbered">
              {t('matrix.title')}
            </h2>
            <p className="muted">{t('matrix.body')}</p>
          </div>
          <ul className="auto-legend" aria-label={t('matrix.legend')}>
            {[...AUTOMATION_MODES].reverse().map((mode) => (
              <li key={mode} className={`mode-pill mode-pill-${modeTone(mode)}`}>
                {t(`mode.${mode}`)}
              </li>
            ))}
          </ul>
        </div>
        {channels.length === 0 ? <p className="muted">{t('matrix.empty')}</p> : null}
        {channels.map((channel) => (
          <fieldset key={channel.id} className="auto-channel stack">
            <legend className="auto-channel-name">
              <span className="auto-avatar" aria-hidden="true">
                {(
                  channel.name.replace(/^\[[^\]]*\]\s*/u, '').match(/[\p{L}\p{N}]/u)?.[0] ??
                  channel.name.slice(0, 1)
                ).toUpperCase()}
              </span>
              {channel.name}
            </legend>
            <table className="table auto-table">
              <thead>
                <tr>
                  <th scope="col">{t('matrix.label')}</th>
                  {MATRIX_TARGETS.map((target) => (
                    <th key={target} scope="col">
                      {t(`target.${target}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX_LABELS.map((label) => (
                  <tr key={label}>
                    <th scope="row">{t(`labels.${label}`)}</th>
                    {MATRIX_TARGETS.map((target) => {
                      const id = `mode-${channel.id}-${target}-${label}`;
                      return (
                        <td key={target}>
                          <label className="visually-hidden" htmlFor={id}>
                            {`${channel.name} · ${t(`labels.${label}`)} · ${t(`target.${target}`)}`}
                          </label>
                          <select
                            id={id}
                            name={`mode:${channel.id}:${target}:${label}`}
                            defaultValue={modeOf(channel.id, target, label)}
                            className={`input mode-select mode-pill-${modeTone(modeOf(channel.id, target, label))}`}
                          >
                            {AUTOMATION_MODES.map((mode) => (
                              <option key={mode} value={mode}>
                                {t(`mode.${mode}`)}
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
          </fieldset>
        ))}
        <p role="note" className="auto-note">
          {t('matrix.complaintNote')}
        </p>
      </section>

      <section className="card auto-card auto-general" aria-labelledby="automation-general-title">
        <h2 id="automation-general-title" className="section-title auto-numbered">
          {t('general.title')}
        </h2>
        <label className="field">
          <span>{t('general.threshold')}</span>
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
          />
          <small className="muted">{t('general.thresholdHint')}</small>
        </label>
        <label className="field">
          <span>{t('general.delay')}</span>
          <select name="delaySeconds" defaultValue={defaults.delaySeconds} className="input">
            {DELAY_SECONDS_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {t(`general.delayOption.${seconds}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('general.dailyCap')}</span>
          <input
            name="dailyCap"
            type="number"
            min={1}
            max={1000}
            step={1}
            required
            defaultValue={defaults.dailyCap}
            className="input"
          />
        </label>
        <fieldset className="stack">
          <legend>{t('general.hours')}</legend>
          <label className="row">
            <input
              type="checkbox"
              name="hoursEnabled"
              value="on"
              defaultChecked={defaults.hoursEnabled}
            />
            <span>{t('general.hoursEnabled')}</span>
          </label>
          <div className="row">
            {DAYS.map((day) => (
              <label key={day} className="row">
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
          <div className="row">
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
        </fieldset>
        <label className="field">
          <span>{t('general.keywords')}</span>
          <textarea
            name="blockedKeywords"
            rows={4}
            defaultValue={defaults.keywordsText}
            className="input"
          />
          <small className="muted">{t('general.keywordsHint')}</small>
        </label>
        <label className="field">
          <span>{t('general.signature')}</span>
          <input
            name="signature"
            type="text"
            maxLength={120}
            defaultValue={defaults.signature}
            className="input"
          />
          <small className="muted">{t('general.signatureHint')}</small>
        </label>
      </section>

      <div className="auto-savebar">
        <p className="muted">{t('saveHint')}</p>
        <button type="submit" className="btn btn-primary">
          {t('save')}
        </button>
      </div>
    </form>
  );
}

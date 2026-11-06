import { AUTOMATION_MODES, DELAY_SECONDS_OPTIONS, MATRIX_LABELS, MATRIX_TARGETS } from '@flow/ai';
import type { InboxChannel } from '@flow/db/runtime';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { saveAutomationAction } from '../../app/app/(guarded)/automation/actions';
import type { AutomationFormDefaults } from '../../lib/automation-form';
import { type ModeTone, modeTone } from '../../lib/automation-ui';
import { Icon, type IconName } from '../ui/icon';
import { FIELD_CLASS, Toggle } from '../ui/tw-form';
import { Badge, Meter, SoonButton } from '../ui/tw-parts';
import { TwPlatformBadge } from '../ui/tw-platform-badge';
import { KeywordChips } from './keyword-chips';
import { ThresholdSlider } from './threshold-slider';

const MATRIX_ID = 'automation-matrix-title';
const BEHAVIOR_ID = 'automation-behavior-title';
const GUARD_ID = 'automation-guard-title';
const DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

/** Nhãn mà AI không bao giờ tự gửi (hiện khóa "Không hỗ trợ"; không có trong form). */
const LOCKED_LABELS = ['complaint', 'spam'] as const;

/** Viên mức tự gửi: màu theo mức (Stitch: Tự động = xanh đậm, Chạy thử = cam nhạt, Tắt = xám). */
const MODE_PILL: Record<ModeTone, string> = {
  auto: 'bg-primary-container text-on-primary shadow-sm',
  shadow: 'bg-tertiary-fixed text-on-tertiary-fixed',
  off: 'bg-surface-container text-on-surface-variant',
};
const MODE_DOT: Record<ModeTone, string> = {
  auto: 'bg-primary-container',
  shadow: 'bg-tertiary-container',
  off: 'bg-outline',
};

const BLOCK = 'rounded-xl bg-surface-container-low p-4';
const PANEL = 'rounded-xl bg-surface-container-lowest p-space-lg shadow-sm';

/** Tiêu đề khối lớn (biểu tượng + tiêu đề + mô tả), dùng ở ba thẻ chính. */
function SectionTitle({
  id,
  icon,
  title,
  description,
}: {
  id: string;
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-primary">
          <Icon name={icon} size={20} />
        </span>
        <h2 id={id} className="font-headline-sm text-headline-sm text-on-surface">
          {title}
        </h2>
      </div>
      <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">{description}</p>
    </div>
  );
}

/** Khối nền xanh nhạt có tiêu đề + biểu tượng (ô con trong thẻ Ngưỡng an toàn). */
function Block({
  title,
  icon,
  tone = 'text-primary',
  className,
  children,
  ...rest
}: {
  title?: string;
  icon?: IconName;
  tone?: string;
  className?: string;
  children: ReactNode;
  role?: string;
}) {
  return (
    <div className={`${BLOCK} space-y-2 ${className ?? ''}`} {...rest}>
      {title ? (
        <div className="flex items-center justify-between">
          <span className="font-title-sm text-title-sm text-on-surface">{title}</span>
          {icon ? (
            <span className={tone}>
              <Icon name={icon} size={18} />
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

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
  const soonTitle = t('soonTitle');
  const used = usedToday ?? 0;
  const percentUsed = usedToday === null ? 0 : (used / Math.max(1, defaults.dailyCap)) * 100;
  const radioClass = 'mt-1 h-4 w-4 cursor-not-allowed accent-primary';
  const optionClass = 'flex items-start gap-3 rounded-xl p-3.5 opacity-90';

  return (
    <form action={saveAutomationAction} className="space-y-space-lg">
      <section className={`${PANEL} space-y-space-md`} aria-labelledby={MATRIX_ID}>
        <div className="flex flex-col justify-between gap-space-sm sm:flex-row sm:items-center">
          <SectionTitle
            id={MATRIX_ID}
            icon="grid_view"
            title={t('matrix.title')}
            description={t('matrix.body')}
          />
          <ul aria-label={t('matrix.legend')} className="flex items-center gap-2">
            {[...AUTOMATION_MODES].reverse().map((mode) => {
              const tone = modeTone(mode);
              return (
                <li
                  key={mode}
                  className="flex items-center gap-1 rounded bg-surface-container px-2.5 py-1 font-label-sm text-label-sm text-on-surface"
                >
                  <span className={`h-2 w-2 rounded-full ${MODE_DOT[tone]}`} />
                  {mode === 'off' ? t('matrix.legendOff') : t(`mode.${mode}`)}
                </li>
              );
            })}
          </ul>
        </div>
        {channels.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">{t('matrix.empty')}</p>
        ) : (
          MATRIX_TARGETS.map((target) => (
            <div key={target} id={`auto-matrix-${target}`} className="space-y-2">
              <h3 className="font-title-md text-title-md text-on-surface">
                {t(`target.${target}`)}
              </h3>
              <div className="overflow-x-auto rounded-lg">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-low font-title-sm text-title-sm text-on-surface-variant">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        {t('matrix.channel')}
                      </th>
                      {[...MATRIX_LABELS, ...LOCKED_LABELS].map((label) => (
                        <th key={label} scope="col" className="px-4 py-3 text-center font-semibold">
                          {t(`labels.${label}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container font-body-md text-body-md">
                    {channels.map((channel) => (
                      <tr
                        key={channel.id}
                        className="transition-colors hover:bg-surface-container-low/50"
                      >
                        <th
                          scope="row"
                          className="px-4 py-3.5 text-left font-title-sm text-title-sm text-on-surface"
                        >
                          <span className="flex items-center gap-2">
                            <TwPlatformBadge platform={channel.platform} />
                            <span>{channel.name}</span>
                          </span>
                        </th>
                        {MATRIX_LABELS.map((label) => {
                          const id = `mode-${channel.id}-${target}-${label}`;
                          const mode = modeOf(channel.id, target, label);
                          return (
                            <td key={label} className="px-4 py-3.5 text-center">
                              <label className="sr-only" htmlFor={id}>
                                {`${channel.name} · ${t(`labels.${label}`)} · ${t(`target.${target}`)}`}
                              </label>
                              <select
                                id={id}
                                name={`mode:${channel.id}:${target}:${label}`}
                                defaultValue={mode}
                                className={`cursor-pointer rounded-full border-0 px-3 py-1 text-center font-label-sm text-label-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-container ${MODE_PILL[modeTone(mode)]}`}
                              >
                                {AUTOMATION_MODES.map((m) => (
                                  <option
                                    key={m}
                                    value={m}
                                    className="bg-surface-container-lowest text-on-surface"
                                  >
                                    {t(`mode.${m}`)}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                        {LOCKED_LABELS.map((label) => (
                          <td key={label} className="px-4 py-3.5 text-center">
                            <span className="inline-flex items-center gap-1 rounded bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm text-on-surface-variant">
                              <Icon name="lock" size={12} />
                              {t('matrix.unsupported')}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
        <p
          role="note"
          className="flex items-center gap-2 rounded-lg bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface-variant"
        >
          <span className="text-primary">
            <Icon name="info" size={16} />
          </span>
          <span>
            <strong>{t('matrix.noteLead')}</strong> {t('matrix.complaintNote')}
          </span>
        </p>
      </section>

      <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-12">
        <section
          className={`${PANEL} flex flex-col justify-between space-y-space-lg lg:col-span-5`}
          aria-labelledby={BEHAVIOR_ID}
        >
          <div className="space-y-space-md">
            <div className="flex items-start justify-between gap-2">
              <SectionTitle
                id={BEHAVIOR_ID}
                icon="forum"
                title={t('behavior.title')}
                description={t('behavior.body')}
              />
              <Badge tone="neutral">{t('soon')}</Badge>
            </div>
            <div
              role="radiogroup"
              aria-label={t('behavior.title')}
              className="space-y-space-sm pt-2"
            >
              <label className={`${optionClass} bg-surface-container-low`} title={soonTitle}>
                <input
                  type="radio"
                  name="reply_behavior"
                  defaultChecked
                  disabled
                  aria-disabled="true"
                  className={radioClass}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-title-sm text-title-sm text-on-surface">
                      {t('behavior.both')}
                    </span>
                    <Badge tone="secondary" className="font-semibold">
                      {t('behavior.recommended')}
                    </Badge>
                  </span>
                  <span className="mt-1 block font-body-sm text-body-sm leading-snug text-on-surface-variant">
                    {t('behavior.bothBody')}
                  </span>
                </span>
              </label>
              <label className={`${optionClass} bg-surface-container-lowest`} title={soonTitle}>
                <input
                  type="radio"
                  name="reply_behavior"
                  disabled
                  aria-disabled="true"
                  className={radioClass}
                />
                <span className="min-w-0">
                  <span className="font-title-sm text-title-sm text-on-surface">
                    {t('behavior.publicOnly')}
                  </span>
                  <span className="mt-1 block font-body-sm text-body-sm leading-snug text-on-surface-variant">
                    {t('behavior.publicOnlyBody')}
                  </span>
                </span>
              </label>
              <label className={`${optionClass} bg-surface-container-lowest`} title={soonTitle}>
                <input
                  type="radio"
                  name="reply_behavior"
                  disabled
                  aria-disabled="true"
                  className={radioClass}
                />
                <span className="min-w-0">
                  <span className="font-title-sm text-title-sm text-on-surface">
                    {t('behavior.privateOnly')}
                  </span>
                  <span className="mt-1 block font-body-sm text-body-sm leading-snug text-on-surface-variant">
                    {t('behavior.privateOnlyBody')}{' '}
                    <em className="font-medium text-primary">{t('behavior.privateOnlyQuote')}</em>
                  </span>
                </span>
              </label>
            </div>
          </div>
          <div className={`${BLOCK} space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-title-sm text-title-sm text-on-surface">
                <span className="text-primary">
                  <Icon name="sell" size={18} />
                </span>
                {t('behavior.price')}
              </span>
              <Toggle defaultChecked disabled label={t('behavior.price')} />
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('behavior.priceBody')}
            </p>
          </div>
        </section>

        <section
          id="auto-guard"
          className={`${PANEL} space-y-space-lg lg:col-span-7`}
          aria-labelledby={GUARD_ID}
        >
          <SectionTitle
            id={GUARD_ID}
            icon="shield"
            title={t('guard.title')}
            description={t('guard.body')}
          />
          <div className="space-y-space-md">
            <div className={BLOCK}>
              <ThresholdSlider
                name="threshold"
                defaultValue={Number(defaults.thresholdPercent)}
                label={t('guard.threshold')}
              />
            </div>
            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
              <Block title={t('guard.delay')} icon="timer" tone="text-tertiary-container">
                <select
                  name="delaySeconds"
                  defaultValue={defaults.delaySeconds}
                  className={FIELD_CLASS}
                  aria-label={t('guard.delay')}
                >
                  {DELAY_SECONDS_OPTIONS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {t(`general.delayOption.${seconds}`)}
                    </option>
                  ))}
                </select>
                <small className="block font-body-sm text-body-sm leading-tight text-on-surface-variant">
                  {t('guard.delayHint')}
                </small>
              </Block>
              <Block title={t('guard.dailyCap')} icon="speed">
                <input
                  name="dailyCap"
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  required
                  defaultValue={defaults.dailyCap}
                  className={FIELD_CLASS}
                  aria-label={t('guard.dailyCap')}
                />
                <div className="flex items-baseline justify-between">
                  <strong className="font-title-sm text-title-sm font-semibold text-on-surface">
                    {t('guard.usage', { used: usedToday ?? '—', cap: defaults.dailyCap })}
                  </strong>
                  {usedToday === null ? null : (
                    <span className="font-label-sm text-label-sm font-medium text-primary">
                      {t('guard.remaining', { left: Math.max(0, defaults.dailyCap - used) })}
                    </span>
                  )}
                </div>
                <div role="img" aria-label={t('guard.usageLabel')}>
                  <Meter pct={percentUsed} />
                </div>
              </Block>
            </div>
            <Block className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <span className="font-title-sm text-title-sm text-on-surface">
                  {t('guard.keywords')}
                </span>
                <span className="text-error">
                  <Icon name="block" size={16} />
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('guard.keywordsBody')}
              </p>
              <KeywordChips
                name="blockedKeywords"
                initial={defaults.keywordsText.split('\n').filter(Boolean)}
              />
              <small className="block font-body-sm text-body-sm text-on-surface-variant">
                {t('general.keywordsHint')}
              </small>
            </Block>
            <div className={`${BLOCK} space-y-2`}>
              <input type="hidden" name="signatureToggle" value="1" />
              <div className="flex items-center justify-between">
                <span className="font-title-sm text-title-sm text-on-surface">
                  {t('guard.signature')}
                </span>
                <Toggle
                  name="signatureEnabled"
                  value="on"
                  defaultChecked={defaults.signature !== ''}
                  label={t('guard.signature')}
                />
              </div>
              {defaults.signature ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">{`"${defaults.signature}"`}</p>
              ) : null}
              <input
                name="signature"
                type="text"
                maxLength={120}
                defaultValue={defaults.signature}
                placeholder={t('guard.signaturePlaceholder')}
                className={FIELD_CLASS}
                aria-label={t('guard.signature')}
              />
              <small className="block font-body-sm text-body-sm text-on-surface-variant">
                {t('general.signatureHint')}
              </small>
            </div>
            <Block title={t('general.hours')} role="group">
              <label className="flex items-center gap-2 font-body-md text-body-md text-on-surface">
                <input
                  type="checkbox"
                  name="hoursEnabled"
                  value="on"
                  defaultChecked={defaults.hoursEnabled}
                  className="h-4 w-4 accent-primary"
                />
                <span>{t('general.hoursEnabled')}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <label
                    key={day}
                    className="flex items-center gap-1 rounded-lg bg-surface-container-lowest px-2.5 py-1 font-label-md text-label-md text-on-surface"
                  >
                    <input
                      type="checkbox"
                      name="hoursDays"
                      value={day}
                      defaultChecked={defaults.hoursDays.includes(day)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <span>{t(`general.day.${day}`)}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-space-md">
                <label className="block space-y-1 font-label-md text-label-md text-on-surface-variant">
                  <span>{t('general.hoursFrom')}</span>
                  <input
                    name="hoursFrom"
                    type="time"
                    defaultValue={defaults.hoursFrom}
                    className={FIELD_CLASS}
                  />
                </label>
                <label className="block space-y-1 font-label-md text-label-md text-on-surface-variant">
                  <span>{t('general.hoursTo')}</span>
                  <input
                    name="hoursTo"
                    type="time"
                    defaultValue={defaults.hoursTo}
                    className={FIELD_CLASS}
                  />
                </label>
              </div>
              <small className="block font-body-sm text-body-sm text-on-surface-variant">
                {t('general.hoursHint')}
              </small>
            </Block>
          </div>
        </section>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 rounded-xl bg-surface-container-low p-4 sm:flex-row">
        <p className="flex items-center gap-2 font-body-md text-body-md text-on-surface">
          <span className="text-primary">
            <Icon name="cloud_done" size={20} />
          </span>
          <span>{t('saveHint')}</span>
        </p>
        <div className="flex items-center gap-2">
          <SoonButton variant="neutral" soon={soonTitle} className="bg-surface-container-lowest">
            {t('savebar.reset')}
          </SoonButton>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-primary-container px-4 py-2 font-title-sm text-title-sm text-on-primary shadow-sm transition-colors hover:bg-primary"
          >
            <Icon name="check" size={16} />
            <span>{t('save')}</span>
          </button>
        </div>
      </div>
    </form>
  );
}

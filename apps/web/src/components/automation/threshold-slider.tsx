'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Chip } from '../ui/chip';
import { RICH_BOLD } from '../ui/rich';

/** Sàn của schema (`automationConfigSchema`): không cho kéo thấp hơn để khỏi lưu giá trị bị từ chối. */
export const THRESHOLD_MIN = 80;
const THRESHOLD_MAX = 100;
const STRICT_FROM = 95;
const BALANCED_FROM = 85;

/** Tên mức theo giá trị (chỉ để hiển thị; quyết định tự gửi vẫn do code cổng). */
export function thresholdTier(value: number): 'loose' | 'balanced' | 'strict' {
  if (value >= STRICT_FROM) return 'strict';
  return value >= BALANCED_FROM ? 'balanced' : 'loose';
}

/**
 * Thanh trượt "Ngưỡng độ tin cậy để tự gửi" (Stitch: range + huy hiệu mức). Gửi `threshold` (phần trăm) như ô số cũ,
 * nên `parseAutomationForm` không đổi. Có script phía client chỉ để huy hiệu/ghi chú đổi theo giá trị kéo.
 */
export function ThresholdSlider({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: number;
  label: string;
}) {
  const t = useTranslations('automation.guard');
  const id = useId();
  const [value, setValue] = useState(
    Math.min(
      THRESHOLD_MAX,
      Math.max(THRESHOLD_MIN, Number.isFinite(defaultValue) ? defaultValue : 85),
    ),
  );
  const tier = thresholdTier(value);
  const note = t.rich('thresholdNote', { ...RICH_BOLD, value });
  return (
    <div className="threshold">
      <div className="threshold-head">
        <label htmlFor={id} className="inset-title">
          {label}
        </label>
        <Chip tone="solid">{t('badgeText', { tier: t(`badge.${tier}`), value })}</Chip>
      </div>
      <input
        id={id}
        name={name}
        type="range"
        className="threshold-range"
        min={THRESHOLD_MIN}
        max={THRESHOLD_MAX}
        step={0.5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
      <div className="threshold-ticks">
        <span>{t('tickLow', { value: THRESHOLD_MIN })}</span>
        <span className="is-mid">{t('tickMid', { value: BALANCED_FROM })}</span>
        <span>{t('tickHigh', { value: THRESHOLD_MAX })}</span>
      </div>
      <p className="muted">{note}</p>
    </div>
  );
}

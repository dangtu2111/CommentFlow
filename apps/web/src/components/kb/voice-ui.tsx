import type { ReactNode } from 'react';
import { Icon, type IconName } from '../ui/icon';

/**
 * Giọng văn & Persona: khối đánh số "Khối 0N" dựng theo `design/stitch/kb-voice.html` (ADR 013). Chỉ trình bày; ô nhập do trang truyền vào. Điều khiển thiết kế chưa có nền tảng lưu
 * (độ dài phản hồi, mức emoji…) hiện dạng ô TẮT kèm chú thích, không số mẫu.
 */
export function VoiceBlock({
  index,
  title,
  subtitle,
  icon,
  children,
}: {
  index: string;
  title: string;
  subtitle: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md">
      <div className="flex items-start gap-space-md">
        <div className="w-10 h-10 rounded-lg bg-primary-fixed text-primary flex items-center justify-center shrink-0">
          <Icon name={icon} size={18} />
        </div>
        <div>
          <div className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">
            {index}
          </div>
          <h3 className="font-title-md text-title-md text-on-surface">{title}</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Khối TẮT (chưa có nền tảng lưu) kèm chú thích "Sắp có". */
export function VoiceOffControls({
  title,
  options,
  note,
}: {
  title: string;
  options: readonly string[];
  note: string;
}) {
  return (
    <div className="space-y-space-sm">
      <div className="flex items-center justify-between gap-space-sm">
        <span className="font-title-sm text-title-sm text-on-surface">{title}</span>
        <span className="font-label-sm text-label-sm text-on-surface-variant">{note}</span>
      </div>
      <div className="grid grid-cols-3 gap-space-sm">
        {options.map((option) => (
          <span
            key={option}
            aria-disabled="true"
            className="px-3 py-2 rounded-lg bg-surface-container-low text-on-surface-variant font-body-md text-body-md text-center cursor-not-allowed opacity-60"
          >
            {option}
          </span>
        ))}
      </div>
    </div>
  );
}

import type { SuggestionUi } from '../../lib/suggestion';
import { Icon } from '../ui/icon';

/** Chip "Nguồn kiến thức" nền tím Spark (chỉ dành cho AI) — chép từ HTML Stitch. */
const SOURCE_CHIP =
  'inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 font-label-sm text-label-sm text-on-secondary shadow-sm';

export type SuggestionLabels = {
  title: string;
  use: string;
  edited: string;
  needsHuman: string;
  sources: string;
  /** Nhãn chip khi chưa biết tên nguồn. */
  sourceFallback: string;
  /** Có `{count}` (được thay ở đây). */
  more: string;
};

type ShownSuggestion = Extract<SuggestionUi, { show: true }>;

/**
 * Dải ghi chú dưới ô soạn (FR-043): cảnh báo xem lại, "Dùng gợi ý" (khôi phục câu AI sau khi sửa), "Đã sửa". Câu gợi ý
 * nằm sẵn trong ô soạn (thiết kế Stitch); AI chỉ soạn câu, người bấm gửi. Chỉ hiện khi có gì để báo.
 */
export function SuggestionPanel({
  ui,
  labels,
  onUse,
}: {
  ui: ShownSuggestion;
  labels: SuggestionLabels;
  onUse: () => void;
}) {
  if (!ui.needsHuman && !ui.canUse && !ui.edited) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={labels.title}>
      {ui.needsHuman ? (
        <p className="rounded bg-tertiary-fixed px-2.5 py-1.5 font-body-sm text-body-sm text-on-tertiary-fixed-variant">
          {labels.needsHuman}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-secondary-fixed px-2 py-1 font-label-sm text-label-sm text-on-secondary-fixed transition-colors enabled:hover:bg-secondary-fixed-dim [&:not(:enabled)]:cursor-not-allowed [&:not(:enabled)]:opacity-60"
          onClick={onUse}
          disabled={!ui.canUse}
        >
          {labels.use}
        </button>
        {ui.edited ? (
          <span className="font-label-sm text-label-sm text-on-surface-variant" role="status">
            {labels.edited}
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** Chip "Nguồn kiến thức nạp vào" (tối đa 5 + "+N nguồn"); tên nguồn chưa biết → nhãn chung. */
export function SuggestionSources({
  ui,
  labels,
  caption,
}: {
  ui: ShownSuggestion;
  labels: SuggestionLabels;
  caption: string;
}) {
  if (ui.sources.chips.length === 0) return null;
  const moreText = labels.more.replace('{count}', String(ui.sources.more));
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={labels.sources}>
      <li className="mr-1 font-label-sm text-label-sm text-on-surface-variant">{caption}</li>
      {ui.sources.chips.map((chip) => (
        <li key={chip.id} className={SOURCE_CHIP}>
          <Icon name="auto_awesome" size={12} />
          {chip.label ?? labels.sourceFallback}
        </li>
      ))}
      {ui.sources.more > 0 ? <li className={SOURCE_CHIP}>{moreText}</li> : null}
    </ul>
  );
}

import { Sparkles } from 'lucide-react';
import type { SuggestionUi } from '../../lib/suggestion';

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
    <section className="suggestion" aria-label={labels.title}>
      {ui.needsHuman ? <p className="suggestion-warn">{labels.needsHuman}</p> : null}
      <div className="suggestion-actions">
        <button type="button" className="btn" onClick={onUse} disabled={!ui.canUse}>
          {labels.use}
        </button>
        {ui.edited ? (
          <span className="suggestion-edited" role="status">
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
    <ul className="reply-sources" aria-label={labels.sources}>
      <li className="reply-sources-caption">{caption}</li>
      {ui.sources.chips.map((chip) => (
        <li key={chip.id} className="reply-source">
          <Sparkles size={11} aria-hidden="true" />
          {chip.label ?? labels.sourceFallback}
        </li>
      ))}
      {ui.sources.more > 0 ? <li className="reply-source">{moreText}</li> : null}
    </ul>
  );
}

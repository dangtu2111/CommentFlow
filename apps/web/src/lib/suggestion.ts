import { buildSourceChips, normalizeReplyText } from '@flow/shared';

/**
 * Gợi ý AI cho một bình luận (FR-043), dạng hiển thị. Dữ liệu sẽ đến từ `drafts` khi bảng đó có
 * (`SUGGEST-UI-PERSIST`); chưa có thì không truyền → không hiện ô gợi ý.
 */
export type SuggestionView = {
  text: string;
  sourceIds: string[];
  /** id nguồn → tên đoạn kiến thức. */
  sourceTitles: Record<string, string>;
  needsHuman: boolean;
};

export type SuggestionUi =
  | { show: false }
  | {
      show: true;
      /** Nút "Dùng gợi ý" hoạt động (hộp soạn chưa bằng gợi ý). */
      canUse: boolean;
      /** Hộp soạn có chữ và khác gợi ý → báo "đã sửa so với gợi ý". */
      edited: boolean;
      needsHuman: boolean;
      sources: ReturnType<typeof buildSourceChips>;
    };

/** Trạng thái ô gợi ý theo nội dung hộp soạn hiện tại. Thuần, không đụng DB. */
export function deriveSuggestionUi(
  suggestion: SuggestionView | null,
  composerText: string,
): SuggestionUi {
  if (!suggestion || normalizeReplyText(suggestion.text) === '') return { show: false };
  const current = normalizeReplyText(composerText);
  const same = current === normalizeReplyText(suggestion.text);
  return {
    show: true,
    canUse: !same,
    edited: current !== '' && !same,
    needsHuman: suggestion.needsHuman,
    sources: buildSourceChips(suggestion.sourceIds, suggestion.sourceTitles),
  };
}

import { postNoteStatus, unsafeMarkMasked } from '@flow/shared';
import type { DraftSource } from '../draft/draft-prompt';
import { scanInjection } from '../injection/injection-scan';
import { estimateTokens } from './sources';

/**
 * Thứ tự ưu tiên dữ liệu khi trả lời (FR-063, Q-DP1): ghi chú của bài → sản phẩm gắn bài (giá/tồn từ DB)
 * → chính sách/FAQ → kiến thức chung của cửa hàng. Thuần, không I/O. Bậc nhỏ hơn = ưu tiên hơn.
 */
export const SOURCE_PRIORITY: Readonly<Record<DraftSource['kind'], number>> = {
  post_note: 0,
  product: 1,
  policy: 2,
  kb: 3,
};

/** Trần token của khối ghi chú bài (mỗi ghi chú ≤ 1.000 ký tự, FR-062). */
export const DEFAULT_MAX_NOTE_TOKENS = 1500;

/** Ghi chú bài như `listActivePostNotes` trả về (khai báo lại để `ai` không phụ thuộc kiểu db). */
export type PostNoteSourceInput = {
  id: string;
  content: string;
  validFrom: Date;
  validTo: Date | null;
};

export type PostNoteSourceOptions = {
  maxTokens?: number;
  /** Miền của shop: link tới đó không bị coi là link lạ khi quét cài lệnh (FR-164). */
  allowedDomains?: readonly string[];
};

export type PostNoteSourceResult = {
  sources: DraftSource[];
  /** Có ghi chú bị bỏ vì trần token. */
  truncated: boolean;
  /** Mã ghi chú nghi cài lệnh (FR-164), bị cách ly. */
  quarantined: string[];
};

/**
 * Ghi chú còn hiệu lực tại `now` → nguồn `post_note`. Ghi chú mới hơn (validFrom lớn hơn) trước, hòa theo id;
 * ghi chú hết hạn/chưa tới hạn/trống bị loại; nghi cài lệnh bị cách ly; nhặt đến trần token.
 */
export function postNotesToSources(
  notes: readonly PostNoteSourceInput[],
  now: Date,
  options: PostNoteSourceOptions = {},
): PostNoteSourceResult {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_NOTE_TOKENS;
  const active = notes
    .filter((note) => postNoteStatus(note, now) === 'active' && note.content.trim() !== '')
    .sort(
      (a, b) =>
        b.validFrom.getTime() - a.validFrom.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  const sources: DraftSource[] = [];
  const quarantined: string[] = [];
  let used = 0;
  let truncated = false;
  for (const note of active) {
    const text = note.content.trim();
    if (scanInjection(text, { allowedDomains: options.allowedDomains }).suspected) {
      quarantined.push(note.id);
      continue;
    }
    const tokens = estimateTokens(text);
    if (used + tokens > maxTokens) {
      truncated = true;
      continue;
    }
    used += tokens;
    // Ghi chú do shop nhập, không chứa PII của khách; điểm 1 vì gắn đúng bài đang trả lời.
    sources.push({
      id: `note:${note.id}`,
      kind: 'post_note',
      text: unsafeMarkMasked(text),
      relevance: 1,
    });
  }
  return { sources, truncated, quarantined };
}

/** Xếp ổn định theo bậc `SOURCE_PRIORITY`; giữ thứ tự tương đối trong cùng bậc. Không đổi mảng vào. */
export function orderByPriority(sources: readonly DraftSource[]): DraftSource[] {
  return sources
    .map((source, index) => ({ source, index }))
    .sort(
      (a, b) =>
        SOURCE_PRIORITY[a.source.kind] - SOURCE_PRIORITY[b.source.kind] || a.index - b.index,
    )
    .map((entry) => entry.source);
}

import { parsePublishNote } from '@flow/shared';

/**
 * Trang "Phiên bản kiến thức" (FR-054, UF-8): kiểm form xuất bản/khôi phục. Thuần, không phụ thuộc React/DB.
 * `bad_request` (ý định/số phiên bản lạ) → nơi gọi trả 404; `invalid_note` → báo lỗi tại chỗ.
 */
export type KbPublishAction =
  | { intent: 'publish'; note: string | null; confirmed: boolean }
  | { intent: 'restore'; versionNumber: number; note: string | null; confirmed: boolean };

export type KbPublishFormResult =
  | { ok: true; action: KbPublishAction }
  | { ok: false; code: 'bad_request' | 'invalid_note' };

type FormLike = { get(key: string): unknown };

const POSITIVE_INT = /^[1-9][0-9]{0,8}$/;

export function parseKbPublishForm(data: FormLike): KbPublishFormResult {
  const intent = data.get('intent');
  if (intent !== 'publish' && intent !== 'restore') return { ok: false, code: 'bad_request' };
  const note = parsePublishNote(data.get('note') ?? undefined);
  if (!note.ok) return { ok: false, code: 'invalid_note' };
  const confirmed = data.get('confirm') === 'on';
  if (intent === 'publish') {
    return { ok: true, action: { intent, note: note.note, confirmed } };
  }
  const raw = data.get('versionNumber');
  if (typeof raw !== 'string' || !POSITIVE_INT.test(raw)) return { ok: false, code: 'bad_request' };
  return {
    ok: true,
    action: { intent, versionNumber: Number(raw), note: note.note, confirmed },
  };
}

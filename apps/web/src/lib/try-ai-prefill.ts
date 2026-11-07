import { TRY_AI_MAX_CHARS } from './try-ai-limits';

/**
 * Câu hỏi điền sẵn vào ô Thử AI từ `?q=` (trang tổng quan Cơ sở kiến thức gửi sang). Chỉ là DỮ LIỆU hiển thị trong ô
 * nhập (React tự thoát ký tự); không tự chạy, không lưu. Cắt theo `TRY_AI_MAX_CHARS`, bỏ ký tự điều khiển (giữ xuống dòng).
 */
export function initialTryAiText(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return '';
  // biome-ignore lint/suspicious/noControlCharactersInRegex: cố ý loại ký tự điều khiển khỏi giá trị điền sẵn
  const cleaned = raw.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim();
  return cleaned.slice(0, TRY_AI_MAX_CHARS);
}

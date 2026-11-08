import { normalizeAndDetectLang } from '../normalize/normalize-lang';

/**
 * Ngôn ngữ THẬT của một đoạn kiến thức (FR-057/120): nhận diện bằng CHÍNH bộ nhận diện của pipeline (`normalizeAndDetectLang`), không ép
 * "all" thành tiếng Việt. Ngôn ngữ quyết định cấu hình tsv của đoạn (`simple` bỏ dấu cho vi, `english` cho en). Không đoán được
 * (quá ngắn, chỉ số/ký hiệu) → theo ngôn ngữ đã khai ("all" → vi).
 */
export type DeclaredLang = 'vi' | 'en' | 'all';

export function detectChunkLang(text: string, declared: DeclaredLang): 'vi' | 'en' {
  const { lang, rule } = normalizeAndDetectLang({ text });
  // `default` = bộ nhận diện KHÔNG có căn cứ (văn bản quá ngắn/chỉ số) → theo ngôn ngữ đã khai.
  if (rule !== 'default' && (lang === 'vi' || lang === 'en')) return lang;
  return declared === 'en' ? 'en' : 'vi';
}

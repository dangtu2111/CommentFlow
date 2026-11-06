// API công khai của module normalize. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  type AbbreviationDict,
  createAbbreviationDict,
  type DetectedLang,
  type KnownLang,
  type LangDetection,
  type LangDetector,
  type LangRule,
  type NormalizeLangInput,
  type NormalizeLangResult,
  normalizeAndDetectLang,
  normalizeText,
} from './normalize-lang';

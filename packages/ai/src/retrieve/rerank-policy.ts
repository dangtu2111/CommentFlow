/**
 * Chính sách dùng rerank (đo ở Nhóm R, 08/11/2026): bge-reranker-v2-m3 xếp lại TỐT cho tiếng Anh (sswiftly MRR 0,78 → 0,955) và tiếng Việt CÓ dấu, nhưng
 * với tiếng Việt KHÔNG dấu/teencode nó làm xấu đi (vi_plain MRR 0,85 → 0,60; điểm của đoạn đúng thấp hơn cả đoạn sai) → câu loại đó bỏ rerank, giữ cosine.
 */
const VIETNAMESE_DIACRITICS =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Tỉ lệ từ có dấu tối thiểu để coi câu tiếng Việt là "có dấu". Câu không dấu sau khi mở rộng viết tắt vẫn lẫn vài từ có dấu ("bn" → "bao nhiêu") nên không dùng "có ≥ 1 dấu". */
export const MIN_ACCENTED_WORD_RATIO = 0.5;

function accentedWordRatio(query: string): number {
  const words = query.split(/[^\p{L}]+/u).filter((word) => word !== '');
  if (words.length === 0) return 0;
  return words.filter((word) => VIETNAMESE_DIACRITICS.test(word)).length / words.length;
}

export function shouldRerank(query: string, lang: 'vi' | 'en'): boolean {
  return lang === 'en' || accentedWordRatio(query) >= MIN_ACCENTED_WORD_RATIO;
}

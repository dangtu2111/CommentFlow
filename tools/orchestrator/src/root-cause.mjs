// Phát hiện sửa lặp: agent phải ghi một dòng "NGUYÊN NHÂN GỐC: ..." sau mỗi lần sửa.
const LINE = /NGUYÊN NHÂN GỐC\s*[:：]\s*(.+)/giu;

export function extractRootCause(text) {
  let last;
  for (const m of String(text).matchAll(LINE)) last = m[1].trim();
  return last;
}

function tokens(s) {
  return new Set(
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean),
  );
}

// Giống nhau nếu độ chồng từ (Jaccard) >= ngưỡng; thiếu nguyên nhân → không kết luận lặp.
export function sameCause(a, b, threshold = 0.8) {
  if (!a || !b) return false;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return common / (ta.size + tb.size - common) >= threshold;
}

export function isRepeatedCause(previous, current, threshold) {
  return previous.some((p) => sameCause(p, current, threshold));
}

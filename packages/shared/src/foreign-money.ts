/**
 * Tiền tệ KHÁC VND của nguồn ngoài (Q-SFP1): lưu theo đơn vị nhỏ nhất của tiền tệ gốc (USD: cent) và hiển thị đúng như nguồn,
 * KHÔNG quy đổi tỷ giá (nguyên tắc #4). Hàm thuần, không dùng số thực để đọc tiền (tránh sai số 0,1 + 0,2).
 */
const CODE = /^[A-Z]{3}$/;
/** Tối đa 12 chữ số phần nguyên — chặn số vô lý trước khi ghi cột bigint. */
const DECIMAL = /^(\d{1,12})(?:\.(\d+))?$/;

/** Số chữ số thập phân của đơn vị nhỏ nhất theo ISO 4217 (USD 2, JPY 0, KWD 3); mã sai dạng → `null`. */
export function currencyExponent(code: string): number | null {
  if (!CODE.test(code)) return null;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
      .maximumFractionDigits as number;
  } catch {
    return null;
  }
}

/**
 * Chuỗi thập phân theo tiền tệ cửa hàng ("12.99") → đơn vị nhỏ nhất (1299). Chỉ nhận số không âm, không dấu phân nhóm, không
 * ký hiệu khoa học; phần lẻ dài hơn độ chính xác của tiền tệ (sau khi bỏ số 0 thừa ở đuôi) → `null` (không làm tròn ngầm).
 */
export function parseDecimalMinor(
  raw: string | null | undefined,
  currencyCode: string,
): number | null {
  const exponent = currencyExponent(currencyCode);
  if (exponent === null || raw === null || raw === undefined) return null;
  const match = DECIMAL.exec(raw.trim());
  if (!match) return null;
  const whole = match[1] as string;
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (fraction.length > exponent) return null;
  return Number(`${whole}${fraction.padEnd(exponent, '0')}`);
}

/** Đơn vị nhỏ nhất → chữ như nguồn ("12.99 USD", "1500 JPY"); đầu vào hỏng → `null` (không bịa số). */
export function formatMinorAmount(amountMinor: number, currencyCode: string): string | null {
  const exponent = currencyExponent(currencyCode);
  if (exponent === null || !Number.isSafeInteger(amountMinor) || amountMinor < 0) return null;
  if (exponent === 0) return `${amountMinor} ${currencyCode}`;
  const digits = String(amountMinor).padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${whole}.${fraction} ${currencyCode}`;
}

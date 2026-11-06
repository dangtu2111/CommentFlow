/**
 * SĐT: chuẩn hóa về E.164 (`+84912345678`) và che giữa khi hiển thị (docs/13 — không log/hiện SĐT thô, nguyên tắc #6).
 * Thuần, không phụ thuộc gì để test được. Số Việt Nam nhận cả dạng 0xxxxxxxxx / 84xxxxxxxxx / +84…; số nước khác phải có `+`.
 */

/** Di động Việt Nam: 9 số sau mã nước, số đầu 3/5/7/8/9 (đầu 02 là máy bàn, không nhận SMS). */
const VN_NATIONAL = /^[35789]\d{8}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizePhoneE164(input: string): string | null {
  const raw = input.trim();
  // Chỉ cho ký tự thường gặp khi gõ SĐT; mọi thứ khác (chữ, dấu chấm phẩy…) là không hợp lệ.
  if (raw === '' || raw.length > 24 || !/^[\d\s().+-]+$/.test(raw)) return null;
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (hasPlus) {
    if (digits.startsWith('84')) {
      // "+84(0)912…": bỏ số 0 trung gian.
      const national = digits.slice(2).replace(/^0/, '');
      return VN_NATIONAL.test(national) ? `+84${national}` : null;
    }
    const e164 = `+${digits}`;
    return E164.test(e164) ? e164 : null;
  }
  if (digits.startsWith('0')) {
    const national = digits.slice(1);
    return VN_NATIONAL.test(national) ? `+84${national}` : null;
  }
  if (digits.startsWith('84')) {
    const national = digits.slice(2);
    return VN_NATIONAL.test(national) ? `+84${national}` : null;
  }
  return null;
}

/** `+84912345678` → `+849 ••• ••• 678`. Không hợp lệ/rỗng → chuỗi rỗng. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164 || !/^\+\d{8,15}$/.test(e164)) return '';
  return `${e164.slice(0, 4)} ••• ••• ${e164.slice(-3)}`;
}

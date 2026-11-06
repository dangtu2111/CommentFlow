/**
 * Văn bản ĐÃ che thông tin cá nhân. Kiểu "gắn nhãn" để trình biên dịch buộc mọi đường gửi dữ liệu
 * sang LLM/Langfuse phải đi qua `maskPii` (nguyên tắc bất biến #6).
 */
export type MaskedText = string & { readonly __brand: 'MaskedText' };

// Lookbehind chống thời gian chạy bậc hai trên dãy dài không có "@" (cùng cách guard-money.ts).
const EMAIL = /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Di động Việt Nam: đầu 0 hoặc +84/84, rồi đầu số 3/5/7/8/9, tổng 9 chữ số sau đầu; cho phép . - hoặc khoảng trắng.
const VN_MOBILE = /(?<![\d+])(?:\+?84|0)[\s.-]?[35789]\d(?:[\s.-]?\d){7}(?!\d)/g;

/**
 * Che email và số điện thoại di động Việt Nam. Bản tối thiểu của giai đoạn khung:
 * chưa che số máy bàn, tên riêng, địa chỉ (làm ở giai đoạn pipeline AI).
 */
export function maskPii(text: string): MaskedText {
  return text.replace(EMAIL, '[email]').replace(VN_MOBILE, '[sđt]') as MaskedText;
}

/** Liên hệ lấy từ văn bản GỐC (chưa che) để lưu Khách tiềm năng — dữ liệu nhạy cảm, không log. */
export interface ExtractedContacts {
  /** SĐT chuẩn hóa dạng `0xxxxxxxxx`, bỏ trùng, giữ thứ tự xuất hiện. */
  readonly phones: readonly string[];
  /** Email chữ thường, bỏ trùng, giữ thứ tự xuất hiện. */
  readonly emails: readonly string[];
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('84') ? `0${digits.slice(2)}` : digits;
}

function uniqueMatches(
  text: string,
  pattern: RegExp,
  normalize: (raw: string) => string,
): string[] {
  return [...new Set([...text.matchAll(pattern)].map((m) => normalize(m[0])))];
}

/**
 * Lấy SĐT và email từ văn bản gốc bằng CÙNG regex với `maskPii` (không lệch: cái gì bị che thì
 * cũng được lấy). Gọi TRƯỚC khi che (FR-033); kết quả chỉ đi tới nơi lưu Khách tiềm năng.
 */
export function extractPii(text: string): ExtractedContacts {
  return {
    phones: uniqueMatches(text, VN_MOBILE, normalizePhone),
    emails: uniqueMatches(text, EMAIL, (raw) => raw.toLowerCase()),
  };
}

/**
 * Đánh dấu một chuỗi CỐ ĐỊNH (ví dụ prompt hệ thống) là đã che, không qua `maskPii`.
 * Tên có "unsafe" để dễ tìm khi rà soát: tuyệt đối không dùng cho nội dung do khách/Page tạo.
 */
export function unsafeMarkMasked(text: string): MaskedText {
  return text as MaskedText;
}

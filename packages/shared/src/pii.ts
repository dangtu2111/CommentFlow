/**
 * Văn bản ĐÃ che thông tin cá nhân. Kiểu "gắn nhãn" để trình biên dịch buộc mọi đường gửi dữ liệu
 * sang LLM/Langfuse phải đi qua `maskPii` (nguyên tắc bất biến #6).
 */
export type MaskedText = string & { readonly __brand: 'MaskedText' };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Di động Việt Nam: đầu 0 hoặc +84/84, rồi đầu số 3/5/7/8/9, tổng 9 chữ số sau đầu; cho phép . - hoặc khoảng trắng.
const VN_MOBILE = /(?<![\d+])(?:\+?84|0)[\s.-]?[35789]\d(?:[\s.-]?\d){7}(?!\d)/g;

/**
 * Che email và số điện thoại di động Việt Nam. Bản tối thiểu của giai đoạn khung:
 * chưa che số máy bàn, tên riêng, địa chỉ (làm ở giai đoạn pipeline AI).
 */
export function maskPii(text: string): MaskedText {
  return text.replace(EMAIL, '[email]').replace(VN_MOBILE, '[sđt]') as MaskedText;
}

/**
 * Đánh dấu một chuỗi CỐ ĐỊNH (ví dụ prompt hệ thống) là đã che, không qua `maskPii`.
 * Tên có "unsafe" để dễ tìm khi rà soát: tuyệt đối không dùng cho nội dung do khách/Page tạo.
 */
export function unsafeMarkMasked(text: string): MaskedText {
  return text as MaskedText;
}

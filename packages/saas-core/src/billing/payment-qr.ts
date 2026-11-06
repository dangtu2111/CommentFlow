import { buildVietQrPayload, type VietQrInput } from '@flow/shared';
import QRCode from 'qrcode';

export type PaymentQr = {
  /** Chuỗi VietQR (để hiển thị/sao chép nếu khách không quét được). */
  payload: string;
  /** Ảnh PNG dạng data URL — gắn vào `<img>`, không cần `dangerouslySetInnerHTML`, không gọi dịch vụ ngoài. */
  dataUrl: string;
};

/**
 * Vẽ QR chuyển khoản (FR-091): payload dựng bởi `buildVietQrPayload` (kiểm số tiền/mã/tài khoản, ném `AppError` khi sai),
 * ảnh vẽ tại chỗ bằng `qrcode` — không gửi số tài khoản/số tiền cho dịch vụ nào. Mức sửa lỗi M, lề 2 ô (app ngân hàng quét tốt).
 */
export async function renderPaymentQr(input: VietQrInput): Promise<PaymentQr> {
  const payload = buildVietQrPayload(input);
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
  });
  return { payload, dataUrl };
}

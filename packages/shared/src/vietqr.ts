import { z } from 'zod';
import { AppError } from './errors';
import { INVOICE_MAX_AMOUNT_VND, isTransferCode } from './invoice';

/**
 * QR chuyển khoản VietQR (FR-091, US-061, UF-9): phần THUẦN, không mạng, không DB. Dựng chuỗi EMVCo theo đặc tả VietQR
 * của NAPAS (chuyển nhanh 24/7 đến tài khoản): người dùng quét bằng app ngân hàng và số tiền + nội dung (mã chuyển
 * khoản của hóa đơn) được điền sẵn. Số tiền/mã luôn lấy từ hóa đơn trong DB (nguyên tắc #4), không từ AI hay form.
 * Tài khoản nhận tiền là tài nguyên ngoài (docs/CAN_BAN_CUNG_CAP): cấu hình qua biến môi trường, xem `parsePaymentReceiver`.
 */

const NAPAS_GUID = 'A000000727';
const SERVICE_TO_ACCOUNT = 'QRIBFTTA';
const CURRENCY_VND = '704';

export type PaymentReceiver = {
  /** Mã BIN ngân hàng nhận (6 chữ số, danh mục của NAPAS). */
  bankBin: string;
  accountNumber: string;
  /** Tên chủ tài khoản — chỉ để HIỂN THỊ cho người chuyển đối chiếu; không nằm trong chuỗi QR. */
  accountName: string;
};

const receiverSchema = z.object({
  bankBin: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/),
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{6,19}$/),
  accountName: z.string().trim().min(1).max(100),
});

/** Kiểm cấu hình tài khoản nhận tiền (ranh giới vào): sai → `AppError`, không đoán, không in giá trị ra thông báo lỗi. */
export function parsePaymentReceiver(input: unknown): PaymentReceiver {
  const parsed = receiverSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Cấu hình tài khoản nhận tiền không hợp lệ.');
  }
  return parsed.data;
}

/** CRC-16/CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF) theo EMVCo; trả 4 ký tự hex HOA. */
export function crc16Ccitt(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Một trường TLV: id 2 chữ số + độ dài 2 chữ số + giá trị. Mọi giá trị ở đây đã được kiểm (chữ số/ký tự hoa, tối đa
 * vài chục ký tự, thuần ASCII) nên không bao giờ vượt 99.
 */
function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

export type VietQrInput = {
  receiver: PaymentReceiver;
  amountVnd: number;
  /** Mã chuyển khoản của hóa đơn (`core.invoices.transfer_code`) — đặt vào nội dung chuyển khoản. */
  transferCode: string;
};

/** Dựng chuỗi VietQR động (có số tiền). Đầu vào sai → `AppError`. Cùng đầu vào → cùng chuỗi. */
export function buildVietQrPayload(input: VietQrInput): string {
  const receiver = parsePaymentReceiver(input.receiver);
  if (
    !Number.isInteger(input.amountVnd) ||
    input.amountVnd < 1 ||
    input.amountVnd > INVOICE_MAX_AMOUNT_VND
  ) {
    throw new AppError('VALIDATION_FAILED', 'Số tiền QR không hợp lệ.');
  }
  if (!isTransferCode(input.transferCode)) {
    throw new AppError('VALIDATION_FAILED', 'Mã chuyển khoản không hợp lệ.');
  }
  const beneficiary = tlv('00', receiver.bankBin) + tlv('01', receiver.accountNumber);
  const merchant = tlv('00', NAPAS_GUID) + tlv('01', beneficiary) + tlv('02', SERVICE_TO_ACCOUNT);
  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchant) +
    tlv('53', CURRENCY_VND) +
    tlv('54', String(input.amountVnd)) +
    tlv('58', 'VN') +
    tlv('62', tlv('08', input.transferCode)) +
    '6304';
  return body + crc16Ccitt(body);
}

/** Tách chuỗi TLV phẳng thành bảng id → giá trị (dùng cho test và kiểm tra payload); cắt cụt/sai độ dài → `AppError`. */
export function parseTlv(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  let pos = 0;
  while (pos < text.length) {
    const id = text.slice(pos, pos + 2);
    const length = Number(text.slice(pos + 2, pos + 4));
    if (id.length < 2 || !Number.isInteger(length) || pos + 4 + length > text.length) {
      throw new AppError('VALIDATION_FAILED', 'Chuỗi TLV không hợp lệ.');
    }
    fields.set(id, text.slice(pos + 4, pos + 4 + length));
    pos += 4 + length;
  }
  return fields;
}

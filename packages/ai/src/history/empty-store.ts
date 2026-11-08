import type { AutoSentHistoryStore } from './memory-store';

/**
 * Store lịch sử "AI đã gửi" khi CHƯA có bảng thật (gap `AI-SENT-HISTORY-DB`: cần cổng tự gửi GĐ4 + migration cột đánh dấu sai).
 * Không phải bản giả: không lưu, không bịa dữ liệu — luôn trống, `markWrong` luôn `not_found`, nên trang hiện trạng thái trống trung thực
 * (chủ dự án chốt 08/11: không bản trong bộ nhớ chạy khi vận hành). Khi có bảng, thay bằng store DB ở `aiSentHistory()`.
 */
export function createEmptyHistoryStore(): AutoSentHistoryStore {
  return {
    async list() {
      return { items: [], total: 0 };
    },
    async all() {
      return [];
    },
    async markWrong() {
      return { ok: false, code: 'not_found' };
    },
  };
}

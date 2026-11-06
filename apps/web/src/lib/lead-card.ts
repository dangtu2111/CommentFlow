import type { LeadStage } from '@flow/shared';

export type LeadTone = 'primary' | 'secondary' | 'tertiary' | 'neutral' | 'strong' | 'error';

/**
 * Mô hình thẻ khách trên bảng Kanban — thuần dữ liệu hiển thị. Thẻ thật (từ `LeadRow`) chỉ điền các trường có
 * thật; thẻ mẫu `[MẪU]` (lib/leads-sample.ts) điền thêm sản phẩm/giá/ghi chú CSKH như HTML Stitch.
 */
export type LeadCardModel = {
  id: string;
  stage: LeadStage;
  initials: string;
  avatarTone: LeadTone;
  name: string;
  verified?: boolean;
  /** Kênh + chấm màu (nền tảng). */
  channel?: { label: string; dot: 'primary' | 'secondary' | 'outline' };
  badge?: { text: string; tone: LeadTone };
  phone: string | null;
  phoneNote?: { text: string; tone: 'primary' | 'muted' };
  phoneActions?: boolean;
  product?: {
    title: string;
    price?: string;
    meta?: string;
    place?: string;
    note?: string;
    callback?: string;
    quote?: string;
    quoteTone?: 'normal' | 'error';
    extra?: string;
  };
  origin?: string;
  time: string;
  assignee?: string;
  claim?: boolean;
  muted?: boolean;
  /** Thẻ đang mở ở ngăn chi tiết (đổ bóng đậm). */
  focused?: boolean;
};

/** Tông màu chấm tiêu đề cột và huy hiệu số đếm theo giai đoạn (khớp HTML: Mới/Đang tư vấn/Đã chốt/Hủy). */
export const STAGE_TONE: Record<LeadStage, { dot: string; count: string }> = {
  new: { dot: 'bg-primary-container', count: 'bg-primary-container text-on-primary' },
  contacted: { dot: 'bg-tertiary-container', count: 'bg-tertiary-fixed text-on-tertiary-fixed' },
  won: { dot: 'bg-primary', count: 'bg-primary-container text-on-primary' },
  lost: { dot: 'bg-error', count: 'bg-error-container text-on-error-container' },
};

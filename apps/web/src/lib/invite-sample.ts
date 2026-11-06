/**
 * Dữ liệu MẪU cho trang nhận lời mời (`design/stitch/accept-invite.html`), chỉ dùng ở route `/dev/ui/auth-invite` và
 * bản dev (`showSampleData()`). Mọi tên/email/kênh đều gắn nhãn "[MẪU]"; không phải khách hay thành viên thật, và
 * KHÔNG có token (lời mời thật không bao giờ hiện token hay email).
 */
export type InviteChannelSample = {
  name: string;
  kind: string;
  icon: 'forum' | 'photo_camera' | 'live_tv';
  /** Màu chữ biểu tượng (class Tailwind của HTML Stitch). */
  tint: string;
};

export type InviteSample = {
  workspaceIndustry: string;
  inviterName: string;
  inviterRole: string;
  inviterEmail: string;
  recipientName: string;
  recipientEmail: string;
  recipientInitials: string;
  channels: InviteChannelSample[];
};

export const INVITE_SAMPLE: InviteSample = {
  workspaceIndustry: '[MẪU] Thời trang nữ & phụ kiện',
  inviterName: '[MẪU] Nguyễn Mai Linh',
  inviterRole: 'Owner',
  inviterEmail: '[MẪU] chu-shop@example.test',
  recipientName: '[MẪU] Trần Thu Hà',
  recipientEmail: '[MẪU] nhan-vien@example.test',
  recipientInitials: 'TH',
  channels: [
    {
      name: '[MẪU] Fanpage mẫu',
      kind: 'Facebook',
      icon: 'forum',
      tint: 'bg-[#1877F2]/10 text-[#1877F2]',
    },
    {
      name: '[MẪU] @shop.mau',
      kind: 'Instagram',
      icon: 'photo_camera',
      tint: 'bg-[#E1306C]/10 text-[#E1306C]',
    },
    {
      name: '[MẪU] Kênh TikTok mẫu',
      kind: 'TikTok',
      icon: 'live_tv',
      tint: 'bg-on-surface/10 text-on-surface',
    },
  ],
};

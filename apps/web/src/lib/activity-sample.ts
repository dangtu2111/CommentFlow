/**
 * DỮ LIỆU MẪU `[MẪU]` cho Nhật ký hoạt động, chép từ design/stitch/activity-log.html: số liệu 4 thẻ KPI, ngăn
 * kiểm tra sự kiện (quy tắc kích hoạt, vết Meta Graph). Chỉ hiện khi `showSampleData()`/trang `/dev/ui/activity`.
 * Không bao giờ là số liệu thật.
 */

export const ACTIVITY_KPI_SAMPLE = {
  total: '1.428',
  totalDelta: '+12% vs hôm qua',
  totalPct: 78,
  ai: '942',
  aiShare: '65.9% khối lượng',
  aiBreakdown: 'Tự gửi 684 • Ẩn SĐT 216 • Gắn nhãn 42',
  human: '486',
  humanNote: '4 CSKH hoạt động',
  humanBreakdown: 'Duyệt gửi 310 • Chỉnh câu 144 • Sửa KB 32',
  reliability: '99.6%',
  reliabilityBadge: '5 lỗi Meta API',
  latency: 'Thời gian phản hồi TB: 280ms',
  matches: '216',
} as const;

export const ACTIVITY_INSPECTOR_SAMPLE = {
  code: 'LOG-98241',
  exactTime: '15:42:08.412 • 28/10/2025',
  orchestrator: 'AI Spark v7.3 (Rule Engine)',
  channel: 'FB: An Nhiên Store',
  commentId: 'fb_cmt_982410294',
  rule: '#SPAM-01',
  ruleText:
    '“Chặn cướp khách: Tự động ẩn bình luận chứa số điện thoại & đồng thời đẩy vào Khách tiềm năng (CRM)”.',
  traceRequest: 'POST https://graph.facebook.com/v19.0/fb_cmt_982410294/',
  traceBody: '{ "is_hidden": true }',
  traceResponse: '➔ Response: 200 OK (Latency: 240ms)',
  traceResult: '{ "success": true, "trace_id": "MTA-8931a" }',
  leadCode: 'L-8942',
  total: '1.428',
  pages: 58,
} as const;

export const ACTIVITY_FILTER_SAMPLE = {
  search: 'fb_cmt_98241',
  channels: ['FB: An Nhiên Store', 'IG: @annhien.official', 'TikTok: An Nhiên'],
} as const;

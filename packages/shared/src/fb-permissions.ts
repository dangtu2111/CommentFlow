/**
 * Quyền Facebook sản phẩm CẦN để chạy đủ chức năng (FR-010/012; docs/12 §1) và cách đánh giá "đủ chưa". Thuần, không gọi mạng.
 * Quyền ĐÃ CẤP lấy từ Meta (`debug_token`), không phải quyền ĐÃ XIN: người dùng có thể bỏ chọn một quyền ở hộp thoại Meta.
 */
export const FB_PERMISSION_FEATURES = ['webhook', 'read', 'reply'] as const;
export type FbPermissionFeature = (typeof FB_PERMISSION_FEATURES)[number];

/**
 * Quyền bắt buộc theo tính năng: `webhook` = đăng ký nhận bình luận mới (`subscribed_apps`); `read` = đọc bài/bình luận của khách;
 * `reply` = trả lời và ẩn bình luận. `pages_show_list` chỉ cần ở bước liệt kê Page (token người dùng), không bắt buộc ở token Page.
 */
export const FB_REQUIRED_PERMISSIONS = [
  { permission: 'pages_manage_metadata', feature: 'webhook' },
  { permission: 'pages_read_engagement', feature: 'read' },
  { permission: 'pages_read_user_content', feature: 'read' },
  { permission: 'pages_manage_engagement', feature: 'reply' },
] as const satisfies ReadonlyArray<{ permission: string; feature: FbPermissionFeature }>;

export type FbPermissionReport = {
  sufficient: boolean;
  /** Quyền đã cấp (sạch, không trùng, theo thứ tự chữ cái). */
  granted: string[];
  /** Quyền bắt buộc còn thiếu. */
  missing: string[];
  /** Tính năng bị ảnh hưởng bởi quyền thiếu (không trùng). */
  missingFeatures: FbPermissionFeature[];
};

export function evaluateFbPermissions(granted: readonly string[]): FbPermissionReport {
  const clean = [...new Set(granted.filter((name) => name !== ''))].sort();
  const have = new Set(clean);
  const lacking = FB_REQUIRED_PERMISSIONS.filter((item) => !have.has(item.permission));
  return {
    sufficient: lacking.length === 0,
    granted: clean,
    missing: lacking.map((item) => item.permission),
    missingFeatures: [...new Set(lacking.map((item) => item.feature))],
  };
}

/**
 * Quyền áp cho MỘT Page: `scopes` toàn token + `granular_scopes` (mỗi quyền kèm danh sách Page được cấp). Quyền có danh sách mục tiêu chỉ tính khi
 * `targetId` nằm trong đó; quyền không có danh sách tính cho mọi Page.
 */
export function grantedScopesForTarget(
  scopes: readonly string[],
  granular:
    | ReadonlyArray<{ scope: string; target_ids?: readonly string[] | undefined }>
    | undefined,
  targetId: string,
): string[] {
  const targeted = new Map<string, readonly string[]>();
  for (const entry of granular ?? []) {
    if (entry.target_ids && entry.target_ids.length > 0)
      targeted.set(entry.scope, entry.target_ids);
  }
  return scopes.filter((scope) => {
    const targets = targeted.get(scope);
    return targets === undefined || targets.includes(targetId);
  });
}

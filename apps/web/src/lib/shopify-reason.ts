/**
 * Ánh xạ mã lý do của lần đồng bộ Shopify (`last_sync_summary.reason`, ví dụ `exchange:shopify_invalid_credentials:invalid_client`)
 * sang khóa thông điệp giải thích VÌ SAO cho Owner. Thuần; mã do worker ghi (đã lọc ký tự, không chứa bí mật).
 */
export type ShopifyReasonKey =
  | 'cannotDecrypt'
  | 'invalidClient'
  | 'exchangeRejected'
  | 'notPermitted'
  | 'catalogDenied'
  | 'rateLimited'
  | 'temporary';

export function shopifyReasonKey(reason: string | undefined): ShopifyReasonKey | null {
  if (!reason) return null;
  if (reason === 'decrypt_failed') return 'cannotDecrypt';
  if (reason.includes('RATE_LIMIT')) return 'rateLimited';
  if (reason.startsWith('exchange:')) {
    if (reason.includes('not_permitted')) return 'notPermitted';
    if (reason.includes('invalid_client')) return 'invalidClient';
    if (reason.includes('invalid_credentials')) return 'exchangeRejected';
    return 'temporary';
  }
  if (reason.startsWith('catalog:')) {
    // Token đổi được (Client ID/secret ĐÚNG) nhưng Shopify từ chối khi đọc: thiếu quyền (ACCESS_DENIED/403), token bị từ chối (401).
    return /access_denied|forbidden|unauthorized|TOKEN_EXPIRED|PERMISSION/.test(reason)
      ? 'catalogDenied'
      : 'temporary';
  }
  return null;
}

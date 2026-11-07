import { z } from 'zod';

export type DisconnectSession = { workspaceId: string; userId: string };
export type DisconnectResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'unavailable' };

export type DisconnectDeps = {
  /** Gọi `cf.clear_channel_token` trong `withActor` (DB tự kiểm Owner, xóa token, đặt `revoked`, ghi nhật ký). */
  clear: (session: DisconnectSession, channelId: string) => Promise<void>;
  warn: (event: { event: string; reason: string }) => void;
};

const codeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;

/**
 * Owner ngắt kết nối MỘT kênh. Id kênh từ form chỉ là lựa chọn (kiểm uuid); quyền do DB quyết định (RLS + hàm DEFINER
 * chỉ Owner), nên ở đây chỉ dịch mã lỗi. Không log id kênh/nội dung lỗi (có thể chứa token).
 */
export function createDisconnectChannelAction(deps: DisconnectDeps) {
  return async function disconnectChannel(
    session: DisconnectSession,
    channelId: unknown,
  ): Promise<DisconnectResult> {
    if (!z.uuid().safeParse(channelId).success) return { ok: false, reason: 'not_found' };
    try {
      await deps.clear(session, channelId as string);
      return { ok: true };
    } catch (error) {
      const code = codeOf(error);
      if (code === 'P0002') return { ok: false, reason: 'not_found' };
      if (code === '42501') return { ok: false, reason: 'forbidden' };
      deps.warn({ event: 'channel_disconnect_failed', reason: code ?? 'unknown' });
      return { ok: false, reason: 'unavailable' };
    }
  };
}

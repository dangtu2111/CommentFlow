import { type ActionName, connectorCapabilitiesSchema } from './capabilities';
import { PLATFORM_ERROR_CODES } from './errors';
import { PLATFORMS, type PlatformConnector } from './types';

/** Hành động → phương thức tương ứng trên connector (`hide` và `unhide` cùng dùng `setHidden`). */
const METHOD_OF: Record<ActionName, 'reply' | 'setHidden' | 'privateReply' | 'sendMessage'> = {
  reply: 'reply',
  hide: 'setHidden',
  unhide: 'setHidden',
  privateReply: 'privateReply',
  sendMessage: 'sendMessage',
};

/**
 * Hợp đồng mà MỌI connector phải thỏa (dùng trong test của từng connector). Trả danh sách vi phạm (rỗng = đạt):
 *  (a) `capabilities` đúng schema; (b) phương thức có mặt ⇔ hành động khai báo `supported` (thiếu `setHidden` ⇒ UI ẩn
 *  nút Ẩn, nên mã không được còn gọi được nó); (c) `mapError` luôn trả một trong 5 mã chuẩn.
 */
export function checkConnectorContract(connector: PlatformConnector): string[] {
  const violations: string[] = [];

  if (!PLATFORMS.includes(connector.platform))
    violations.push(`platform lạ: ${String(connector.platform)}`);

  const parsed = connectorCapabilitiesSchema.safeParse(connector.capabilities);
  if (!parsed.success) {
    violations.push(
      `capabilities không hợp lệ: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  } else {
    const present = (method: (typeof METHOD_OF)[ActionName]) =>
      typeof connector[method] === 'function';
    for (const action of Object.keys(METHOD_OF) as ActionName[]) {
      const method = METHOD_OF[action];
      const supported = parsed.data[action].supported;
      if (supported && !present(method)) {
        violations.push(`khai báo ${action} được hỗ trợ nhưng thiếu phương thức ${method}`);
      }
    }
    // Phương thức dùng chung (setHidden): chỉ vi phạm khi CẢ hide và unhide đều không hỗ trợ mà vẫn có phương thức.
    for (const method of ['reply', 'setHidden', 'privateReply', 'sendMessage'] as const) {
      const actions = (Object.keys(METHOD_OF) as ActionName[]).filter(
        (a) => METHOD_OF[a] === method,
      );
      const anySupported = actions.some((a) => parsed.data[a].supported);
      if (!anySupported && present(method)) {
        violations.push(
          `khai báo ${actions.join('/')} không hỗ trợ nhưng vẫn có phương thức ${method}`,
        );
      }
    }
  }

  for (const input of [new Error('x'), 'chuỗi', null, undefined, 42, { code: 190 }]) {
    const code = connector.mapError(input)?.code;
    if (!(PLATFORM_ERROR_CODES as readonly unknown[]).includes(code)) {
      violations.push(
        `mapError trả mã ngoài danh sách chuẩn (${String(code)}) cho đầu vào ${JSON.stringify(input)}`,
      );
      break;
    }
  }
  return violations;
}

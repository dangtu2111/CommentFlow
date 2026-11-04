import type { ActionName, ConnectorCapabilities } from '../capabilities';
import { DECLARED_CAPABILITIES } from '../declarations';
import { isPlatformError, PlatformError } from '../errors';
import type { NormalizedComment, NormalizedEvent, Platform, PlatformConnector } from '../types';

export type FakeCall = { method: string; args: unknown[] };

/**
 * Connector GIẢ cho test của pipeline/giao diện (không gọi mạng): chỉ có phương thức ứng với hành động khai báo
 * `supported` (đúng hợp đồng), ghi lại lệnh gọi trong `calls`. Mặc định dùng khai báo của nền tảng.
 */
export function createFakeConnector(
  platform: Platform,
  options: { capabilities?: ConnectorCapabilities } = {},
): PlatformConnector & { readonly calls: FakeCall[] } {
  const capabilities = options.capabilities ?? DECLARED_CAPABILITIES[platform];
  const calls: FakeCall[] = [];
  let counter = 0;
  const nextId = (): string => `${platform}-fake-${++counter}`;
  const supports = (action: ActionName): boolean => capabilities[action].supported;

  const connector: PlatformConnector & { calls: FakeCall[] } = {
    platform,
    capabilities,
    calls,
    async verifyWebhook() {
      return true;
    },
    parseWebhook(): NormalizedEvent[] {
      return [];
    },
    async fetchComments(...args): Promise<NormalizedComment[]> {
      calls.push({ method: 'fetchComments', args });
      return [];
    },
    async reply(...args) {
      calls.push({ method: 'reply', args });
      return { externalId: nextId() };
    },
    mapError(error: unknown): PlatformError {
      return isPlatformError(error) ? error : new PlatformError('UNKNOWN', { cause: error });
    },
  };
  if (supports('hide') || supports('unhide')) {
    connector.setHidden = async (...args) => {
      calls.push({ method: 'setHidden', args });
    };
  }
  if (supports('privateReply')) {
    connector.privateReply = async (...args) => {
      calls.push({ method: 'privateReply', args });
    };
  }
  if (supports('sendMessage')) {
    connector.sendMessage = async (...args) => {
      calls.push({ method: 'sendMessage', args });
      return { externalId: nextId() };
    };
  }
  return connector;
}

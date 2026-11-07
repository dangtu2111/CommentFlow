import { describe, expect, it } from 'vitest';
import { parseReembedArgs } from './kb-reembed-args';

const WS = '11111111-1111-4111-8111-111111111111';

describe('FR-133 CLI kb:reembed — đối số', () => {
  it('count/enqueue + workspaceId UUID; bỏ dấu -- do pnpm chèn', () => {
    expect(parseReembedArgs(['--', 'count', WS])).toEqual({ action: 'count', workspaceId: WS });
    expect(parseReembedArgs(['enqueue', WS])).toEqual({ action: 'enqueue', workspaceId: WS });
  });

  it('thiếu/thừa đối số, hành động lạ, id không phải UUID → lỗi có hướng dẫn', () => {
    expect(() => parseReembedArgs([])).toThrow('Cách dùng');
    expect(() => parseReembedArgs(['count'])).toThrow('Cách dùng');
    expect(() => parseReembedArgs(['count', WS, 'thừa'])).toThrow('Cách dùng');
    expect(() => parseReembedArgs(['xoa', WS])).toThrow('Cách dùng');
    expect(() => parseReembedArgs(['count', 'khong-phai-uuid'])).toThrow('UUID');
  });
});

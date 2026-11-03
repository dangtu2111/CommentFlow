import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { COMMON_PASSWORDS } from './common-passwords';
import { createPasswordPolicy, type PasswordPolicyWarning } from './password-policy';

/** Mật khẩu thử mạnh, mới mỗi lần gọi (không chứa trong danh sách phổ biến, không có trong HIBP thật). */
const fresh = () => `Mk-${randomUUID()}-Aa1!`;
const sha1 = (text: string) => createHash('sha1').update(text, 'utf8').digest('hex').toUpperCase();

/** Phản hồi giả của HIBP: có dòng khớp (nếu có), dòng thật khác và dòng đệm số lần = 0. */
function rangeResponse(password: string | null, count = 12345): Response {
  const lines = ['0018A45C4D1DEF81644B54AB7F969B88D65:3', '00D4F6E8FA6EECAD2A3AA415EEC418D38EC:0'];
  if (password) lines.splice(1, 0, `${sha1(password).slice(5)}:${count}`);
  return new Response(lines.join('\r\n'), { status: 200 });
}

describe('danh sách cục bộ', () => {
  it('có dữ liệu và các mẫu phổ biến dài từ 10 ký tự bị từ chối, không phân biệt hoa/thường', async () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(1000);
    const policy = createPasswordPolicy({ pwnedEnabled: false });
    for (const weak of ['1234567890', 'QWERTYUIOP', 'Charlie123', '1q2w3e4r5t', 'Basketball']) {
      expect(await policy.check(weak), weak).toEqual({ ok: false, reason: 'common' });
    }
  });

  it('mật khẩu mạnh qua (khi tắt HIBP)', async () => {
    const policy = createPasswordPolicy({ pwnedEnabled: false });
    expect(await policy.check(fresh())).toEqual({ ok: true });
  });

  it('mật khẩu phổ biến bị chặn mà KHÔNG gọi mạng', async () => {
    const fetchImpl = vi.fn();
    const policy = createPasswordPolicy({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await policy.check('qwertyuiop')).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('Have I Been Pwned (k-anonymity)', () => {
  it('chỉ gửi 5 ký tự đầu SHA-1 trong URL, kèm Add-Padding: true; mật khẩu và phần còn lại của băm không rời máy', async () => {
    const password = fresh();
    const fetchImpl = vi.fn().mockResolvedValue(rangeResponse(null));
    const policy = createPasswordPolicy({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await policy.check(password)).toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1(password).slice(0, 5)}`);
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true');
    const sent = JSON.stringify([url, init.headers, init.body ?? null]);
    expect(sent).not.toContain(password);
    expect(sent).not.toContain(sha1(password).slice(5, 15)); // không có phần sau tiền tố
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
  });

  it('hậu tố có trong phản hồi với số lần > 0 → pwned', async () => {
    const password = fresh();
    const policy = createPasswordPolicy({
      fetchImpl: vi.fn().mockResolvedValue(rangeResponse(password)) as unknown as typeof fetch,
    });
    expect(await policy.check(password)).toEqual({ ok: false, reason: 'pwned' });
  });

  it('dòng đệm (số lần = 0) không bị tính là bị lộ', async () => {
    const password = fresh();
    const padded = new Response(
      `${sha1(password).slice(5)}:0\r\n0018A45C4D1DEF81644B54AB7F969B88D65:2`,
    );
    const policy = createPasswordPolicy({
      fetchImpl: vi.fn().mockResolvedValue(padded) as unknown as typeof fetch,
    });
    expect(await policy.check(password)).toEqual({ ok: true });
  });

  it('dòng rác trong phản hồi không làm văng lỗi', async () => {
    const garbage = new Response('abc\r\n:::\r\nXYZ:notanumber\r\n');
    const policy = createPasswordPolicy({
      fetchImpl: vi.fn().mockResolvedValue(garbage) as unknown as typeof fetch,
    });
    expect(await policy.check(fresh())).toEqual({ ok: true });
  });

  it('dùng bộ nhớ đệm theo tiền tố: lần gọi thứ hai cùng tiền tố không gọi lại; hết hạn thì gọi lại', async () => {
    let now = 1_000_000;
    const fetchImpl = vi.fn().mockImplementation(async () => rangeResponse(null));
    const policy = createPasswordPolicy({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
    });
    const cached = fresh();
    await policy.check(cached);
    await policy.check(cached);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 11 * 60 * 1000;
    await policy.check(cached);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('khi HIBP không dùng được → CHO QUA + cảnh báo không lộ gì', () => {
  const warnings = () => {
    const list: PasswordPolicyWarning[] = [];
    return { list, onWarn: (w: PasswordPolicyWarning) => list.push(w) };
  };
  const password = fresh();

  it('timeout (đặt ngưỡng nhỏ, fetch treo) → ok + cảnh báo timeout', async () => {
    const w = warnings();
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const policy = createPasswordPolicy({ fetchImpl: hanging, timeoutMs: 50, onWarn: w.onWarn });
    expect(await policy.check(password)).toEqual({ ok: true });
    expect(w.list).toEqual([{ event: 'pwned_check_unavailable', reason: 'timeout' }]);
  });

  it('HTTP 429/500 → ok + cảnh báo http', async () => {
    for (const status of [429, 500, 503]) {
      const w = warnings();
      const policy = createPasswordPolicy({
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response('lỗi', { status })) as unknown as typeof fetch,
        onWarn: w.onWarn,
      });
      expect(await policy.check(password), String(status)).toEqual({ ok: true });
      expect(w.list).toEqual([{ event: 'pwned_check_unavailable', reason: 'http' }]);
    }
  });

  it('lỗi mạng (mất kết nối, DNS) → ok + cảnh báo network', async () => {
    const w = warnings();
    const policy = createPasswordPolicy({
      fetchImpl: vi
        .fn()
        .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch,
      onWarn: w.onWarn,
    });
    expect(await policy.check(password)).toEqual({ ok: true });
    expect(w.list).toEqual([{ event: 'pwned_check_unavailable', reason: 'network' }]);
  });

  it('phản hồi quá lớn → ok + cảnh báo oversize', async () => {
    const w = warnings();
    const huge = new Response('A'.repeat(2_000_001));
    const policy = createPasswordPolicy({
      fetchImpl: vi.fn().mockResolvedValue(huge) as unknown as typeof fetch,
      onWarn: w.onWarn,
    });
    expect(await policy.check(password)).toEqual({ ok: true });
    expect(w.list).toEqual([{ event: 'pwned_check_unavailable', reason: 'oversize' }]);
  });

  it('cảnh báo KHÔNG chứa mật khẩu, băm hay tiền tố băm; lỗi không làm đổi kết quả của danh sách cục bộ', async () => {
    const w = warnings();
    const policy = createPasswordPolicy({
      fetchImpl: vi
        .fn()
        .mockRejectedValue(new Error(`boom ${password}`)) as unknown as typeof fetch,
      onWarn: w.onWarn,
    });
    await policy.check(password);
    const text = JSON.stringify(w.list);
    expect(text).not.toContain(password);
    expect(text).not.toContain(sha1(password).slice(0, 5));
    // HIBP sập thì danh sách cục bộ VẪN chặn
    expect(await policy.check('qwertyuiop')).toEqual({ ok: false, reason: 'common' });
  });
});

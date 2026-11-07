import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIXTURE_TEXT,
  DEFAULT_FIXTURE_WORKSPACE,
  fixturePageId,
  parsePushArgs,
} from './push-webhook';

describe('dev:push-webhook — tham số', () => {
  it('mặc định: Shop Thử 2, bình luận mẫu, không dọn', () => {
    expect(parsePushArgs([])).toEqual({
      ok: true,
      args: { workspace: DEFAULT_FIXTURE_WORKSPACE, text: DEFAULT_FIXTURE_TEXT, cleanup: false },
    });
  });

  it('đọc --workspace, --text, --cleanup', () => {
    expect(
      parsePushArgs(['--workspace', 'Shop A', '--text', 'ship bao nhiêu', '--cleanup']),
    ).toEqual({
      ok: true,
      args: { workspace: 'Shop A', text: 'ship bao nhiêu', cleanup: true },
    });
  });

  it('thiếu giá trị / tham số lạ → lỗi kèm cách dùng', () => {
    for (const argv of [
      ['--workspace'],
      ['--text', '--cleanup'],
      ['--workspace', '  '],
      ['--lạ'],
    ]) {
      const r = parsePushArgs(argv);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('Cách dùng');
    }
  });

  it('cắt bình luận ở 1000 ký tự', () => {
    const r = parsePushArgs(['--text', 'x'.repeat(1500)]);
    expect(r.ok && r.args.text.length).toBe(1000);
  });

  it('mã Page fixture ổn định theo workspace và không giống Page thật', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(fixturePageId(id)).toBe('fixture-page-11111111');
  });
});

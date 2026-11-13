import { describe, expect, it } from 'vitest';
import { parsePublishForm } from './publish-form';

const CH1 = '11111111-1111-4111-8111-111111111111';
const CH2 = '22222222-2222-4222-8222-222222222222';
const POST = '33333333-3333-4333-8333-333333333333';
const ZONE = 'Asia/Ho_Chi_Minh';
const NOW = new Date('2026-11-12T03:00:00Z');

function form(fields: Record<string, string | string[] | undefined>) {
  return {
    get: (name: string) => {
      const value = fields[name];
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    },
    getAll: (name: string) => {
      const value = fields[name];
      return Array.isArray(value) ? value : value === undefined ? [] : [value];
    },
  };
}

describe('parsePublishForm', () => {
  it('nháp: nhận nội dung (chuẩn hóa xuống dòng), kênh không trùng, id; KHÔNG có giờ; nội dung/kênh có thể trống', () => {
    const r = parsePublishForm(
      form({ intent: 'draft', message: 'Dòng 1\r\nDòng 2', channel: [CH1, CH1, CH2], id: POST }),
      ZONE,
      NOW,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        intent: 'draft',
        id: POST,
        message: 'Dòng 1\nDòng 2',
        channelIds: [CH1, CH2],
        productIds: [],
        mediaIds: [],
        aiNote: null,
        scheduledAt: null,
      },
    });
    expect(parsePublishForm(form({ intent: 'draft' }), ZONE, NOW)).toMatchObject({
      ok: true,
      value: { message: '', channelIds: [], id: undefined },
    });
  });

  it('lên lịch: ngày + giờ theo múi giờ cửa hàng → UTC', () => {
    const r = parsePublishForm(
      form({
        intent: 'schedule',
        message: 'Hàng mới',
        channel: CH1,
        date: '2026-11-28',
        time: '19:30',
      }),
      ZONE,
      NOW,
    );
    expect(r).toMatchObject({
      ok: true,
      value: { intent: 'schedule', scheduledAt: new Date('2026-11-28T12:30:00Z') },
    });
  });

  it('lên lịch/đăng ngay thiếu nội dung hoặc kênh → mã lỗi rõ', () => {
    expect(
      parsePublishForm(
        form({
          intent: 'schedule',
          message: '   ',
          channel: CH1,
          date: '2026-11-28',
          time: '19:30',
        }),
        ZONE,
        NOW,
      ),
    ).toEqual({ ok: false, code: 'empty_message' });
    expect(
      parsePublishForm(
        form({ intent: 'schedule', message: 'x', date: '2026-11-28', time: '19:30' }),
        ZONE,
        NOW,
      ),
    ).toEqual({ ok: false, code: 'no_channel' });
    expect(
      parsePublishForm(form({ intent: 'publish', message: '', channel: CH1 }), ZONE, NOW),
    ).toEqual({ ok: false, code: 'empty_message' });
    expect(parsePublishForm(form({ intent: 'publish', message: 'x' }), ZONE, NOW)).toEqual({
      ok: false,
      code: 'no_channel',
    });
  });

  it('lên lịch với ngày/giờ thiếu, sai, hoặc đã qua/quá 90 ngày → invalid_schedule', () => {
    const base = { intent: 'schedule', message: 'x', channel: CH1 };
    for (const extra of [
      {},
      { date: '2026-11-28' },
      { date: '2026-02-30', time: '10:00' },
      { date: '2026-11-12', time: '10:00' },
      { date: '2027-06-01', time: '10:00' },
    ]) {
      expect(
        parsePublishForm(form({ ...base, ...extra }), ZONE, NOW),
        JSON.stringify(extra),
      ).toEqual({ ok: false, code: 'invalid_schedule' });
    }
  });

  it('đăng ngay: không cần ngày giờ, scheduledAt = null', () => {
    expect(
      parsePublishForm(form({ intent: 'publish', message: 'Ngay', channel: CH1 }), ZONE, NOW),
    ).toMatchObject({ ok: true, value: { intent: 'publish', scheduledAt: null } });
  });

  it('đầu vào xấu: intent lạ, id/kênh không phải UUID, quá nhiều kênh, nội dung quá dài → invalid', () => {
    expect(parsePublishForm(form({ intent: 'hack', message: 'x' }), ZONE, NOW)).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(parsePublishForm(form({ intent: 'draft', id: 'khong-phai-uuid' }), ZONE, NOW)).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(parsePublishForm(form({ intent: 'draft', channel: ['abc'] }), ZONE, NOW)).toEqual({
      ok: false,
      code: 'invalid',
    });
    const many = Array.from(
      { length: 11 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(parsePublishForm(form({ intent: 'draft', channel: many }), ZONE, NOW)).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(
      parsePublishForm(form({ intent: 'draft', message: 'a'.repeat(63207) }), ZONE, NOW),
    ).toEqual({ ok: false, code: 'invalid' });
  });

  it('sản phẩm: bỏ trùng, giữ thứ tự (đầu = chính), tối đa 5, id sai → invalid', () => {
    const productId = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`;
    const ok = parsePublishForm(
      form({ intent: 'draft', message: 'x', product: [productId(2), productId(1), productId(2)] }),
      ZONE,
      NOW,
    );
    expect(ok).toMatchObject({ ok: true, value: { productIds: [productId(2), productId(1)] } });
    const six = [1, 2, 3, 4, 5, 6].map(productId);
    expect(parsePublishForm(form({ intent: 'draft', product: six }), ZONE, NOW)).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(parsePublishForm(form({ intent: 'draft', product: ['x'] }), ZONE, NOW)).toEqual({
      ok: false,
      code: 'invalid',
    });
  });

  it('media: bỏ trùng, giữ thứ tự, tối đa 10, id sai → invalid', () => {
    const mediaId = (n: number) =>
      `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb${String(n).padStart(2, '0')}`;
    const ok = parsePublishForm(
      form({ intent: 'draft', message: 'x', media: [mediaId(2), mediaId(1), mediaId(2)] }),
      ZONE,
      NOW,
    );
    expect(ok).toMatchObject({ ok: true, value: { mediaIds: [mediaId(2), mediaId(1)] } });
    const eleven = Array.from({ length: 11 }, (_, i) => mediaId(i));
    expect(parsePublishForm(form({ intent: 'draft', media: eleven }), ZONE, NOW)).toEqual({
      ok: false,
      code: 'invalid',
    });
    expect(parsePublishForm(form({ intent: 'draft', media: ['x'] }), ZONE, NOW)).toEqual({
      ok: false,
      code: 'invalid',
    });
  });

  it('ghi chú cho AI: chuẩn hóa xuống dòng, cắt khoảng trắng, rỗng → null, quá 1000 ký tự → invalid', () => {
    const ok = parsePublishForm(
      form({ intent: 'draft', message: 'x', aiNote: '  Ưu tiên combo\r\nNhắc đổi trả  ' }),
      ZONE,
      NOW,
    );
    expect(ok).toMatchObject({ ok: true, value: { aiNote: 'Ưu tiên combo\nNhắc đổi trả' } });
    expect(parsePublishForm(form({ intent: 'draft', aiNote: '   ' }), ZONE, NOW)).toMatchObject({
      ok: true,
      value: { aiNote: null },
    });
    expect(
      parsePublishForm(form({ intent: 'draft', aiNote: 'a'.repeat(1001) }), ZONE, NOW),
    ).toEqual({ ok: false, code: 'invalid' });
  });
});

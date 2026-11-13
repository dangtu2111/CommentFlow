import { describe, expect, it } from 'vitest';
import { parseCalendarEdit } from './calendar-edit-form';

const ID = '33333333-3333-4333-8333-333333333333';
const ZONE = 'Asia/Ho_Chi_Minh';
const NOW = new Date('2026-11-13T03:00:00Z');
const form = (fields: Record<string, string>) => ({
  get: (name: string) => fields[name] ?? null,
});

describe('parseCalendarEdit', () => {
  it('nháp: chỉ nội dung (chuẩn hóa xuống dòng), không giờ; nội dung có thể trống', () => {
    expect(
      parseCalendarEdit(form({ postId: ID, intent: 'draft', message: 'a\r\nb' }), ZONE, NOW),
    ).toEqual({ ok: true, value: { id: ID, intent: 'draft', message: 'a\nb', scheduledAt: null } });
    expect(
      parseCalendarEdit(form({ postId: ID, intent: 'draft', message: '' }), ZONE, NOW),
    ).toMatchObject({
      ok: true,
    });
  });

  it('lưu/lên lịch: ngày + giờ theo múi giờ cửa hàng → UTC', () => {
    const r = parseCalendarEdit(
      form({
        postId: ID,
        intent: 'schedule',
        message: 'Hàng mới',
        date: '2026-11-20',
        time: '09:30',
      }),
      ZONE,
      NOW,
    );
    expect(r).toMatchObject({ ok: true, value: { scheduledAt: new Date('2026-11-20T02:30:00Z') } });
  });

  it('thiếu nội dung → empty_message; giờ thiếu/sai/ngoài khoảng → invalid_schedule', () => {
    expect(
      parseCalendarEdit(
        form({ postId: ID, intent: 'save', message: '  ', date: '2026-11-20', time: '09:30' }),
        ZONE,
        NOW,
      ),
    ).toEqual({ ok: false, code: 'empty_message' });
    for (const [date, time] of [
      ['', ''],
      ['2026-11-20', '25:00'],
      ['2026-11-12', '09:00'],
      ['2027-06-01', '09:00'],
      ['2026-11-13', '10:01'],
    ] as const) {
      expect(
        parseCalendarEdit(
          form({ postId: ID, intent: 'save', message: 'x', date, time }),
          ZONE,
          NOW,
        ),
        `${date} ${time}`,
      ).toEqual({ ok: false, code: 'invalid_schedule' });
    }
  });

  it('id không phải UUID, ý định lạ, nội dung quá dài → invalid', () => {
    for (const f of [
      { postId: 'x', intent: 'draft', message: '' },
      { postId: ID, intent: 'delete', message: '' },
      { postId: ID, intent: 'draft', message: 'a'.repeat(63207) },
    ]) {
      expect(parseCalendarEdit(form(f), ZONE, NOW)).toEqual({ ok: false, code: 'invalid' });
    }
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LEAD_MAX_PER_CAPTURE,
  type LeadStage,
  maskedPhoneHint,
  normalizeLeadEmail,
  normalizeLeadPhone,
  parseLeadUpdate,
  phoneLast4,
  planLeadsFromContacts,
} from './lead-contact';

const mobile = fc
  .tuple(fc.constantFrom('3', '5', '7', '8', '9'), fc.stringMatching(/^[0-9]{8}$/))
  .map(([a, rest]) => `0${a}${rest}`);

describe('FR-082 chuẩn hóa SĐT khách tiềm năng', () => {
  it('đổi +84/84 về 0xxxxxxxxx và bỏ ký tự phân tách', () => {
    expect(normalizeLeadPhone('+84 912 345 678')).toBe('0912345678');
    expect(normalizeLeadPhone('84912345678')).toBe('0912345678');
    expect(normalizeLeadPhone('0912.345.678')).toBe('0912345678');
  });

  it('từ chối số sai độ dài hoặc đầu số không phải di động', () => {
    expect(normalizeLeadPhone('091234567')).toBeNull();
    expect(normalizeLeadPhone('09123456789')).toBeNull();
    expect(normalizeLeadPhone('0212345678')).toBeNull();
    expect(normalizeLeadPhone('')).toBeNull();
    expect(normalizeLeadPhone('abc')).toBeNull();
  });

  it('lũy đẳng: chuẩn hóa hai lần = một lần', () => {
    fc.assert(
      fc.property(mobile, (phone) => {
        const once = normalizeLeadPhone(phone);
        expect(once).toBe(phone);
        expect(normalizeLeadPhone(once as string)).toBe(once);
      }),
    );
  });

  it('dạng +84 và 0 của cùng một số cho cùng kết quả', () => {
    fc.assert(
      fc.property(mobile, (phone) => {
        expect(normalizeLeadPhone(`+84${phone.slice(1)}`)).toBe(phone);
      }),
    );
  });

  it('4 số cuối và gợi ý hiển thị không lộ phần còn lại', () => {
    expect(phoneLast4('0912345678')).toBe('5678');
    expect(maskedPhoneHint('5678')).toBe('••••••5678');
    fc.assert(
      fc.property(mobile, (phone) => {
        const hint = maskedPhoneHint(phoneLast4(phone));
        expect(hint.endsWith(phone.slice(-4))).toBe(true);
        expect(hint).not.toContain(phone.slice(0, 6));
      }),
    );
  });
});

describe('FR-082 chuẩn hóa email', () => {
  it('chữ thường, cắt khoảng trắng; từ chối sai dạng/quá dài', () => {
    expect(normalizeLeadEmail('  An@Example.COM ')).toBe('an@example.com');
    expect(normalizeLeadEmail('khong-phai-email')).toBeNull();
    expect(normalizeLeadEmail('a@b')).toBeNull();
    expect(normalizeLeadEmail(`${'a'.repeat(250)}@x.vn`)).toBeNull();
  });
});

describe('FR-082/FR-033 lập khách tiềm năng từ liên hệ đã tách', () => {
  it('không có liên hệ → không lập lead', () => {
    expect(planLeadsFromContacts({ phones: [], emails: [] })).toEqual([]);
  });

  it('mỗi SĐT một lead; email đầu gắn vào lead đầu', () => {
    const plan = planLeadsFromContacts({
      phones: ['0912345678', '0987654321'],
      emails: ['a@x.vn', 'b@x.vn'],
    });
    expect(plan).toEqual([
      { phone: '0912345678', email: 'a@x.vn' },
      { phone: '0987654321', email: null },
    ]);
  });

  it('chỉ có email → mỗi email một lead', () => {
    expect(planLeadsFromContacts({ phones: [], emails: ['a@x.vn', 'b@x.vn'] })).toEqual([
      { phone: null, email: 'a@x.vn' },
      { phone: null, email: 'b@x.vn' },
    ]);
  });

  it('bỏ liên hệ sai dạng và trùng sau chuẩn hóa', () => {
    expect(
      planLeadsFromContacts({
        phones: ['+84912345678', '0912345678', '123'],
        emails: ['A@X.vn', 'a@x.vn', 'rác'],
      }),
    ).toEqual([{ phone: '0912345678', email: 'a@x.vn' }]);
  });

  it('chặn bơm: tối đa LEAD_MAX_PER_CAPTURE lead mỗi lần, lead nào cũng có liên hệ, SĐT không trùng', () => {
    expect(LEAD_MAX_PER_CAPTURE).toBe(3);
    fc.assert(
      fc.property(
        fc.array(mobile, { maxLength: 20 }),
        fc.array(fc.emailAddress(), { maxLength: 20 }),
        (phones, emails) => {
          const plan = planLeadsFromContacts({ phones, emails });
          expect(plan.length).toBeLessThanOrEqual(LEAD_MAX_PER_CAPTURE);
          for (const lead of plan) expect(lead.phone !== null || lead.email !== null).toBe(true);
          const used = plan.flatMap((l) => (l.phone ? [l.phone] : []));
          expect(new Set(used).size).toBe(used.length);
        },
      ),
    );
  });

  it('đổi thứ tự email không đổi danh sách SĐT được lập', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(mobile, { maxLength: 3 }),
        fc.array(fc.emailAddress(), { maxLength: 4 }),
        (phones, emails) => {
          const a = planLeadsFromContacts({ phones, emails }).map((l) => l.phone);
          const b = planLeadsFromContacts({ phones, emails: [...emails].reverse() }).map(
            (l) => l.phone,
          );
          expect(a).toEqual(b);
        },
      ),
    );
  });
});

describe('FR-082 cập nhật khách tiềm năng (Kanban)', () => {
  const stages: LeadStage[] = ['new', 'contacted', 'won', 'lost'];

  it('chấp nhận giai đoạn hợp lệ, ghi chú, tên, người được giao', () => {
    for (const stage of stages) expect(parseLeadUpdate({ stage }).success).toBe(true);
    const ok = parseLeadUpdate({ name: ' Lan ', note: 'gọi lại 5h', assignedTo: null });
    expect(ok.success && ok.data).toMatchObject({
      name: 'Lan',
      note: 'gọi lại 5h',
      assignedTo: null,
    });
  });

  it('từ chối giai đoạn lạ, ghi chú quá dài, id người giao sai, trường thừa, hoặc rỗng', () => {
    expect(parseLeadUpdate({ stage: 'archived' }).success).toBe(false);
    expect(parseLeadUpdate({ note: 'x'.repeat(501) }).success).toBe(false);
    expect(parseLeadUpdate({ assignedTo: 'không-phải-uuid' }).success).toBe(false);
    expect(parseLeadUpdate({ phone: '0912345678' }).success).toBe(false);
    expect(parseLeadUpdate({}).success).toBe(false);
  });
});
